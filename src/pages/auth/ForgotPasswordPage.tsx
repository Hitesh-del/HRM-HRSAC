import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setFieldError('Please enter your email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setFieldError('Please enter a valid email address'); return; }

    setLoading(true);
    try {
      // Call Edge Function — uses Resend with HR-SAC TECH branding from noreply@hrsactech.in
      const { error: fnErr } = await supabase.functions.invoke('send-forgot-password', {
        body: { email: trimmed },
      });

      if (fnErr) {
        const msg = await fnErr?.context?.text?.();
        let parsed = msg;
        try { parsed = JSON.parse(msg || '{}').error || msg; } catch { /* noop */ }
        toast.error(parsed || 'Failed to send reset email. Please try again.');
        return;
      }

      setSent(true);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground text-balance">Reset Your Password</h1>
          <p className="text-muted-foreground mt-1 text-sm text-pretty">Enter your registered email address to receive a password reset link</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-5 md:p-6">
          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 mx-auto">
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <h3 className="font-semibold text-foreground">Reset Email Sent</h3>
              <p className="text-sm text-muted-foreground text-pretty">
                Password reset link has been sent to your email address. Please check your inbox.
              </p>
              <p className="text-xs text-muted-foreground">The link will expire in 30 minutes.</p>
              <Link to="/login">
                <Button variant="outline" className="w-full mt-2">Back to Login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground block">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldError(''); }}
                    placeholder="your@email.com"
                    className={`pl-9 ${fieldError ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                    autoComplete="email"
                  />
                </div>
                {fieldError && (
                  <div className="flex items-center gap-1.5 text-destructive text-xs mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldError}</span>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
