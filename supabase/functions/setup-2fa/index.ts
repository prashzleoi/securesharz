import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import * as OTPAuth from 'https://esm.sh/otpauth@9.2.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if 2FA is already enabled
    const { data: profile } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('user_id', user.id)
      .single();

    if (profile?.two_factor_enabled) {
      return new Response(
        JSON.stringify({ error: '2FA is already enabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate TOTP secret
    const randomBytes = crypto.getRandomValues(new Uint8Array(20));
    const secret = new OTPAuth.Secret({ buffer: randomBytes.buffer });
    
    const totp = new OTPAuth.TOTP({
      issuer: 'SecureShare',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });
    const otpauthUrl = totp.toString();

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => 
      Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    // Store secret temporarily (not enabled yet)
    await supabase
      .from('profiles')
      .update({
        two_factor_secret: secret.base32,
        two_factor_backup_codes: backupCodes,
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        secret: secret.base32,
        qrCode: otpauthUrl,
        backupCodes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Setup 2FA error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
