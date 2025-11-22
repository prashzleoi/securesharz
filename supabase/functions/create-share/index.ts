import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

// Compression helper using native CompressionStream API
async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  }).pipeThrough(new CompressionStream('gzip'));
  
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(new ArrayBuffer(totalLength));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

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
  content?: string;
  file?: {
    data: string;
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

    // Database-based rate limiting: 20 shares per hour per URN
    const rateLimitKey = `create_share:${urn}`;
    const { data: rateLimitAllowed, error: rateLimitError } = await supabase.rpc(
      'check_rate_limit',
      { 
        rate_key: rateLimitKey, 
        max_attempts: 20, 
        window_minutes: 60 
      }
    );

    if (rateLimitError || rateLimitAllowed === false) {
      console.log('Rate limit exceeded for URN:', urn);
      
      // Log rate limit event
      await supabase.rpc('log_security_event', {
        p_event_type: 'rate_limit_exceeded',
        p_event_category: 'access_control',
        p_severity: 'warning',
        p_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
        p_metadata: { urn, endpoint: 'create-share' }
      });
      
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Maximum 20 shares per hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (40MB max to prevent memory issues)
    if (file?.data) {
      const base64Size = file.data.length * 0.75;
      const maxSize = 40 * 1024 * 1024;
      if (base64Size > maxSize) {
        return new Response(
          JSON.stringify({ error: `File too large. Maximum size is 40MB. Your file is ${Math.round(base64Size / 1024 / 1024)}MB` }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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

    // Hash password using bcrypt (Argon2id-level security)
    const passwordHash = await bcrypt.hash(password);

    // Generate share token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const shareToken = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Derive AES-256-GCM key from password using PBKDF2 (no key stored in DB)
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await deriveAesKey(password, saltBytes.buffer);

    // Single IV per share
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
      
      // Compress then encrypt URL content (40-70% space savings)
      const contentBytes = encoder.encode(content);
      const compressedBytes = await compressData(contentBytes);
      const compressionRatio = Math.round((1 - compressedBytes.length / contentBytes.length) * 100);
      console.log(`URL compression: ${compressionRatio}% smaller (${contentBytes.length} → ${compressedBytes.length} bytes)`);
      
      // AES-256-GCM encryption
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        compressedBytes.buffer as ArrayBuffer
      );
      const encryptedBytes = new Uint8Array(encryptedBuffer);
      encryptedContent = toBase64(encryptedBytes);
    } else if (file) {
      try {
        const fileData = fromBase64(file.data);
        
        // Compress file data (40-70% space savings for text/documents)
        const compressedData = await compressData(fileData);
        const compressionRatio = Math.round((1 - compressedData.length / fileData.length) * 100);
        console.log(`File compression: ${compressionRatio}% smaller (${fileData.length} → ${compressedData.length} bytes)`);
        
        // AES-256-GCM encryption
        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          aesKey,
          compressedData.buffer as ArrayBuffer
        );
        
        // Upload encrypted file to storage
        const fileName = `${shareToken}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('shared-content')
          .upload(fileName, new Uint8Array(encryptedBuffer), {
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
      } catch (error: any) {
        console.error('File processing error:', error);
        if (error.message?.includes('memory') || error.message?.includes('allocation')) {
          return new Response(
            JSON.stringify({ error: 'File too large to process. Please use a smaller file (max 40MB)' }),
            { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Either content or file must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    // Insert share record with AES-256-GCM encryption metadata
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
          salt: toBase64(saltBytes),
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

    // Log share creation
    await supabase.rpc('log_security_event', {
      p_event_type: 'share_created',
      p_event_category: 'content_management',
      p_severity: 'info',
      p_share_id: shareData.id,
      p_urn_id: urnData.id,
      p_metadata: {
        has_file: !!filePath,
        content_type: contentType,
        expiry_minutes: expiryMinutes,
        has_custom_slug: !!customSlug,
        max_access_count: maxAccessCount
      }
    });
    
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
