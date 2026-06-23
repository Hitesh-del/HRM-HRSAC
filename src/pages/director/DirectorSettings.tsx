import { useState } from 'react';
import { Shield, Lock, Bell, User, Eye, EyeOff, Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileImageCropper } from '@/components/common/ProfileImageCropper';
import { TrustedDevicesPanel } from '@/components/common/TrustedDevicesPanel';

export default function DirectorSettings() {
  const { profile, refreshProfile } = useAuth();
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [uploadingSave, setUploadingSave] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('Min 8 characters'); return; }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.error(error.message); } else { toast.success('Password updated'); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }
    setChangingPwd(false);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() }).eq('id', profile!.id);
    if (error) { toast.error(error.message); } else { toast.success('Profile updated'); await refreshProfile(); }
    setSavingProfile(false);
  };

  const handleAvatarSave = async (blob: Blob) => {
    setUploadingSave(true);
    try {
      const path = `avatars/${profile!.id}.webp`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' });
      if (uploadErr) { toast.error(uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', profile!.id);
      await refreshProfile();
      toast.success('Profile photo updated');
      setCropperOpen(false);
    } finally {
      setUploadingSave(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const { error } = await supabase.from('profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', profile!.id);
    if (!error) { await refreshProfile(); toast.success('Profile photo removed'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Settings</h1><p className="text-sm text-muted-foreground">Account and system settings</p></div>
      <Tabs defaultValue="profile">
        <TabsList className="w-full md:w-auto"><TabsTrigger value="profile" className="flex-1 md:flex-none whitespace-nowrap">Profile</TabsTrigger><TabsTrigger value="security" className="flex-1 md:flex-none whitespace-nowrap">Security</TabsTrigger><TabsTrigger value="notifications" className="flex-1 md:flex-none whitespace-nowrap">Notifications</TabsTrigger></TabsList>
        <TabsContent value="profile" className="mt-4 space-y-4">
          {/* Avatar card */}
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><User className="w-4 h-4"/>Profile Photo</CardTitle></CardHeader>
            <CardContent className="flex items-center flex-wrap gap-4">
              <div className="relative group shrink-0">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">{profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <button type="button" onClick={() => setCropperOpen(true)}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Camera className="w-5 h-5 text-white" />
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground">Director</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCropperOpen(true)} className="gap-1.5 text-xs h-7 px-2.5">
                    <Camera className="w-3 h-3" /> Change Photo
                  </Button>
                  {profile?.avatar_url && (
                    <Button variant="ghost" size="sm" onClick={handleRemoveAvatar} className="gap-1 text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3 h-3" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Profile info card */}
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Shield className="w-4 h-4"/>Profile Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Full Name</label><Input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Full Name"/></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Email</label><Input value={profile?.email||''} disabled className="opacity-60 cursor-not-allowed"/></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Phone</label><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 234 567 8900"/></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Role</label><Input value="Director" disabled className="opacity-60 cursor-not-allowed"/></div>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>{savingProfile?'Saving...':'Save Changes'}</Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security" className="mt-4 space-y-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Lock className="w-4 h-4"/>Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Current Password</label>
                <div className="relative"><Input type={showOld?'text':'password'} value={oldPassword} onChange={e=>setOldPassword(e.target.value)} className="pr-9"/><button type="button" onClick={()=>setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showOld?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>
              </div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">New Password</label>
                <div className="relative"><Input type={showNew?'text':'password'} value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="pr-9"/><button type="button" onClick={()=>setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showNew?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button></div>
              </div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Confirm Password</label><Input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></div>
              <Button onClick={handleChangePassword} disabled={changingPwd}>{changingPwd?'Updating...':'Update Password'}</Button>
            </CardContent>
          </Card>
          <TrustedDevicesPanel />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <Card className="max-w-lg">
            <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Bell className="w-4 h-4"/>Notification Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[{l:'Leave Request Alerts',d:'Notify when employees submit leave'},{l:'Attendance Alerts',d:'Daily attendance summary'},{l:'Payroll Reminders',d:'Monthly payroll processing reminder'},{l:'New Joiners',d:'When a new employee is added'},{l:'Performance Reviews',d:'Review cycle reminders'}].map(item=>(
                <div key={item.l} className="flex items-center justify-between flex-wrap gap-3 py-2 border-b border-border last:border-0">
                  <div><p className="text-sm font-medium text-foreground">{item.l}</p><p className="text-xs text-muted-foreground">{item.d}</p></div>
                  <Switch defaultChecked/>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProfileImageCropper
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        onSave={handleAvatarSave}
        saving={uploadingSave}
      />
    </div>
  );
}
