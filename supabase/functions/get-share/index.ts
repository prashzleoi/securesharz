import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

interface GetShareRequest {
  identifier: string; // token or custom slug
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

    // Find share by token or custom slug
    const { data: shareData, error: shareError } = await supabase
      .from('shared_pages')
      .select('*')
      .or(`share_token.eq."${identifier}",custom_slug.eq."${identifier}"`)
      .is('deleted_at', null)
      .single();

    if (shareError || !shareData) {
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

    // Verify password
    const passwordData = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', passwordData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (passwordHash !== shareData.password_hash) {
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

    // Decrypt content
    const encryptionMetadata = shareData.encryption_metadata as any;
    const algorithm = encryptionMetadata?.algorithm || 'XOR';

    let decryptedContent: string | null = null;
    let fileData: string | null = null;

    if (algorithm === 'AES-256-GCM') {
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
    } else {
      // Legacy XOR decryption for existing shares
      const encryptionKey = encryptionMetadata?.key;
      if (!encryptionKey) {
        return new Response(
          JSON.stringify({ error: 'Encryption key not found' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (shareData.encrypted_content) {
        // Decrypt URL
        const encryptedBytes = Uint8Array.from(atob(shareData.encrypted_content), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(encryptionKey);
        const decrypted = new Uint8Array(encryptedBytes.length);
        
        for (let i = 0; i < encryptedBytes.length; i++) {
          decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
        }
        
        const decoder = new TextDecoder();
        decryptedContent = decoder.decode(decrypted);
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
        const keyBytes = new TextEncoder().encode(encryptionKey);
        const decrypted = new Uint8Array(encryptedBytes.length);
        
        for (let i = 0; i < encryptedBytes.length; i++) {
          decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        // Convert to base64
        fileData = btoa(String.fromCharCode(...decrypted));
      }
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
