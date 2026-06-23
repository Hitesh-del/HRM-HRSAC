import { useState } from 'react';
import { User, Save, Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileImageCropper } from '@/components/common/ProfileImageCropper';

export default function MyProfile() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [uploadingSave, setUploadingSave] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() }).eq('id', profile!.id);
    if (error) { toast.error(error.message); } else { toast.success('Profile updated'); await refreshProfile(); }
    setSaving(false);
  };

  const handleAvatarSave = async (blob: Blob) => {
    setUploadingSave(true);
    try {
      const path = `avatars/${profile!.id}.webp`;
      const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' });
      if (uploadErr) { toast.error(uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Bust cache with timestamp
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
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">My Profile</h1><p className="text-sm text-muted-foreground">Personal information and account settings</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 md:p-6 flex flex-col items-center text-center gap-4">
            {/* Avatar with actions */}
            <div className="relative group">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl md:text-2xl">{profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => setCropperOpen(true)}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
              >
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setCropperOpen(true)} className="gap-1.5 text-xs h-7 px-2.5">
                <Camera className="w-3 h-3" /> Change Photo
              </Button>
              {profile?.avatar_url && (
                <Button variant="ghost" size="sm" onClick={handleRemoveAvatar} className="gap-1 text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
            <div><h3 className="font-semibold text-foreground">{profile?.full_name}</h3><p className="text-xs text-muted-foreground">{profile?.employee_id}</p></div>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 capitalize">{profile?.role}</Badge>
            <div className="w-full space-y-1 text-xs text-left">
              <div className="flex justify-between flex-wrap gap-2 py-1 border-b border-border"><span className="text-muted-foreground">Department</span><span className="text-foreground">{profile?.department?.name || '—'}</span></div>
              <div className="flex justify-between flex-wrap gap-2 py-1 border-b border-border"><span className="text-muted-foreground">Designation</span><span className="text-foreground">{profile?.designation || '—'}</span></div>
              <div className="flex justify-between flex-wrap gap-2 py-1"><span className="text-muted-foreground">Joined</span><span className="text-foreground">{profile?.date_of_joining ? new Date(profile.date_of_joining!).toLocaleDateString() : '—'}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><User className="w-4 h-4" />Edit Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Full Name</label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Email</label><Input value={profile?.email || ''} disabled className="opacity-60" /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Phone</label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234 567 8900" /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Employee ID</label><Input value={profile?.employee_id || ''} disabled className="opacity-60" /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Department</label><Input value={profile?.department?.name || '—'} disabled className="opacity-60" /></div>
              <div><label className="text-sm font-normal text-foreground block mb-1.5">Designation</label><Input value={profile?.designation || '—'} disabled className="opacity-60" /></div>
            </div>
            <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-1.5" />{saving ? 'Saving...' : 'Save Changes'}</Button>
          </CardContent>
        </Card>
      </div>

      <ProfileImageCropper
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        onSave={handleAvatarSave}
        saving={uploadingSave}
      />
    </div>
  );
}
