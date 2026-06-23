import { useState } from 'react';
import { Lock, Bell, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TrustedDevicesPanel } from '@/components/common/TrustedDevicesPanel';

export default function EmpSettings() {
  const { profile, refreshProfile } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() }).eq('id', profile!.id);
    if (error) { toast.error(error.message); } else { toast.success('Profile updated'); await refreshProfile(); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('Minimum 8 characters required'); return; }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.error(error.message); } else { toast.success('Password updated'); setNewPassword(''); setConfirmPassword(''); }
    setChangingPwd(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Settings</h1><p className="text-sm text-muted-foreground">Manage your account settings</p></div>
      <Tabs defaultValue="profile">
        <TabsList className="w-full md:w-auto"><TabsTrigger value="profile" className="flex-1 md:flex-none whitespace-nowrap">Profile</TabsTrigger><TabsTrigger value="security" className="flex-1 md:flex-none whitespace-nowrap">Security</TabsTrigger><TabsTrigger value="notifications" className="flex-1 md:flex-none whitespace-nowrap">Notifications</TabsTrigger></TabsList>
        <TabsContent value="profile" className="mt-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><User className="w-4 h-4" />Profile</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Full Name</label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Email</label><Input value={profile?.email || ''} disabled className="opacity-60" /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 8900" /></div>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Lock className="w-4 h-4" />Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-normal text-foreground block mb-1.5">New Password</label>
                <div className="relative"><Input type={showNew ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pr-9" /><button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
              </div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Confirm</label><Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
              <Button onClick={handleChangePassword} disabled={changingPwd}>{changingPwd ? 'Updating...' : 'Update Password'}</Button>
            </CardContent>
          </Card>
          <TrustedDevicesPanel />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Bell className="w-4 h-4" />Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {['Leave Approval Updates', 'Task Assignments', 'Payslip Available', 'Announcements', 'Training Assignments'].map(l => (
                <div key={l} className="flex items-center justify-between flex-wrap gap-3 py-2 border-b border-border last:border-0"><p className="text-sm text-foreground">{l}</p><Switch defaultChecked /></div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
