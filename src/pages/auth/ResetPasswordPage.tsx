import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';

type PageState = 'loading' | 'form' | 'expired' | 'success';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    // Supabase sends a PASSWORD_RECOVERY event when the reset link is clicked.
    // The access_token in the URL hash is automatically consumed by the client.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('form');
      }
    });

    // Also check if we already have a session (user landed with valid token)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState('form');
      } else {
        // Give it a moment for auth state change to fire, then treat as expired
        const timer = setTimeout(() => {
          setPageState((s) => s === 'loading' ? 'expired' : s);
        }, 2000);
        return () => clearTimeout(timer);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validate = (): boolean => {
    const errs: { password?: string; confirm?: string } = {};
    if (!password) errs.password = 'Please enter a new password';
    else if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!confirm) errs.confirm = 'Please confirm your new password';
    else if (password && confirm && password !== confirm) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPageState('success');
      toast.success('Password updated successfully');
      // Redirect to login after 3 seconds
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to update password. Please try again.');
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
            {pageState === 'success' ? (
              <CheckCircle className="w-7 h-7 text-green-500" />
            ) : pageState === 'expired' ? (
              <AlertCircle className="w-7 h-7 text-destructive" />
            ) : (
              <Shield className="w-7 h-7 text-primary" />
            )}
          </div>
          <h1 className="text-xl font-bold text-foreground text-balance">
            {pageState === 'success' ? 'Password Updated' :
             pageState === 'expired' ? 'Link Expired' :
             pageState === 'loading' ? 'Verifying Link...' :
             'Create New Password'}
          </h1>
          {pageState === 'form' && (
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              Choose a strong password with at least 8 characters
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5 md:p-6">

          {/* Loading */}
          {pageState === 'loading' && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Verifying your reset link…
            </div>
          )}

          {/* Expired */}
          {pageState === 'expired' && (
            <div className="space-y-4 text-center">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">
                  Reset link has expired.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Please request a new password reset link.
                </p>
              </div>
              <Link to="/forgot-password">
                <Button className="w-full">Request New Link</Button>
              </Link>
              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </div>
          )}

          {/* Success */}
          {pageState === 'success' && (
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 mx-auto">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Password updated successfully.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You can now login with your new password.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Redirecting to login in 3 seconds…</p>
              <Link to="/login">
                <Button variant="outline" className="w-full">Login Now</Button>
              </Link>
            </div>
          )}

          {/* Form */}
          {pageState === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground block">New Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors(v => ({ ...v, password: undefined })); }}
                    placeholder="Minimum 8 characters"
                    className={`pl-9 pr-10 ${errors.password ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <div className="flex items-center gap-1.5 text-destructive text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.password}</span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-sm font-normal text-foreground block">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setErrors(v => ({ ...v, confirm: undefined })); }}
                    placeholder="Repeat your new password"
                    className={`pl-9 pr-10 ${errors.confirm ? 'border-destructive focus-visible:ring-destructive/30' : ''}`}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirm && (
                  <div className="flex items-center gap-1.5 text-destructive text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.confirm}</span>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating Password...' : 'Update Password'}
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
