import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

interface GetShareRequest {
  identifier: string;
  password: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { identifier, password }: GetShareRequest = await req.json();

    if (!identifier) {
      return new Response(
        JSON.stringify({ error: 'Identifier is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Database-based rate limiting: 10 attempts per 15 minutes
    const rateLimitKey = `get_share:${identifier}`;
    const { data: rateLimitAllowed, error: rateLimitError } = await supabase.rpc(
      'check_rate_limit',
      { 
        rate_key: rateLimitKey, 
        max_attempts: 10, 
        window_minutes: 15 
      }
    );

    if (rateLimitError || rateLimitAllowed === false) {
      console.log('Rate limit exceeded for:', identifier);
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please try again in 15 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find share by token or custom slug using separate parameterized queries
    let shareData = null;

    const { data: shareByToken } = await supabase
      .from('shared_pages')
      .select('*')
      .eq('share_token', identifier)
      .is('deleted_at', null)
      .maybeSingle();

    if (shareByToken) {
      shareData = shareByToken;
    } else {
      const { data: shareBySlug } = await supabase
        .from('shared_pages')
        .select('*')
        .eq('custom_slug', identifier)
        .is('deleted_at', null)
        .maybeSingle();
      
      shareData = shareBySlug;
    }

    if (!shareData) {
      return new Response(
        JSON.stringify({ error: 'Share not found or has been deleted' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if expired
    if (new Date(shareData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'This share has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check access count
    if (shareData.max_access_count && shareData.access_count >= shareData.max_access_count) {
      return new Response(
        JSON.stringify({ error: 'Maximum access count reached' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify password using bcrypt (built-in constant-time comparison)
    const isPasswordValid = await bcrypt.compare(password, shareData.password_hash);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({ error: 'Incorrect password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment access count
    await supabase
      .from('shared_pages')
      .update({ access_count: shareData.access_count + 1 })
      .eq('id', shareData.id);

    // Decrypt content using AES-256-GCM ONLY
    const encryptionMetadata = shareData.encryption_metadata as any;
    
    // Reject shares without proper AES-256-GCM encryption
    if (!encryptionMetadata || encryptionMetadata.algorithm !== 'AES-256-GCM') {
      return new Response(
        JSON.stringify({ error: 'This share uses an outdated encryption method and can no longer be accessed. Please create a new share with current security standards.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let decryptedContent: string | null = null;
    let fileData: string | null = null;

    const saltBytes = fromBase64(encryptionMetadata.salt);
    const ivBytes = fromBase64(encryptionMetadata.iv);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: encryptionMetadata.iterations || 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['decrypt']
    );

    if (shareData.encrypted_content) {
      const encryptedBytes = fromBase64(shareData.encrypted_content);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        aesKey,
        encryptedBytes
      );
      const decryptedBytes = new Uint8Array(decryptedBuffer);
      const decoder = new TextDecoder();
      decryptedContent = decoder.decode(decryptedBytes);
    } else if (shareData.file_path) {
      // Download and decrypt file
      const { data: fileDataEncrypted, error: downloadError } = await supabase.storage
        .from('shared-content')
        .download(shareData.file_path);

      if (downloadError || !fileDataEncrypted) {
        console.error('Download error:', downloadError);
        return new Response(
          JSON.stringify({ error: 'Failed to retrieve file' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const encryptedBytes = new Uint8Array(await fileDataEncrypted.arrayBuffer());
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        aesKey,
        encryptedBytes
      );
      const decryptedBytes = new Uint8Array(decryptedBuffer);

      // Convert to base64 for client download
      fileData = btoa(String.fromCharCode(...decryptedBytes));
    }

    console.log('Share accessed successfully:', shareData.id);

    return new Response(
      JSON.stringify({
        title: shareData.title,
        content: decryptedContent,
        fileData,
        contentType: shareData.content_type,
        fileName: shareData.original_url,
        expiresAt: shareData.expires_at,
        accessCount: shareData.access_count + 1,
        maxAccessCount: shareData.max_access_count,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-share:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
