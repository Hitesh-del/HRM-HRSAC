import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

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

    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Verify the email belongs to an HRM profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, email')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (profileErr) {
      console.error('Profile lookup error:', profileErr);
      return new Response(JSON.stringify({ error: 'An error occurred. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Always return success to prevent email enumeration attacks
    if (!profile) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate a Supabase password reset link using the admin API
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://hilsivfrvangkavqhjnc.supabase.co';
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: trimmedEmail,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('Link generation error:', linkErr);
      return new Response(JSON.stringify({ error: 'Failed to generate reset link. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resetLink = linkData.properties.action_link;
    const userName = profile.full_name ? profile.full_name.split(' ')[0] : 'User';
    const roleLabel = (profile.role as string).charAt(0).toUpperCase() + (profile.role as string).slice(1);
    const requestTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });

    // Send branded password reset email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured. Please contact the administrator.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'HR-SAC TECH <noreply@hrsactech.in>';

    const emailBody = {
      from: fromAddress,
      to: trimmedEmail,
      subject: '[HR-SAC TECH] Password Reset Request',
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Password Reset</title></head>
<body style="margin:0;padding:0;background:#0A0D12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0D12;min-height:100vh">
    <tr><td align="center" style="padding:40px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0F1419 0%,#111827 100%);border-radius:16px 16px 0 0;padding:32px;text-align:center;border:1px solid #1E2D3D;border-bottom:none">
          <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#00B4D8,#0077B6);display:flex;align-items:center;justify-content:center">
              <span style="color:#fff;font-size:20px;font-weight:800">H</span>
            </div>
            <div style="text-align:left">
              <p style="margin:0;color:#E2E8F0;font-size:16px;font-weight:700;letter-spacing:0.5px">HR-SAC TECH</p>
              <p style="margin:0;color:#64748B;font-size:11px;letter-spacing:1px;text-transform:uppercase">Human Resource Management</p>
            </div>
          </div>
        </td></tr>

        <!-- Blue info banner -->
        <tr><td style="background:#08101A;border-left:1px solid #1E2D3D;border-right:1px solid #1E2D3D;padding:14px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="28" style="vertical-align:top;padding-top:2px">
                <div style="width:24px;height:24px;border-radius:50%;background:#0077B6;text-align:center;line-height:24px;font-size:13px;font-weight:700;color:#fff">🔑</div>
              </td>
              <td style="padding-left:10px">
                <p style="margin:0;color:#38BDF8;font-size:13px;font-weight:600">Password Reset Requested</p>
                <p style="margin:4px 0 0;color:#94A3B8;font-size:12px">A request was received to reset your ${roleLabel} account password</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#0F1419;border:1px solid #1E2D3D;border-top:none;border-bottom:none;padding:28px 32px">
          <p style="margin:0 0 4px;color:#94A3B8;font-size:14px">Hello, <strong style="color:#E2E8F0">${userName}</strong></p>
          <p style="margin:0 0 24px;color:#64748B;font-size:13px;line-height:1.6">
            We received a request to reset the password for your <strong style="color:#94A3B8">HR-SAC TECH</strong> account.
            Click the button below to set a new password. This link expires in <strong style="color:#94A3B8">30 minutes</strong>.
          </p>

          <!-- CTA Button -->
          <div style="text-align:center;margin:0 0 28px">
            <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#0077B6,#00B4D8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.5px">
              Reset My Password
            </a>
          </div>

          <!-- Fallback link -->
          <div style="background:#080B0F;border:1px solid #1E2D3D;border-radius:8px;padding:14px 16px;margin:0 0 20px">
            <p style="margin:0 0 6px;color:#64748B;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600">Or copy this link into your browser</p>
            <p style="margin:0;color:#38BDF8;font-size:11px;word-break:break-all;line-height:1.5">${resetLink}</p>
          </div>

          <!-- Request Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#080B0F;border:1px solid #1E2D3D;border-radius:10px;margin:0 0 20px">
            <tr><td style="padding:14px 18px;border-bottom:1px solid #1E2D3D">
              <p style="margin:0;color:#64748B;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600">Request Details</p>
            </td></tr>
            <tr><td style="padding:14px 18px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#64748B;font-size:12px;padding:3px 0;width:90px">Account</td>
                  <td style="color:#CBD5E1;font-size:12px;padding:3px 0;font-weight:500">${trimmedEmail}</td>
                </tr>
                <tr>
                  <td style="color:#64748B;font-size:12px;padding:3px 0">Role</td>
                  <td style="color:#CBD5E1;font-size:12px;padding:3px 0;font-weight:500">${roleLabel}</td>
                </tr>
                <tr>
                  <td style="color:#64748B;font-size:12px;padding:3px 0">Requested (IST)</td>
                  <td style="color:#CBD5E1;font-size:12px;padding:3px 0;font-weight:500">${requestTime}</td>
                </tr>
                <tr>
                  <td style="color:#64748B;font-size:12px;padding:3px 0">Link Expires</td>
                  <td style="color:#CBD5E1;font-size:12px;padding:3px 0;font-weight:500">In 30 minutes</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <div style="background:#0C1F10;border:1px solid #166534;border-radius:8px;padding:12px 16px">
            <p style="margin:0;color:#86EFAC;font-size:12px;line-height:1.6">✅ If you requested this reset — click the button above.<br>🚫 If you did NOT request this — your account is safe. You can safely ignore this email. <strong>No changes will be made.</strong></p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#080B0F;border:1px solid #1E2D3D;border-top:none;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center">
          <p style="margin:0 0 6px;color:#475569;font-size:11px">This is an automated message from <strong style="color:#64748B">HR-SAC TECH HRM System</strong></p>
          <p style="margin:0;color:#334155;font-size:10px">Please do not reply to this email · noreply@hrsactech.in</p>
        </td></tr>

      </table>
    </td></tr>
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

    if (!resendRes.ok) {
      const resendErr = await resendRes.text();
      console.error('Resend API error:', resendErr);
      return new Response(JSON.stringify({ error: 'Failed to send reset email. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('send-forgot-password error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
