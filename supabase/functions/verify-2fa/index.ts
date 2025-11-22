import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import * as OTPAuth from 'https://esm.sh/otpauth@9.2.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyRequest {
  code: string;
  enable?: boolean;
}

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

    // Check rate limit
    const { data: rateLimitOk } = await supabase.rpc('check_2fa_rate_limit', {
      p_user_id: user.id
    });

    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ error: 'Too many failed attempts. Try again in 15 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { code, enable } = await req.json() as VerifyRequest;

    if (!code || code.length !== 6) {
      return new Response(
        JSON.stringify({ error: 'Invalid code format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's 2FA secret
    const { data: profile } = await supabase
      .from('profiles')
      .select('two_factor_secret, two_factor_backup_codes')
      .eq('user_id', user.id)
      .single();

    if (!profile?.two_factor_secret) {
      return new Response(
        JSON.stringify({ error: '2FA not set up' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let isValid = false;

    // Check if it's a backup code
    if (profile.two_factor_backup_codes?.includes(code)) {
      isValid = true;
      // Remove used backup code
      const updatedCodes = profile.two_factor_backup_codes.filter((c: string) => c !== code);
      await supabase
        .from('profiles')
        .update({ two_factor_backup_codes: updatedCodes })
        .eq('user_id', user.id);
    } else {
      // Verify TOTP code
      const totp = new OTPAuth.TOTP({
        issuer: 'SecureShare',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(profile.two_factor_secret),
      });

      const delta = totp.validate({ token: code, window: 1 });
      isValid = delta !== null;
    }

    // Log attempt
    await supabase
      .from('two_factor_attempts')
      .insert({
        user_id: user.id,
        success: isValid,
      });

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If enabling 2FA, update the profile
    if (enable) {
      await supabase
        .from('profiles')
        .update({ two_factor_enabled: true })
        .eq('user_id', user.id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Verify 2FA error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
