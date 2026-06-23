import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile, CompanySettings } from '@/types/types';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, department:departments!profiles_department_id_fkey(id,name)')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.error('Error fetching profile:', error); return null; }
  return data;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from('company_settings')
    .select('*')
    .maybeSingle();
  return data;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  companySettings: CompanySettings | null;
  loading: boolean;
  // ── New-device OTP verification state ──────────────────────────────────────
  // Stored here (not in LoginPage) so it survives any navigation/remount.
  // otpPending=true means a session must NOT be created yet — RouteGuard
  // will block all protected routes until this is false.
  otpPending: boolean;
  setOtpPending: (value: boolean) => void;
  // User ID of the account awaiting OTP — needed by verify-device-otp call.
  otpUserId: string | null;
  setOtpUserId: (value: string | null) => void;
  // Masked email shown in the OTP UI banner.
  otpMaskedEmail: string;
  setOtpMaskedEmail: (value: string) => void;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
  signUpDirector: (params: DirectorSignupParams) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCompanySettings: () => Promise<void>;
}

export interface DirectorSignupParams {
  companyName: string;
  directorName: string;
  email: string;
  phone: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpPending, setOtpPending] = useState(false);
  const [otpUserId, setOtpUserId] = useState<string | null>(null);
  const [otpMaskedEmail, setOtpMaskedEmail] = useState('');

  const refreshProfile = async () => {
    if (!user) { setProfile(null); return; }
    const p = await getProfile(user.id);
    setProfile(p);
  };

  const refreshCompanySettings = async () => {
    const s = await getCompanySettings();
    setCompanySettings(s);
  };

  useEffect(() => {
    getCompanySettings().then(setCompanySettings);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) getProfile(session.user.id).then(setProfile);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        getProfile(session.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (identifier: string, password: string) => {
    try {
      // Support both email and username@miaoda.com
      const email = identifier.includes('@') ? identifier : `${identifier}@miaoda.com`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUpDirector = async (params: DirectorSignupParams) => {
    try {
      // Register director account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: { role: 'director', full_name: params.directorName },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (signUpError) throw signUpError;

      const userId = authData.user?.id ?? null;
      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          full_name: params.directorName,
          phone: params.phone || null,
          role: 'director',
          employee_id: 'DIR-001',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }

      // Mark director signup as completed and set company name.
      const { error: settingsError } = await supabase.from('company_settings').update({
        company_name: params.companyName,
        director_signup_completed: true,
        updated_at: new Date().toISOString(),
      });
      if (settingsError) {
        console.error('Failed to mark company setup complete:', settingsError);
      }

      await refreshCompanySettings();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{
      user, profile, companySettings, loading,
      otpPending, setOtpPending,
      otpUserId, setOtpUserId,
      otpMaskedEmail, setOtpMaskedEmail,
      signIn, signUpDirector, signOut, refreshProfile, refreshCompanySettings
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
