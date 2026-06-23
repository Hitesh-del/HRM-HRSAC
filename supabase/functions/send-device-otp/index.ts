import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    serve(handler: (req: Request) => Response | Promise<Response>): void;
  };
}

// Generate cryptographically random 6-digit OTP
function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

// SHA-256 hash of OTP for safe storage
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

    const { user_id, device_id, ip_address, device_name, browser } = await req.json();

    if (!user_id || !device_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id or device_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user profile for email and name
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, role')
      .eq('id', user_id)
      .maybeSingle();

    if (profileErr || !profile?.email) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Invalidate any previous unused OTPs for this user+device
    await supabaseAdmin
      .from('device_otp_verifications')
      .update({ is_used: true })
      .eq('user_id', user_id)
      .eq('device_id', device_id)
      .eq('is_used', false);

    // Generate and hash OTP
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Store hashed OTP
    const { error: insertErr } = await supabaseAdmin
      .from('device_otp_verifications')
      .insert({
        user_id,
        device_id,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts: 0,
        is_used: false,
      });

    if (insertErr) {
      return new Response(JSON.stringify({ error: 'Failed to store OTP' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log new device login attempt in security_logs
    await supabaseAdmin.from('security_logs').insert({
      user_id,
      user_name: profile.full_name || '',
      user_role: profile.role || '',
      device_id,
      device_name: device_name || 'Unknown Device',
      browser: browser || 'Unknown Browser',
      ip_address: ip_address || null,
      event_type: 'new_device_login',
      verification_status: 'failed', // pending verification
    });

    // Notify user of new device login
    await supabaseAdmin.from('notifications').insert({
      recipient_id: user_id,
      type: 'security',
      category: 'security',
      title: 'New Device Login Detected',
      message: `A login from a new device (${device_name || 'Unknown Device'} · ${browser || 'Unknown Browser'}) was detected. A verification code has been sent to your email.`,
      is_read: false,
    });

    // Send OTP email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured. Please contact the administrator.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'HR-SAC TECH <noreply@hrsactech.in>';
    const userName = profile.full_name ? profile.full_name.split(' ')[0] : 'User';
    const roleLabel = profile.role
      ? (profile.role as string).charAt(0).toUpperCase() + (profile.role as string).slice(1)
      : 'User';
    const loginTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

    const emailBody = {
      from: fromAddress,
      to: profile.email,
      // OTP must NOT appear in the subject line — only inside the email body
      subject: 'HRSAC HRM VERIFICATION CODE',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HRSAC HRM Verification Code</title>
</head>
<body style="margin:0;padding:0;background-color:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">

<!-- Outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0B0F17">
  <tr>
    <td align="center" style="padding:40px 16px 48px">

      <!-- Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-radius:16px;overflow:hidden;border:1px solid #1E2A3A">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(160deg,#0D1B2A 0%,#0F2237 100%);padding:32px 36px 28px;border-bottom:1px solid #1E2A3A">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Logo block -->
                <td style="vertical-align:middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:middle;padding-right:14px">
                        <img src="public/images/logo/logo-icon.svg" alt="HR-SAC TECH logo" width="48" height="48" style="display:block;max-width:48px;height:auto;border-radius:12px;" />
                      </td>
                      <td style="vertical-align:middle">
                        <p style="margin:0;color:#F1F5F9;font-size:18px;font-weight:700;letter-spacing:0.3px;line-height:1.2">HR-SAC TECH</p>
                        <p style="margin:2px 0 0;color:#475569;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500">Human Resource Management</p>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Badge -->
                <td align="right" style="vertical-align:middle">
                  <span style="display:inline-block;background:#0C2131;border:1px solid #0EA5E9;border-radius:20px;padding:4px 12px;color:#38BDF8;font-size:11px;font-weight:600;letter-spacing:0.5px">SECURITY ALERT</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── ALERT BANNER ── -->
        <tr>
          <td style="background:#1A0F05;border-bottom:1px solid #7C2D12;padding:14px 36px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:12px">
                  <div style="width:28px;height:28px;border-radius:50%;background:#EA580C;text-align:center;line-height:28px;font-size:16px;font-weight:800;color:#fff">&#9888;</div>
                </td>
                <td>
                  <p style="margin:0;color:#FB923C;font-size:13px;font-weight:700">New Device Login Detected</p>
                  <p style="margin:3px 0 0;color:#94A3B8;font-size:12px">A sign-in attempt was made from an unrecognised device on your account</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="background:#0F1724;padding:32px 36px">

            <!-- Greeting -->
            <p style="margin:0 0 6px;color:#94A3B8;font-size:14px">Hello, <strong style="color:#E2E8F0">${userName}</strong> &mdash; <span style="color:#475569;font-size:12px">${roleLabel}</span></p>
            <p style="margin:0 0 28px;color:#64748B;font-size:13px;line-height:1.7">
              To complete your sign-in, enter the verification code below.<br>
              This code is valid for <strong style="color:#CBD5E1">10 minutes only</strong> and can be used once.
            </p>

            <!-- OTP Code Box -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px">
              <tr>
                <td align="center" style="background:#080C12;border:2px solid #0369A1;border-radius:14px;padding:28px 20px">
                  <p style="margin:0 0 10px;color:#475569;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">YOUR VERIFICATION CODE</p>
                  <!-- Each digit in its own cell for robust email client rendering -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
                    <tr>
                      ${otp.split('').map((digit: string) =>
                        `<td style="padding:0 4px"><span style="display:inline-block;width:40px;height:52px;background:#0D1B2A;border:1px solid #1E3A5F;border-radius:8px;text-align:center;line-height:52px;font-size:30px;font-weight:800;color:#38BDF8;font-family:'Courier New',monospace">${digit}</span></td>`
                      ).join('')}
                    </tr>
                  </table>
                  <p style="margin:14px 0 0;color:#334155;font-size:11px">Do not share this code with anyone</p>
                </td>
              </tr>
            </table>

            <!-- Device Info -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080C12;border:1px solid #1E2A3A;border-radius:10px;margin-bottom:24px">
              <tr>
                <td style="padding:12px 18px;border-bottom:1px solid #1E2A3A">
                  <p style="margin:0;color:#475569;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">LOGIN ATTEMPT DETAILS</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 18px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="color:#475569;font-size:12px;padding:5px 0;width:100px;vertical-align:top">Device</td>
                      <td style="color:#CBD5E1;font-size:12px;padding:5px 0;font-weight:600">${device_name || 'Unknown Device'}</td>
                    </tr>
                    <tr>
                      <td style="color:#475569;font-size:12px;padding:5px 0;vertical-align:top">Browser</td>
                      <td style="color:#CBD5E1;font-size:12px;padding:5px 0;font-weight:600">${browser || 'Unknown Browser'}</td>
                    </tr>
                    <tr>
                      <td style="color:#475569;font-size:12px;padding:5px 0;vertical-align:top">Time (IST)</td>
                      <td style="color:#CBD5E1;font-size:12px;padding:5px 0;font-weight:600">${loginTime}</td>
                    </tr>
                    <tr>
                      <td style="color:#475569;font-size:12px;padding:5px 0;vertical-align:top">Account</td>
                      <td style="color:#CBD5E1;font-size:12px;padding:5px 0;font-weight:600">${profile.email}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Safety notice -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#061910;border:1px solid #14532D;border-radius:10px">
              <tr>
                <td style="padding:16px 18px">
                  <p style="margin:0 0 6px;color:#86EFAC;font-size:13px;font-weight:600">&#10003;&nbsp; If this was you</p>
                  <p style="margin:0 0 12px;color:#4ADE80;font-size:12px;line-height:1.6">Enter the verification code above on the login screen to continue.</p>
                  <p style="margin:0 0 6px;color:#FCA5A5;font-size:13px;font-weight:600">&#10005;&nbsp; If this was NOT you</p>
                  <p style="margin:0;color:#F87171;font-size:12px;line-height:1.6">Ignore this email — no action was taken. We recommend changing your password immediately to secure your account.</p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#080C12;border-top:1px solid #1E2A3A;padding:20px 36px;text-align:center">
            <p style="margin:0 0 4px;color:#334155;font-size:11px">
              This is an automated security message from <strong style="color:#475569">HR-SAC TECH HRM System</strong>
            </p>
            <p style="margin:0 0 10px;color:#1E293B;font-size:10px">Please do not reply &bull; noreply@hrsactech.in</p>
            <p style="margin:0;color:#1E293B;font-size:10px">
              &copy; ${new Date().getFullYear()} HR-SAC TECH. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!-- /Card -->

    </td>
  </tr>
</table>

</body>
</html>`,
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });

    const resendBody = await resendRes.text();
    console.log('Resend status:', resendRes.status, 'body:', resendBody);

    if (!resendRes.ok) {
      console.error('Resend API error:', resendBody);
      return new Response(JSON.stringify({ error: `Failed to send email: ${resendBody}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, email: profile.email }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-device-otp error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
