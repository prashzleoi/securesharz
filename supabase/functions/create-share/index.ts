import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveAesKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

interface CreateShareRequest {
  urn: string;
  content?: string; // URL content
  file?: {
    data: string; // base64
    name: string;
    type: string;
  };
  password: string;
  expiryMinutes: number;
  customSlug?: string;
  maxAccessCount?: number;
  title: string;
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

    const {
      urn,
      content,
      file,
      password,
      expiryMinutes,
      customSlug,
      maxAccessCount,
      title,
    }: CreateShareRequest = await req.json();

    // Validate URN exists
    const { data: urnData, error: urnError } = await supabase
      .from('urns')
      .select('id')
      .eq('urn', urn)
      .single();

    if (urnError || !urnData) {
      return new Response(
        JSON.stringify({ error: 'Invalid URN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update URN last seen
    await supabase.rpc('update_urn_last_seen', { urn_value: urn });

    // Validate expiry time
    if (expiryMinutes < 10 || expiryMinutes > 2880) {
      return new Response(
        JSON.stringify({ error: 'Expiry must be between 10 minutes and 2 days' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash password using Web Crypto API (for quick verification)
    const passwordData = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', passwordData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Generate share token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const shareToken = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Derive AES-256-GCM key from password using PBKDF2 (no key stored in DB)
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await deriveAesKey(password, saltBytes.buffer);

    // Single IV per share (URL or file). Unique per share so safe for one-time use.
    const iv = crypto.getRandomValues(new Uint8Array(12));

    let encryptedContent = '';
    let filePath: string | null = null;
    let contentType: string | null = null;
    let originalUrl = '';

    if (content) {
      // Validate URL
      const { data: isValid } = await supabase.rpc('validate_url', { url_input: content });
      
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid URL format. URL must start with http:// or https://' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      originalUrl = content;
      
      // AES-256-GCM encryption for URL content
      const contentBytes = encoder.encode(content);
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        contentBytes
      );
      const encryptedBytes = new Uint8Array(encryptedBuffer);
      encryptedContent = toBase64(encryptedBytes);
    } else if (file) {
      // Handle file upload
      const fileData = fromBase64(file.data);
      
      // AES-256-GCM encryption for file data
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        fileData
      );
      const encryptedFileBytes = new Uint8Array(encryptedBuffer);

      // Upload to storage
      const fileName = `${shareToken}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('shared-content')
        .upload(fileName, encryptedFileBytes, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return new Response(
          JSON.stringify({ error: 'Failed to upload file' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      filePath = fileName;
      contentType = file.type;
      originalUrl = file.name;
    } else {
      return new Response(
        JSON.stringify({ error: 'Either content or file must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    // Insert share record
    const { data: shareData, error: shareError } = await supabase
      .from('shared_pages')
      .insert({
        urn_id: urnData.id,
        share_token: shareToken,
        custom_slug: customSlug || null,
        title,
        original_url: originalUrl,
        encrypted_content: encryptedContent || null,
        file_path: filePath,
        content_type: contentType,
        password_hash: passwordHash,
        expires_at: expiresAt,
        max_access_count: maxAccessCount || null,
        encryption_metadata: {
          algorithm: 'AES-256-GCM',
          kdf: 'PBKDF2',
          iterations: 100000,
          salt: toBase64(salt),
          iv: toBase64(iv),
        },
      })
      .select()
      .single();

    if (shareError) {
      console.error('Share creation error:', shareError);
      return new Response(
        JSON.stringify({ error: 'Failed to create share' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Share created successfully:', shareData.id);

    // Generate share link
    const origin = req.headers.get('origin') || '';
    const shareLink = customSlug
      ? `${origin}/s/${customSlug}`
      : `${origin}/s/${shareToken}`;

    return new Response(
      JSON.stringify({
        shareLink,
        shareToken,
        expiresAt,
        customSlug,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-share:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
