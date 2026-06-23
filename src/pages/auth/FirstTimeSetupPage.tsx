import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Shield, Building2, User, Phone, Mail, Lock, Eye, EyeOff, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { DirectorSignupParams } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';

interface SetupFormValues {
  companyName: string;
  directorName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
}

export default function FirstTimeSetupPage() {
  const { signUpDirector, companySettings } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');

  const form = useForm<SetupFormValues>({
    defaultValues: {
      companyName: '', directorName: '', email: '', phone: '',
      password: '', confirmPassword: '', agreeTerms: false,
    },
  });

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-card border border-border rounded-lg p-8 text-center">
          <Shield className="mx-auto mb-4 w-12 h-12 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold text-foreground mb-2">Verify Your Email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            A confirmation email has been sent to <span className="font-medium text-foreground">{confirmationEmail}</span>.
            Please check your inbox to complete signup.
          </p>
          <div className="space-y-3">
            <Link to="/login">
              <Button className="w-full">Go to Login</Button>
            </Link>
            <Button variant="secondary" className="w-full" onClick={() => window.location.reload()}>
              Resend setup email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (companySettings?.director_signup_completed) {
    return <Navigate to="/login" replace />;
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo file must be under 2MB'); return; }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: SetupFormValues) => {
    if (values.password !== values.confirmPassword) {
      form.setError('confirmPassword', { message: 'Passwords do not match' });
      return;
    }
    if (!values.agreeTerms) {
      toast.error('Please agree to the Terms & Privacy Policy');
      return;
    }

    setLoading(true);
    try {
      const params: DirectorSignupParams = {
        companyName: values.companyName,
        directorName: values.directorName,
        email: values.email,
        phone: values.phone,
        password: values.password,
      };

      const { error } = await signUpDirector(params);
      if (error) throw error;

      // Upload logo if provided
      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `company/logo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('company-assets')
          .upload(path, logoFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
          await supabase.from('company_settings').update({ company_logo_url: urlData.publicUrl }).eq('director_signup_completed', true);
        }
      }

      setConfirmationEmail(params.email);
      setConfirmationSent(true);
      toast.success('Verification email sent. Please check your inbox.');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Company Setup</h1>
          <p className="text-muted-foreground mt-1 text-sm">Initialize your HRM system with Director account</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Logo Upload */}
              <div className="flex items-center flex-wrap gap-4 mb-2">
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted overflow-hidden">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Company Logo</p>
                  <p className="text-xs text-muted-foreground mb-2">PNG, JPG up to 2MB</p>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors">
                      <Upload className="w-3 h-3" /> Upload Logo
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </label>
                </div>
              </div>

              <FormField control={form.control} name="companyName" rules={{ required: 'Company name is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Company Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input {...field} placeholder="Acme Corporation" className="pl-9" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField control={form.control} name="directorName" rules={{ required: 'Director name is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Director Full Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input {...field} placeholder="John Smith" className="pl-9" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="email" rules={{ required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input {...field} type="email" placeholder="director@company.com" className="pl-9" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Mobile Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input {...field} placeholder="+1 234 567 8900" className="pl-9" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="password" rules={{ required: 'Password required', minLength: { value: 8, message: 'Min 8 characters' } }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="pl-9 pr-9" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="confirmPassword" rules={{ required: 'Please confirm password' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input {...field} type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" className="pl-9 pr-9" />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField control={form.control} name="agreeTerms"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                    </FormControl>
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      I agree to the{' '}
                      <span className="text-primary cursor-pointer hover:underline">Terms of Service</span>{' '}
                      and{' '}
                      <span className="text-primary cursor-pointer hover:underline">Privacy Policy</span>
                    </div>
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Setting up...' : 'Initialize HRM System'}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
