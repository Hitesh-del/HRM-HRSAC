import { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shield, Users, User, Mail, Lock, Eye, EyeOff, AlertCircle, Building2, ShieldCheck, RotateCcw, Smartphone, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';

// ─── Device Fingerprint ───────────────────────────────────────────────────────
function generateDeviceId(): string {
  const raw = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join('|');
  // simple deterministic hash (djb2)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua) && /Mobile/.test(ua)) return 'Android Phone';
  if (/Android/.test(ua)) return 'Android Tablet';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Unknown Device';
}

function parseBrowserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Unknown Browser';
}

type RoleOption = 'director' | 'management' | 'employee';

const ROLE_OPTIONS: {
  role: RoleOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    role: 'director',
    label: 'Director',
    icon: Shield,
    desc: 'Full system access',
    activeClass: 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_rgba(0,229,255,0.18)]',
    inactiveClass: 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
  },
  {
    role: 'management',
    label: 'Management',
    icon: Users,
    desc: 'Department access',
    activeClass: 'border-blue-500 bg-blue-500/10 text-blue-400 shadow-[0_0_16px_rgba(59,130,246,0.18)]',
    inactiveClass: 'border-border bg-card text-muted-foreground hover:border-blue-500/40 hover:text-foreground',
  },
  {
    role: 'employee',
    label: 'Employee',
    icon: User,
    desc: 'Self-service portal',
    activeClass: 'border-green-500 bg-green-500/10 text-green-400 shadow-[0_0_16px_rgba(34,197,94,0.18)]',
    inactiveClass: 'border-border bg-card text-muted-foreground hover:border-green-500/40 hover:text-foreground',
  },
];

interface LoginFormValues {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export default function LoginPage() {
  const {
    companySettings, loading,
    signIn, refreshCompanySettings,
    otpPending, setOtpPending,
    otpUserId, setOtpUserId,
    otpMaskedEmail, setOtpMaskedEmail,
  } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [roleError, setRoleError] = useState('');
  const [shake, setShake] = useState(false);

  // OTP flow UI state — pure display, safe to reset on remount.
  // The persistent identity fields (otpUserId, otpMaskedEmail) live in AuthContext.
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Device info (computed once)
  const deviceId = useRef(generateDeviceId());
  const deviceName = useRef(parseDeviceName());
  const browserName = useRef(parseBrowserName());
  // Prevents double-submit (state updates are async so useState isn't enough)
  const isSubmittingRef = useRef(false);

  // showOtp is derived from AuthContext — survives any navigation/remount.
  const showOtp = otpPending && !!otpUserId;

  const form = useForm<LoginFormValues>({
    defaultValues: {
      identifier: localStorage.getItem('hrm_remember_id') || '',
      password: localStorage.getItem('hrm_remember_pw') || '',
      rememberMe: localStorage.getItem('hrm_remember_me') === 'true',
    },
  });

