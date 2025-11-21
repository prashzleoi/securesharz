import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Hash password using Web Crypto API
    const encoder = new TextEncoder();
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

    // Generate encryption key
    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    const encryptionKey = Array.from(keyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

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
      
      // Simple XOR encryption for URL (in production, use proper encryption)
      const contentEncoder = new TextEncoder();
      const contentBytes = contentEncoder.encode(content);
      const keyBytesArray = new TextEncoder().encode(encryptionKey);
      const encrypted = new Uint8Array(contentBytes.length);
      
      for (let i = 0; i < contentBytes.length; i++) {
        encrypted[i] = contentBytes[i] ^ keyBytesArray[i % keyBytesArray.length];
      }
      
      encryptedContent = btoa(String.fromCharCode(...encrypted));
    } else if (file) {
      // Handle file upload
      const fileData = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
      
      // Encrypt file data
      const keyBytesArray = new TextEncoder().encode(encryptionKey);
      const encrypted = new Uint8Array(fileData.length);
      
      for (let i = 0; i < fileData.length; i++) {
        encrypted[i] = fileData[i] ^ keyBytesArray[i % keyBytesArray.length];
      }

      // Upload to storage
      const fileName = `${shareToken}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('shared-content')
        .upload(fileName, encrypted, {
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
          algorithm: 'XOR',
          key: encryptionKey,
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
    const shareLink = customSlug
      ? `${req.headers.get('origin')}/s/${customSlug}`
      : `${req.headers.get('origin')}/s/${shareToken}`;

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
