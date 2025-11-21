import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateUrnRequest {
  email?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: 5 URNs per hour per IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const rateLimitKey = `ratelimit:generate-urn:${clientIp}`;
    const kv = await Deno.openKv();
    const rateLimitEntry = await kv.get<{ count: number; resetAt: number }>([rateLimitKey]);
    const now = Date.now();
    
    if (rateLimitEntry.value) {
      if (now < rateLimitEntry.value.resetAt) {
        if (rateLimitEntry.value.count >= 5) {
          return new Response(
            JSON.stringify({ error: 'Too many URN generation requests. Please try again in an hour.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        await kv.set([rateLimitKey], { count: rateLimitEntry.value.count + 1, resetAt: rateLimitEntry.value.resetAt }, { expireIn: 60 * 60 * 1000 });
      } else {
        await kv.set([rateLimitKey], { count: 1, resetAt: now + 60 * 60 * 1000 }, { expireIn: 60 * 60 * 1000 });
      }
    } else {
      await kv.set([rateLimitKey], { count: 1, resetAt: now + 60 * 60 * 1000 }, { expireIn: 60 * 60 * 1000 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email }: GenerateUrnRequest = await req.json().catch(() => ({}));

    // Generate a cryptographically secure URN
    const urnBytes = new Uint8Array(32);
    crypto.getRandomValues(urnBytes);
    const urn = Array.from(urnBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Validate email if provided
    if (email) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert URN into database
    const { data, error } = await supabase
      .from('urns')
      .insert({
        urn,
        email: email || null,
        is_anonymous: !email,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating URN:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create URN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('URN generated successfully:', data.id);

    return new Response(
      JSON.stringify({ urn: data.urn, urn_id: data.id }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Set-Cookie': `urn=${data.urn}; HttpOnly; Secure; SameSite=Strict; Max-Age=5184000; Path=/`
        } 
      }
    );
  } catch (error) {
    console.error('Error in generate-urn:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