  // Countdown timer for resend cooldown
  const startResendCooldown = useCallback(() => {
    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // Keep LoginPage visible after logout; do not auto-redirect to /setup.

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  // ─── Step 1: Credential submission + device check ──────────────────────────
  const onSubmit = async (values: LoginFormValues) => {
    // Hard guard — reject any concurrent re-entry immediately
    if (isSubmittingRef.current) return;
    if (!selectedRole) {
      toast.error('Please select your role before signing in.');
      return;
    }
    isSubmittingRef.current = true;
    setSubmitting(true);
    setRoleError('');
    // Raise the flag BEFORE signIn() so RouteGuard never bounces the user
    // to the dashboard while device check is in progress.
    setOtpPending(true);
    try {
      if (values.rememberMe) {
        localStorage.setItem('hrm_remember_id', values.identifier);
        localStorage.setItem('hrm_remember_pw', values.password);
        localStorage.setItem('hrm_remember_me', 'true');
      } else {
        localStorage.removeItem('hrm_remember_id');
        localStorage.removeItem('hrm_remember_pw');
        localStorage.removeItem('hrm_remember_me');
      }

      const { error } = await signIn(values.identifier, values.password);
      if (error) {
        setOtpPending(false);
        toast.error(error.message || 'Invalid credentials. Please try again.');
        triggerShake();
        return;
      }

      // Validate role match after successful auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setOtpPending(false);
        await supabase.auth.signOut();
        toast.error('Authentication failed.');
        return;
      }

      const { data: freshProfile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', authUser.id)
        .maybeSingle();

      const effectiveRole = freshProfile?.role;
      const isAllowed = effectiveRole === selectedRole || (selectedRole === 'employee' && effectiveRole === 'intern');

      if (effectiveRole === 'director' && companySettings && !companySettings.director_signup_completed) {
        const { error: updateError } = await supabase.from('company_settings').update({
          director_signup_completed: true,
          updated_at: new Date().toISOString(),
        });
        if (!updateError) {
          await refreshCompanySettings();
        }
      }

      if (freshProfile && !isAllowed) {
        setOtpPending(false);
        await supabase.auth.signOut();
        const label = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
        const msg = `You are not authorized as ${label}. Please select the correct role.`;
        setRoleError(msg); triggerShake(); toast.error(msg);
        return;
      }

      // Check intern restrictions
      if (effectiveRole === 'intern') {
        const { data: internData } = await supabase
          .from('intern_details')
          .select('end_date, status, account_disabled')
          .eq('profile_id', authUser.id)
          .maybeSingle();
        if (internData) {
          if (internData.account_disabled) {
            setOtpPending(false);
            await supabase.auth.signOut();
            const disabledMsg = 'Your internship account has been disabled. Please contact the administrator.';
            setRoleError(disabledMsg); triggerShake(); toast.error(disabledMsg);
            return;
          }
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const endDate = new Date(internData.end_date); endDate.setHours(0, 0, 0, 0);
          if (endDate < today || internData.status === 'expired') {
            setOtpPending(false);
            await supabase.auth.signOut();
            const expMsg = 'Your internship period has ended. Please contact HR for further information.';
            setRoleError(expMsg); triggerShake(); toast.error(expMsg);
            return;
          }
        }
      }

      // ── Device check ──────────────────────────────────────────────────────
      const { data: trustedDevice } = await supabase
        .from('trusted_devices')
        .select('id')
        .eq('user_id', authUser.id)
        .eq('device_id', deviceId.current)
        .eq('is_active', true)
        .maybeSingle();

      if (trustedDevice) {
        // Known device — update last_login_at, log, then allow redirect
        await supabase
          .from('trusted_devices')
          .update({ last_login_at: new Date().toISOString() })
          .eq('user_id', authUser.id)
          .eq('device_id', deviceId.current);

        await supabase.from('security_logs').insert({
          user_id: authUser.id,
          user_name: freshProfile?.email || '',
          user_role: effectiveRole || '',
          device_id: deviceId.current,
          device_name: deviceName.current,
          browser: browserName.current,
          ip_address: null,
          event_type: 'trusted_device_login',
          verification_status: 'direct',
        });

        // Lower the flag → RouteGuard is now free to redirect to dashboard
        setOtpPending(false);
        if (effectiveRole === 'director') navigate('/director', { replace: true });
        else if (effectiveRole === 'management') navigate('/management', { replace: true });
        else navigate('/employee', { replace: true });
        return;
      }

      // New device — sign out the temporary session immediately so no
      // dashboard content is ever accessible, then show OTP section.
      await supabase.auth.signOut();
      setOtpUserId(authUser.id);

      // Mask email: a****@domain.com
      const email = freshProfile?.email || '';
      const [localPart, domain] = email.split('@');
      const masked = localPart.length > 1
        ? localPart[0] + '****@' + domain
        : '****@' + domain;
      setOtpMaskedEmail(masked);

      // Send OTP via Edge Function
      const { error: sendErr } = await supabase.functions.invoke('send-device-otp', {
        body: {
          user_id: authUser.id,
          device_id: deviceId.current,
          device_name: deviceName.current,
          browser: browserName.current,
          ip_address: null,
        },
      });

      if (sendErr) {
        setOtpPending(false);
        setOtpUserId(null);
        setOtpMaskedEmail('');
        const msg = await sendErr?.context?.text?.();
        toast.error(msg || 'Failed to send verification code. Please try again.');
        return;
      }

      // otpPending stays TRUE — RouteGuard blocks all protected routes.
      // otpUserId is set — LoginPage renders the OTP section (showOtp = true).
      // Both survive any navigation/remount because they live in AuthContext.
      startResendCooldown();
      toast.info('Verification code sent to your registered email.');

    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  // ─── Step 2: OTP verification ──────────────────────────────────────────────
  const onVerifyOtp = async () => {
    if (!otpUserId) return;
    if (otpValue.trim().length !== 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }
    setOtpSubmitting(true);
    setOtpError('');
    try {
      const { error: verifyErr } = await supabase.functions.invoke('verify-device-otp', {
        body: {
          user_id: otpUserId,
          device_id: deviceId.current,
          otp: otpValue.trim(),
          device_name: deviceName.current,
          browser: browserName.current,
          ip_address: null,
        },
      });

      if (verifyErr) {
        const msg = await verifyErr?.context?.text?.();
        let parsed = msg;
        try { parsed = JSON.parse(msg || '{}').error || msg; } catch { /* noop */ }
        setOtpError(parsed || 'Invalid verification code. Please try again.');
        triggerShake();
        return;
      }

      // Show success state briefly, then re-authenticate and let RouteGuard navigate
      setOtpSuccess(true);
      setOtpError('');

      setTimeout(async () => {
        const values = form.getValues();
        // Clear OTP context state and lower the guard so RouteGuard can redirect
        setOtpUserId(null);
        setOtpMaskedEmail('');
        setOtpPending(false);
        const { error: signInErr } = await signIn(values.identifier, values.password);
        if (signInErr) {
          toast.error('Re-authentication failed. Please log in again.');
          setOtpSuccess(false);
          setOtpValue('');
        }
        // RouteGuard handles navigation once user+profile are set in AuthContext
      }, 1200);

    } finally {
      setOtpSubmitting(false);
    }
  };

  // ─── Resend OTP ────────────────────────────────────────────────────────────
  const onResendOtp = async () => {
    if (!otpUserId || resendCooldown > 0) return;
    const { error } = await supabase.functions.invoke('send-device-otp', {
      body: {
        user_id: otpUserId,
        device_id: deviceId.current,
        device_name: deviceName.current,
        browser: browserName.current,
        ip_address: null,
      },
    });
    if (error) {
      toast.error('Failed to resend code. Please try again.');
      return;
    }
    setOtpValue('');
    setOtpError('');
    startResendCooldown();
    toast.info('New verification code sent.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-card border-r border-border flex-col items-center justify-center p-12 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle at 30% 30%, hsl(var(--primary)) 0%, transparent 60%), radial-gradient(circle at 70% 70%, hsl(var(--primary)) 0%, transparent 60%)' }} />
        </div>
        <div className="relative z-10 text-center max-w-xs">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
            {companySettings?.company_logo_url ? (
              <img src={companySettings.company_logo_url} alt="Logo" className="w-14 h-14 object-contain rounded-xl" />
            ) : (
              <Building2 className="w-10 h-10 text-primary" />
            )}
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2 text-balance">
            {companySettings?.company_name || 'HRM System'}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            Enterprise Human Resource Management — managing people, maximizing potential.
          </p>
          <div className="mt-10 space-y-3">
            {ROLE_OPTIONS.map((r) => (
              <div key={r.role} className="flex items-center flex-wrap gap-3 p-3 rounded-lg bg-background/40 border border-border/50 text-left">
                <div className="w-8 h-8 rounded-lg bg-primary/5 border border-border flex items-center justify-center shrink-0">
                  <r.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 min-w-0 flex items-center justify-center p-4 md:p-4 md:p-8 overflow-y-auto">
        <div className="w-full max-w-md py-6">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-2">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground text-balance">{companySettings?.company_name || 'HRM System'}</h1>
          </div>

          {/* ── Credentials Section (always visible) ─────────────────── */}
          <div className="mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-foreground text-balance">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">Select your role, then sign in to continue</p>
          </div>

          {/* Role selector cards */}
          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Step 1 — Select Your Role
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = selectedRole === opt.role;
                return (
                  <button
                    key={opt.role}
                    type="button"
                    onClick={() => { setSelectedRole(opt.role); setRoleError(''); }}
                    disabled={showOtp}
                    className={`relative flex flex-col items-center gap-1.5 p-3 md:p-4 rounded-xl border-2 transition-all duration-150 cursor-pointer select-none active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? opt.activeClass : opt.inactiveClass}`}
                  >
                    {isActive && (
                      <ShieldCheck className="absolute top-1.5 right-1.5 w-3.5 h-3.5 opacity-80" />
                    )}
                    <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    <span className="text-xs md:text-sm font-semibold">{opt.label}</span>
                    <span className="text-[10px] opacity-70 text-center leading-tight hidden md:block">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            {!selectedRole && (
              <p className="text-xs text-muted-foreground mt-2">Choose a role to unlock the login form</p>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center flex-wrap gap-3 mb-5">
            <div className="flex-1 min-w-0 h-px bg-border" />
            <span className="text-xs text-muted-foreground">Step 2 — Sign In</span>
            <div className="flex-1 min-w-0 h-px bg-border" />
          </div>

          {/* Login form */}
          <div className={`transition-all duration-200 ${selectedRole ? 'opacity-100' : 'opacity-35 pointer-events-none select-none'}`}>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                {roleError && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-sm text-destructive text-pretty">{roleError}</p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="identifier"
                  rules={{ required: 'Email or username is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Email / Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="email@company.com"
                            className="pl-9"
                            autoComplete="username"
                            disabled={showOtp}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  rules={{ required: 'Password is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <FormLabel className="text-sm font-normal">Password</FormLabel>
                        <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot Password?</Link>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            className="pl-9 pr-9"
                            autoComplete="current-password"
                            disabled={showOtp}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            disabled={showOtp}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex items-center flex-wrap gap-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={showOtp} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal text-muted-foreground cursor-pointer">Remember me</FormLabel>
                    </FormItem>
                  )}
                />

                {!showOtp && (
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submitting || !selectedRole}
                    aria-disabled={submitting}
                  >
                    {submitting
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          Signing in…
                        </span>
                      : selectedRole
                        ? `Sign In as ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`
                        : 'Sign In'}
                  </Button>
                )}

                {/* ── Security Verification Section — appends inline ──── */}
                {showOtp && (
                  <div className="space-y-4 pt-1">
                    {/* Divider */}
                    <div className="flex items-center flex-wrap gap-3">
                      <div className="flex-1 min-w-0 h-px bg-border" />
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                        Security Verification
                      </span>
                      <div className="flex-1 min-w-0 h-px bg-border" />
                    </div>

                    {/* Info banner */}
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-2.5">
                        <Smartphone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-foreground font-medium">New device detected</p>
                          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
                            We detected a login from a new device ({deviceName.current} · {browserName.current}).
                            Enter the verification code sent to{' '}
                            <span className="text-foreground font-medium">{otpMaskedEmail}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Success state */}
                    {otpSuccess ? (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-green-500" />
                        </div>
                        <div className="text-center">
                          <p className="text-base font-semibold text-green-500">Verification Successful</p>
                          <p className="text-xs text-muted-foreground mt-1">Logging you in…</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Error message */}
                        {otpError && (
                          <div className={`flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
                            <XCircle className="w-4 h-4 text-destructive shrink-0" />
                            <p className="text-sm text-destructive text-pretty">{otpError}</p>
                          </div>
                        )}

                        {/* OTP input */}
                        <div className="space-y-2">
                          <label className="text-sm font-normal text-foreground block">Enter Security Code</label>
                          <Input
                            value={otpValue}
                            onChange={e => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                              setOtpValue(v);
                              if (otpError) setOtpError('');
                            }}
                            placeholder="Enter 6-digit verification code"
                            maxLength={6}
                            className="text-center text-xl tracking-[0.4em] font-mono h-12"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground">Numbers only · 6 digits · expires in 10 minutes</p>
                        </div>

                        {/* Verify button */}
                        <Button
                          type="button"
                          className="w-full"
                          onClick={onVerifyOtp}
                          disabled={otpSubmitting || otpValue.length !== 6}
                        >
                          {otpSubmitting
                            ? <span className="flex items-center flex-wrap gap-2"><span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />Verifying…</span>
                            : 'Verify'}
                        </Button>

                        {/* Resend + back */}
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onResendOtp}
                            disabled={resendCooldown > 0}
                            className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : 'Resend Code'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              // Clear all OTP context state — resets showOtp to false
                              setOtpPending(false);
                              setOtpUserId(null);
                              setOtpMaskedEmail('');
                              // Reset local UI state
                              setOtpValue('');
                              setOtpError('');
                              setOtpSuccess(false);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                          >
                            Back to login
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

              </form>
            </Form>
          </div>

          <div className="mt-5 p-3 bg-muted/40 rounded-lg border border-border/60">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Account creation is restricted. Contact your Director if you need access.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
