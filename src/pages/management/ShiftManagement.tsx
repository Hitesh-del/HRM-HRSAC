import { useEffect, useState, useCallback } from 'react';
import { Plus, Edit, Trash2, Clock, Users, Sun, Moon, Sunset, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

type ShiftType = 'morning' | 'evening' | 'night' | 'general';

interface Shift {
  id: string; name: string; shift_type: ShiftType; start_time: string;
  end_time: string; department_id: string | null; description: string | null; is_active: boolean; created_at: string;
}
interface Assignment {
  id: string; shift_id: string; employee_id: string; effective_from: string;
  effective_to: string | null; created_at: string;
  shift?: { name: string; shift_type: string; start_time: string; end_time: string } | null;
  employee?: { id: string; full_name: string; employee_id: string } | null;
}
interface Member { id: string; full_name: string; employee_id: string; }

interface ShiftForm { name: string; shift_type: ShiftType; start_time: string; end_time: string; description: string; }
interface AssignForm { employee_id: string; shift_id: string; effective_from: string; effective_to: string; }

const SHIFT_TYPE_PRESETS: Record<ShiftType, { start: string; end: string; label: string }> = {
  morning: { start: '06:00', end: '14:00', label: 'Morning Shift' },
  evening: { start: '14:00', end: '22:00', label: 'Evening Shift' },
  night:   { start: '22:00', end: '06:00', label: 'Night Shift' },
  general: { start: '09:00', end: '18:00', label: 'General Shift' },
};

const SHIFT_COLORS: Record<string, string> = {
  morning: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  evening: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  night:   'border-blue-500/30 text-blue-400 bg-blue-500/10',
  general: 'border-green-500/30 text-green-400 bg-green-500/10',
};

function ShiftIcon({ type }: { type: string }) {
  if (type === 'morning') return <Sun className="w-4 h-4 text-yellow-400" />;
  if (type === 'evening') return <Sunset className="w-4 h-4 text-orange-400" />;
  if (type === 'night')   return <Moon className="w-4 h-4 text-blue-400" />;
  return <Clock className="w-4 h-4 text-green-400" />;
}

export default function ShiftManagement() {
  const { profile } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftDialog, setShiftDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [saving, setSaving] = useState(false);

  const shiftForm = useForm<ShiftForm>({
    defaultValues: { name: '', shift_type: 'general', start_time: '09:00', end_time: '18:00', description: '' },
  });
  const assignForm = useForm<AssignForm>({
    defaultValues: { employee_id: '', shift_id: '', effective_from: new Date().toISOString().split('T')[0], effective_to: '' },
  });

  const fetchAll = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const [shiftsRes, assignRes, membersRes] = await Promise.all([
      supabase.from('shifts').select('*').eq('department_id', profile.department_id).order('created_at', { ascending: false }),
      supabase.from('shift_assignments').select('id,shift_id,employee_id,effective_from,effective_to,created_at,shift:shifts(name,shift_type,start_time,end_time),employee:profiles(id,full_name,employee_id)').eq('shift_id', 'shift_id').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,employee_id').eq('department_id', profile.department_id).in('role', ['employee', 'management']).eq('is_active', true).order('full_name'),
    ]);
    setShifts((shiftsRes.data || []) as Shift[]);
    setMembers((membersRes.data || []) as Member[]);
    // Load assignments by fetching for dept shift ids
    const shiftIds = (shiftsRes.data || []).map((s: any) => s.id);
    if (shiftIds.length > 0) {
      const { data: aData } = await supabase.from('shift_assignments')
        .select('id,shift_id,employee_id,effective_from,effective_to,created_at,shift:shifts(name,shift_type,start_time,end_time),employee:profiles(id,full_name,employee_id)')
        .in('shift_id', shiftIds).order('created_at', { ascending: false });
      setAssignments((aData || []) as unknown as Assignment[]);
    } else {
      setAssignments([]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!profile?.department_id) return;
    const ch = supabase.channel('shift-mgmt-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, fetchAll]);

  const openCreateShift = () => {
    setEditingShift(null);
    shiftForm.reset({ name: '', shift_type: 'general', start_time: '09:00', end_time: '18:00', description: '' });
    setShiftDialog(true);
  };
  const openEditShift = (s: Shift) => {
    setEditingShift(s);
    shiftForm.reset({ name: s.name, shift_type: s.shift_type, start_time: s.start_time, end_time: s.end_time, description: s.description || '' });
    setShiftDialog(true);
  };

  const onShiftTypeChange = (type: ShiftType) => {
    shiftForm.setValue('shift_type', type);
    const preset = SHIFT_TYPE_PRESETS[type];
    shiftForm.setValue('start_time', preset.start);
    shiftForm.setValue('end_time', preset.end);
    if (!shiftForm.getValues('name')) shiftForm.setValue('name', preset.label);
  };

  const onSaveShift = async (v: ShiftForm) => {
    setSaving(true);
    const payload = { name: v.name, shift_type: v.shift_type, start_time: v.start_time, end_time: v.end_time, description: v.description || null, department_id: profile?.department_id };
    const { error } = editingShift
      ? await supabase.from('shifts').update(payload).eq('id', editingShift.id)
      : await supabase.from('shifts').insert(payload);
    if (error) { toast.error(error.message); } else { toast.success(editingShift ? 'Shift updated' : 'Shift created'); setShiftDialog(false); fetchAll(); }
    setSaving(false);
  };

  const deleteShift = async (id: string) => {
    const { error } = await supabase.from('shifts').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Shift deleted');
    fetchAll();
  };

  const onAssign = async (v: AssignForm) => {
    setSaving(true);
    const { error } = await supabase.from('shift_assignments').insert({
      employee_id: v.employee_id, shift_id: v.shift_id,
      effective_from: v.effective_from, effective_to: v.effective_to || null,
    });
    if (error) { toast.error(error.message); } else { toast.success('Shift assigned'); setAssignDialog(false); assignForm.reset(); fetchAll(); }
    setSaving(false);
  };

  const removeAssignment = async (id: string) => {
    const { error } = await supabase.from('shift_assignments').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Assignment removed');
    fetchAll();
  };

  const formatTime = (t: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h % 12) || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Shift Management</h1>
          <p className="text-sm text-muted-foreground">Create and manage team shift schedules</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button onClick={() => { assignForm.reset({ employee_id:'', shift_id:'', effective_from: new Date().toISOString().split('T')[0], effective_to:'' }); setAssignDialog(true); }} variant="secondary" className="gap-1.5">
            <Users className="w-4 h-4" /> Assign
          </Button>
          <Button onClick={openCreateShift} className="gap-1.5">
            <Plus className="w-4 h-4" /> Create Shift
          </Button>
        </div>
      </div>

      <Tabs defaultValue="shifts">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="shifts" className="flex-1 min-w-0 md:flex-none gap-1.5"><Clock className="w-3.5 h-3.5" /> Shifts ({shifts.length})</TabsTrigger>
          <TabsTrigger value="assignments" className="flex-1 min-w-0 md:flex-none gap-1.5"><Calendar className="w-3.5 h-3.5" /> Assignments ({assignments.length})</TabsTrigger>
        </TabsList>

        {/* ── SHIFTS TAB ── */}
        <TabsContent value="shifts" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20" /></CardContent></Card>)}
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Clock className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">No shifts created yet</p>
              <p className="text-sm text-muted-foreground">Create Morning, Evening, Night or General shifts for your team.</p>
              <Button onClick={openCreateShift} className="gap-2 mt-2"><Plus className="w-4 h-4" /> Create First Shift</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shifts.map(s => {
                const assignCount = assignments.filter(a => a.shift_id === s.id).length;
                return (
                  <Card key={s.id} className="h-full">
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div className="flex items-center flex-wrap gap-2 min-w-0">
                          <ShiftIcon type={s.shift_type} />
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{s.name}</p>
                            <Badge variant="outline" className={`text-xs mt-0.5 ${SHIFT_COLORS[s.shift_type] || ''}`}>{SHIFT_TYPE_PRESETS[s.shift_type]?.label || s.shift_type}</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditShift(s)}><Edit className="w-3.5 h-3.5" /></Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                              <AlertDialogHeader><AlertDialogTitle>Delete Shift?</AlertDialogTitle><AlertDialogDescription>This will delete "{s.name}" and all its assignments.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteShift(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{formatTime(s.start_time)} – {formatTime(s.end_time)}</div>
                        <div className="flex items-center gap-1.5 text-muted-foreground"><Users className="w-3.5 h-3.5" />{assignCount} assigned</div>
                      </div>
                      {s.description && <p className="text-xs text-muted-foreground text-pretty">{s.description}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ASSIGNMENTS TAB ── */}
        <TabsContent value="assignments" className="mt-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">No shift assignments yet</p>
              <Button onClick={() => { assignForm.reset({ employee_id:'', shift_id:'', effective_from: new Date().toISOString().split('T')[0], effective_to:'' }); setAssignDialog(true); }} className="gap-2 mt-2"><Plus className="w-4 h-4" /> Assign Shift</Button>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Employee','Shift','Shift Type','Time','From','To','Action'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{(a.employee as any)?.full_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{(a.employee as any)?.employee_id || ''}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{(a.shift as any)?.name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${SHIFT_COLORS[(a.shift as any)?.shift_type || 'general'] || ''}`}>{SHIFT_TYPE_PRESETS[(a.shift as any)?.shift_type as ShiftType]?.label || (a.shift as any)?.shift_type || '—'}</Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{formatTime((a.shift as any)?.start_time)} – {formatTime((a.shift as any)?.end_time)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{a.effective_from}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{a.effective_to || 'Ongoing'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                              <AlertDialogHeader><AlertDialogTitle>Remove Assignment?</AlertDialogTitle><AlertDialogDescription>Remove shift assignment for {(a.employee as any)?.full_name}?</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => removeAssignment(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── CREATE/EDIT SHIFT DIALOG ── */}
      <Dialog open={shiftDialog} onOpenChange={setShiftDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingShift ? 'Edit Shift' : 'Create Shift'}</DialogTitle></DialogHeader>
          <Form {...shiftForm}>
            <form onSubmit={shiftForm.handleSubmit(onSaveShift)} className="space-y-4">
              <FormField control={shiftForm.control} name="shift_type" rules={{ required: 'Shift type is required' }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Shift Type</FormLabel>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(['morning','evening','night','general'] as ShiftType[]).map(t => (
                      <button key={t} type="button" onClick={() => onShiftTypeChange(t)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${field.value === t ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`}>
                        <ShiftIcon type={t} />{SHIFT_TYPE_PRESETS[t].label}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={shiftForm.control} name="name" rules={{ required: 'Shift name is required' }} render={({ field }) => (
                <FormItem><FormLabel>Shift Name</FormLabel><FormControl><Input placeholder="e.g. Morning A Team" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={shiftForm.control} name="start_time" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={shiftForm.control} name="end_time" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={shiftForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea rows={2} placeholder="Any notes about this shift..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setShiftDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingShift ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── ASSIGN SHIFT DIALOG ── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Assign Shift to Employee</DialogTitle></DialogHeader>
          <Form {...assignForm}>
            <form onSubmit={assignForm.handleSubmit(onAssign)} className="space-y-4">
              <FormField control={assignForm.control} name="employee_id" rules={{ required: 'Employee is required' }} render={({ field }) => (
                <FormItem><FormLabel>Employee</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.employee_id})</SelectItem>)}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              <FormField control={assignForm.control} name="shift_id" rules={{ required: 'Shift is required' }} render={({ field }) => (
                <FormItem><FormLabel>Shift</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                    <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({formatTime(s.start_time)} – {formatTime(s.end_time)})</SelectItem>)}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={assignForm.control} name="effective_from" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>From</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={assignForm.control} name="effective_to" render={({ field }) => (
                  <FormItem><FormLabel>To (optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setAssignDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || shifts.length === 0}>{saving ? 'Assigning…' : 'Assign Shift'}</Button>
              </div>
              {shifts.length === 0 && <p className="text-xs text-yellow-400 text-center">Create at least one shift first.</p>}
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
