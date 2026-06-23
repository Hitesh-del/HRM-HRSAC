import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, CalendarDays, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Holiday } from '@/types/types';

const HOLIDAY_TYPES = [
  { value: 'public',    label: 'Public Holiday' },
  { value: 'festival',  label: 'Festival' },
  { value: 'company',   label: 'Company Event' },
  { value: 'annual',    label: 'Annual Day' },
  { value: 'emergency', label: 'Emergency Holiday' },
];

const TYPE_STYLES: Record<string, string> = {
  public:    'border-blue-500/30 text-blue-400 bg-blue-500/10',
  festival:  'border-purple-500/30 text-purple-400 bg-purple-500/10',
  company:   'border-green-500/30 text-green-400 bg-green-500/10',
  annual:    'border-orange-500/30 text-orange-400 bg-orange-500/10',
  emergency: 'border-red-500/30 text-red-400 bg-red-500/10',
};

interface HolidayForm {
  name: string;
  date: string;
  reason: string;
  type: string;
}

const EMPTY_FORM: HolidayForm = { name: '', date: '', reason: '', type: 'public' };

export default function HolidayManagementPanel() {
  const { companySettings, profile } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchHolidays = useCallback(async () => {
    if (!companySettings) return;
    const { data } = await supabase
      .from('holidays')
      .select('*')
      .eq('company_settings_id', companySettings.id)
      .order('date', { ascending: true });
    setHolidays((data || []) as Holiday[]);
    setLoading(false);
  }, [companySettings]);

  useEffect(() => {
    fetchHolidays();
    // Realtime updates
    const ch = supabase.channel('holidays-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holidays' }, fetchHolidays)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchHolidays]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setDialogOpen(true); };
  const openEdit = (h: Holiday) => {
    setForm({ name: h.name, date: h.date, reason: h.reason || '', type: h.type });
    setEditId(h.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.date) { toast.error('Name and date are required.'); return; }
    if (!companySettings) return;
    setSaving(true);
    try {
      const payload = {
        company_settings_id: companySettings.id,
        name: form.name.trim(),
        date: form.date,
        reason: form.reason.trim() || null,
        type: form.type,
        created_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      };
      if (editId) {
        const { error } = await supabase.from('holidays').update(payload).eq('id', editId);
        if (error) throw error;
        toast.success('Holiday updated.');
      } else {
        const { error } = await supabase.from('holidays').insert(payload);
        if (error) {
          if (error.code === '23505') { toast.error('A holiday already exists on this date.'); return; }
          throw error;
        }
        toast.success('Holiday added.');
      }
      setDialogOpen(false);
      fetchHolidays();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to save holiday.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('holidays').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Holiday removed.');
    setDeleteId(null);
    fetchHolidays();
  };

  const upcoming = holidays.filter(h => h.date >= new Date().toISOString().split('T')[0]);
  const past     = holidays.filter(h => h.date <  new Date().toISOString().split('T')[0]);

  const renderList = (list: Holiday[]) => list.map(h => (
    <div key={h.id} className="flex flex-wrap items-start justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary leading-none">
            {new Date(h.date + 'T12:00:00').toLocaleDateString('en', { day: '2-digit' })}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {new Date(h.date + 'T12:00:00').toLocaleDateString('en', { month: 'short' })}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm truncate">{h.name}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(h.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          {h.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{h.reason}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className={`text-xs ${TYPE_STYLES[h.type] || ''}`}>
          {HOLIDAY_TYPES.find(t => t.value === h.type)?.label || h.type}
        </Badge>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(h)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(h.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  ));

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                Holiday Management
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Declare holidays — automatically reflected in all panels and attendance.</p>
            </div>
            <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1.5" />Add Holiday</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 bg-muted" />)}</div>
          ) : holidays.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No holidays declared yet.</p>
              <Button size="sm" variant="outline" onClick={openAdd}><Plus className="w-4 h-4 mr-1.5" />Add First Holiday</Button>
            </div>
          ) : (
            <div>
              {upcoming.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upcoming ({upcoming.length})</p>
                  {renderList(upcoming)}
                </div>
              )}
              {past.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past ({past.length})</p>
                  <div className="opacity-60">{renderList(past)}</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Holiday Name *</Label>
              <Input placeholder="e.g. Diwali" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Holiday Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOLIDAY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason / Note</Label>
              <Textarea placeholder="Optional description…" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Add Holiday'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Holiday?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the holiday and update attendance calculations. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
