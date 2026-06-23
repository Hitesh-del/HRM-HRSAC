import { useEffect, useState } from 'react';
import { Save, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CompanyWorkSchedule } from '@/types/types';

const DAYS: { key: keyof CompanyWorkSchedule; label: string }[] = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
];

type ScheduleForm = {
  monday: boolean; tuesday: boolean; wednesday: boolean;
  thursday: boolean; friday: boolean; saturday: boolean; sunday: boolean;
  start_time: string; end_time: string;
};

const DEFAULTS: ScheduleForm = {
  monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
  saturday: false, sunday: false,
  start_time: '09:00', end_time: '17:00',
};

export default function WorkSchedulePanel() {
  const { companySettings } = useAuth();
  const [form, setForm] = useState<ScheduleForm>(DEFAULTS);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companySettings) return;
    supabase
      .from('company_work_schedule')
      .select('*')
      .eq('company_settings_id', companySettings.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setScheduleId(data.id);
          setForm({
            monday: data.monday, tuesday: data.tuesday, wednesday: data.wednesday,
            thursday: data.thursday, friday: data.friday,
            saturday: data.saturday, sunday: data.sunday,
            start_time: data.start_time, end_time: data.end_time,
          });
        }
        setLoading(false);
      });
  }, [companySettings]);

  const handleSave = async () => {
    if (!companySettings) return;
    if (form.start_time >= form.end_time) {
      toast.error('End time must be after start time.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, company_settings_id: companySettings.id, updated_at: new Date().toISOString() };
      if (scheduleId) {
        const { error } = await supabase.from('company_work_schedule').update(payload).eq('id', scheduleId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('company_work_schedule').insert(payload).select('id').maybeSingle();
        if (error) throw error;
        if (data) setScheduleId(data.id);
      }
      toast.success('Work schedule saved successfully.');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (key: keyof ScheduleForm) => {
    setForm(prev => ({ ...prev, [key]: !prev[key as keyof ScheduleForm] }));
  };

  if (loading) return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4 text-primary"/>Company Work Schedule</CardTitle></CardHeader>
      <CardContent className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 bg-muted" />)}</CardContent>
    </Card>
  );

  const enabledDays = DAYS.filter(d => form[d.key as keyof ScheduleForm]).map(d => d.label);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          Company Work Schedule
        </CardTitle>
        <p className="text-xs text-muted-foreground">Define official working days and hours used across the entire HRM system.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Working Days */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Working Days</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
            {DAYS.map(({ key, label }) => (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`day-${key}`} className="text-sm text-foreground cursor-pointer">{label}</Label>
                <Switch
                  id={`day-${key}`}
                  checked={!!form[key as keyof ScheduleForm]}
                  onCheckedChange={() => toggleDay(key as keyof ScheduleForm)}
                />
              </div>
            ))}
          </div>
          {enabledDays.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Active: <span className="text-foreground font-medium">{enabledDays.join(' · ')}</span>
            </p>
          )}
        </div>

        {/* Working Hours */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Working Hours</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Start Time</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))}
                className="w-36"
              />
            </div>
            <span className="text-muted-foreground mt-5">to</span>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">End Time</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))}
                className="w-36"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Hours: <span className="text-foreground font-medium">
              {form.start_time} – {form.end_time}
            </span>
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? 'Saving…' : 'Save Schedule'}
        </Button>
      </CardContent>
    </Card>
  );
}
