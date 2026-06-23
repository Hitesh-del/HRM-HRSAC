import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// SHA-256 hash matching the one in send-device-otp
async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { user_id, device_id, otp, device_name, browser, ip_address } = await req.json();

    if (!user_id || !device_id || !otp) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the latest active OTP record for this user+device
    const { data: record, error: fetchErr } = await supabaseAdmin
      .from('device_otp_verifications')
      .select('id, otp_hash, expires_at, attempts, is_used')
      .eq('user_id', user_id)
      .eq('device_id', device_id)
      .eq('is_used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr || !record) {
      return new Response(JSON.stringify({ error: 'No active OTP found. Please request a new code.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      await supabaseAdmin
        .from('device_otp_verifications')
        .update({ is_used: true })
        .eq('id', record.id);
      return new Response(JSON.stringify({ error: 'OTP has expired. Please resend the code.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check attempts
    if (record.attempts >= 5) {
      await supabaseAdmin
        .from('device_otp_verifications')
        .update({ is_used: true })
        .eq('id', record.id);
      return new Response(JSON.stringify({ error: 'Maximum attempts exceeded. Please resend the code.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify OTP hash
    const inputHash = await hashOtp(otp.trim());
    if (inputHash !== record.otp_hash) {
      const newAttempts = record.attempts + 1;
      await supabaseAdmin
        .from('device_otp_verifications')
        .update({ attempts: newAttempts, is_used: newAttempts >= 5 })
        .eq('id', record.id);

      // Log failed attempt
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('full_name, role')
        .eq('id', user_id)
        .maybeSingle();

      await supabaseAdmin.from('security_logs').insert({
        user_id,
        user_name: profileData?.full_name || '',
        user_role: profileData?.role || '',
        device_id,
        device_name: device_name || 'Unknown Device',
        browser: browser || 'Unknown Browser',
        ip_address: ip_address || null,
        event_type: newAttempts >= 3 ? 'multiple_failed_attempts' : 'otp_verification_failed',
        verification_status: 'failed',
      });

      // Notify user of failed OTP attempt (only at ≥3 failures to avoid spam)
      if (newAttempts >= 3) {
        await supabaseAdmin.from('notifications').insert({
          recipient_id: user_id,
          type: 'security',
          category: 'security',
          title: 'Multiple Failed Verification Attempts',
          message: `${newAttempts} failed verification attempts were detected on your account. If this was not you, please secure your account immediately.`,
          is_read: false,
        });
      }

      if (newAttempts >= 5) {
        return new Response(JSON.stringify({ error: 'Maximum attempts exceeded. Please resend the code.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        error: `Invalid code. ${5 - newAttempts} attempt(s) remaining.`,
        attempts_remaining: 5 - newAttempts,
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OTP is valid — mark as used
    await supabaseAdmin
      .from('device_otp_verifications')
      .update({ is_used: true })
      .eq('id', record.id);

    // Fetch profile for trusted device record
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, role')
      .eq('id', user_id)
      .maybeSingle();

    // Upsert trusted device
    await supabaseAdmin
      .from('trusted_devices')
      .upsert({
        user_id,
        device_id,
        device_name: device_name || 'Unknown Device',
        browser: browser || 'Unknown Browser',
        ip_address: ip_address || null,
        verified_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        is_active: true,
      }, { onConflict: 'user_id,device_id' });

    // Log success
    await supabaseAdmin.from('security_logs').insert({
      user_id,
      user_name: profile?.full_name || '',
      user_role: profile?.role || '',
      device_id,
      device_name: device_name || 'Unknown Device',
      browser: browser || 'Unknown Browser',
      ip_address: ip_address || null,
      event_type: 'otp_verification_success',
      verification_status: 'otp_verified',
    });

    // Notify user that new device is now trusted
    await supabaseAdmin.from('notifications').insert({
      recipient_id: user_id,
      type: 'security',
      category: 'security',
      title: 'New Device Verified & Trusted',
      message: `Your device (${device_name || 'Unknown Device'} · ${browser || 'Unknown Browser'}) has been verified and added to your trusted devices.`,
      is_read: false,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('verify-device-otp error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
