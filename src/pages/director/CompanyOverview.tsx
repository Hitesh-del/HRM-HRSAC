import { useEffect, useState } from 'react';
import { Building2, Users, GitBranch, Camera, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileImageCropper } from '@/components/common/ProfileImageCropper';
import WorkSchedulePanel from '@/components/common/WorkSchedulePanel';
import HolidayManagementPanel from '@/components/common/HolidayManagementPanel';

export default function CompanyOverview() {
  const { companySettings, refreshCompanySettings } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [logoPreview, setLogoPreview] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [uploadingSave, setUploadingSave] = useState(false);
  const [pendingLogoBlob, setPendingLogoBlob] = useState<Blob|null>(null);
  const [stats, setStats] = useState({ employees:0, managers:0, departments:0 });

  useEffect(() => {
    if (companySettings) { setCompanyName(companySettings.company_name); setLogoPreview(companySettings.company_logo_url); }
    const fetchStats = async () => {
      const [{ count: emp },{ count: mgr },{ count: dept }] = await Promise.all([
        supabase.from('profiles').select('*',{count:'exact',head:true}).eq('role','employee').eq('is_active',true),
        supabase.from('profiles').select('*',{count:'exact',head:true}).eq('role','management').eq('is_active',true),
        supabase.from('departments').select('*',{count:'exact',head:true}),
      ]);
      setStats({ employees:emp||0, managers:mgr||0, departments:dept||0 });
    };
    fetchStats();
  }, [companySettings]);

  // Called by cropper — stage the blob and show preview
  const handleLogoCrop = async (blob: Blob) => {
    setUploadingSave(true);
    try {
      setPendingLogoBlob(blob);
      const preview = URL.createObjectURL(blob);
      setLogoPreview(preview);
      setCropperOpen(false);
      toast.success('Logo cropped — click Save to apply');
    } finally {
      setUploadingSave(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let logoUrl = companySettings?.company_logo_url || null;
      if (pendingLogoBlob) {
        const path = `company/logo_${companySettings?.id || 'main'}.webp`;
        const { error: uploadErr } = await supabase.storage.from('company-assets').upload(path, pendingLogoBlob, { upsert: true, contentType: 'image/webp' });
        if (uploadErr) { toast.error(uploadErr.message); setSaving(false); return; }
        const { data: urlData } = supabase.storage.from('company-assets').getPublicUrl(path);
        logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        setPendingLogoBlob(null);
      }
      await supabase.from('company_settings').update({ company_name:companyName, company_logo_url:logoUrl, updated_at:new Date().toISOString() }).eq('id',companySettings!.id);
      await refreshCompanySettings();
      toast.success('Company settings saved');
    } catch (err: unknown) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const handleRemoveLogo = () => {
    setPendingLogoBlob(null);
    setLogoPreview(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Company Overview</h1><p className="text-sm text-muted-foreground">Manage company profile and settings</p></div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[{l:'Total Employees',v:stats.employees,icon:Users,c:'text-primary',bg:'bg-primary/10'},{l:'Management',v:stats.managers,icon:Users,c:'text-blue-400',bg:'bg-blue-500/10'},{l:'Departments',v:stats.departments,icon:GitBranch,c:'text-purple-400',bg:'bg-purple-500/10'}].map(s=>(
          <Card key={s.l}><CardContent className="p-4 flex items-center flex-wrap gap-3"><div className={`w-10 h-10 rounded ${s.bg} flex items-center justify-center`}><s.icon className={`w-5 h-5 ${s.c}`}/></div><div><p className="text-xl font-bold text-foreground">{s.v}</p><p className="text-xs text-muted-foreground">{s.l}</p></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Company Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center flex-wrap gap-4">
            <div className="relative group w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted overflow-hidden shrink-0">
              {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" /> : <Building2 className="w-8 h-8 text-muted-foreground" />}
              <button type="button" onClick={() => setCropperOpen(true)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg">
                <Camera className="w-5 h-5 text-white" />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Company Logo</p>
              <p className="text-xs text-muted-foreground mb-2">PNG, JPG, WEBP · cropped to square</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setCropperOpen(true)} className="gap-1.5 text-xs h-7 px-2.5">
                  <Camera className="w-3 h-3" /> {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </Button>
                {logoPreview && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveLogo} className="gap-1 text-xs h-7 px-2 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3 h-3" /> Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="max-w-sm">
            <label className="text-sm font-normal text-foreground block mb-1.5">Company Name</label>
            <Input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Acme Corporation"/>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-32"><Save className="w-4 h-4 mr-1.5"/>{saving?'Saving...':'Save'}</Button>
        </CardContent>
      </Card>

      <ProfileImageCropper
        open={cropperOpen}
        onClose={() => setCropperOpen(false)}
        onSave={handleLogoCrop}
        saving={uploadingSave}
      />

      {/* Work Schedule */}
      <WorkSchedulePanel />

      {/* Holiday Management */}
      <HolidayManagementPanel />
    </div>
  );
}
