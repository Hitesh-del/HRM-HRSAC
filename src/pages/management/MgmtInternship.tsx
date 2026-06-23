import { useEffect, useState, useCallback } from 'react';
import {
  UserCheck, Users, CheckCircle, Clock, XCircle, Plus, Search,
  RefreshCw, Eye, Edit, BarChart3, GraduationCap, Calendar, FileDown
} from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

type InternStatus = 'created' | 'active' | 'in_progress' | 'completed' | 'expired';

const STATUS_STYLES: Record<InternStatus, string> = {
  created:     'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  active:      'border-green-500/30 text-green-400 bg-green-500/10',
  in_progress: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  completed:   'border-primary/30 text-primary bg-primary/10',
  expired:     'border-red-500/30 text-red-400 bg-red-500/10',
};

function computeStatus(start: string, end: string, current: InternStatus): InternStatus {
  const today = new Date(); today.setHours(0,0,0,0);
  const s = new Date(start); s.setHours(0,0,0,0);
  const e = new Date(end); e.setHours(0,0,0,0);
  if (current === 'completed') return 'completed';
  if (today > e) return 'expired';
  if (today >= s) return 'active';
  return 'created';
}

function daysRemaining(end: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const e = new Date(end); e.setHours(0,0,0,0);
  return Math.ceil((e.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function calcDuration(start: string, end: string) {
  const s = new Date(start); const e = new Date(end);
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (months >= 1) return `${months} Month${months > 1 ? 's' : ''}`;
  const days = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return `${days} Day${days !== 1 ? 's' : ''}`;
}

interface ManagerRow { id: string; full_name?: string }
interface InternRow {
  id: string; profile_id: string; college_name?: string; internship_role?: string;
  mobile_number?: string; start_date: string; end_date: string; duration_months?: number;
  reporting_manager_id?: string; status: InternStatus; notes?: string; created_at: string;
  account_disabled?: boolean;
  profile?: { id: string; full_name?: string; email?: string; employee_id?: string; department?: { name: string } | null } | null;
  reporting_manager?: { full_name?: string } | null;
}

interface InternForm {
  full_name: string; email: string; password: string; mobile_number: string;
  internship_role: string; college_name: string;
  start_date: string; end_date: string; reporting_manager_id: string; notes: string;
}

const EMPTY_FORM: InternForm = {
  full_name: '', email: '', password: '', mobile_number: '',
  internship_role: '', college_name: '', start_date: '', end_date: '',
  reporting_manager_id: '', notes: '',
};

export default function MgmtInternship() {
  const { profile: myProfile } = useAuth();
  const [interns, setInterns] = useState<InternRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);

  // Intern attendance state
  type InternAttRow = {
    id: string; date: string; check_in_time: string | null; check_out_time: string | null;
    working_hours: number | null; status: string;
    employee?: { employee_id?: string; full_name?: string; department?: { name: string } | null } | null;
  };
  const [attRecords, setAttRecords] = useState<InternAttRow[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attSearch, setAttSearch] = useState('');
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [exportOpen, setExportOpen] = useState(false);
  const [exportAttOpen, setExportAttOpen] = useState(false);
  const [viewIntern, setViewIntern] = useState<InternRow | null>(null);
  const [editIntern, setEditIntern] = useState<InternRow | null>(null);
  const [form, setForm] = useState<InternForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!myProfile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const [internsRes, mgrsRes] = await Promise.all([
      supabase.from('intern_details').select(`
        id,profile_id,college_name,internship_role,mobile_number,start_date,end_date,
        duration_months,reporting_manager_id,status,notes,created_at,account_disabled,
        profile:profiles!intern_details_profile_id_fkey(id,full_name,email,employee_id,department:departments!profiles_department_id_fkey(name)),
        reporting_manager:profiles!intern_details_reporting_manager_id_fkey(full_name)
      `).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name').eq('department_id', myProfile.department_id).in('role',['director','management']).eq('is_active',true).order('full_name'),
    ]);
    setInterns((internsRes.data || []) as unknown as InternRow[]);
    setManagers((mgrsRes.data || []) as ManagerRow[]);
    setLoading(false);
  }, [myProfile]);

  const fetchAttendance = useCallback(async () => {
    if (!myProfile?.department_id) return;
    setAttLoading(true);
    const { data: internMembers } = await supabase
      .from('profiles').select('id')
      .eq('department_id', myProfile.department_id).eq('role', 'intern').eq('is_active', true);
    const ids = (internMembers || []).map(m => m.id);
    if (!ids.length) { setAttRecords([]); setAttLoading(false); return; }
    const { data } = await supabase
      .from('attendance')
      .select('id,date,check_in_time,check_out_time,working_hours,status,employee:profiles!attendance_employee_id_fkey(id,full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
      .eq('date', attDate).in('employee_id', ids).order('created_at', { ascending: false });
    setAttRecords((data || []) as unknown as InternAttRow[]);
    setAttLoading(false);
  }, [myProfile, attDate]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  useEffect(() => {
    fetchAll();
    if (!myProfile?.department_id) return;
    const ch = supabase.channel('mgmt-interns-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intern_details' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll, myProfile]);

  // Auto-sync expired statuses
  useEffect(() => {
    const expired = interns.filter(i => computeStatus(i.start_date, i.end_date, i.status) === 'expired' && i.status !== 'expired');
    expired.forEach(i => supabase.from('intern_details').update({ status: 'expired' }).eq('id', i.id).then(() => {}));
  }, [interns]);

  const filtered = interns.filter(i => {
    const name = (i.profile as any)?.full_name?.toLowerCase() || '';
    const q = search.toLowerCase();
    const matchQ = !q || name.includes(q) || (i.internship_role || '').toLowerCase().includes(q) || (i.college_name || '').toLowerCase().includes(q);
    const disp = computeStatus(i.start_date, i.end_date, i.status);
    const matchStatus = statusFilter === 'all' || disp === statusFilter;
    return matchQ && matchStatus;
  });

  const stats = {
    total: interns.length,
    active: interns.filter(i => ['active','in_progress'].includes(computeStatus(i.start_date, i.end_date, i.status))).length,
    completed: interns.filter(i => computeStatus(i.start_date, i.end_date, i.status) === 'completed').length,
    expired: interns.filter(i => computeStatus(i.start_date, i.end_date, i.status) === 'expired').length,
  };

  const f = (k: keyof InternForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.start_date || !form.end_date) {
      toast.error('Full Name, Email, Start Date, and End Date are required'); return;
    }
    if (!editIntern && !form.password.trim()) { toast.error('Password is required'); return; }
    if (new Date(form.end_date) <= new Date(form.start_date)) { toast.error('End date must be after start date'); return; }
    setSaving(true);
    try {
      if (editIntern) {
        await supabase.from('profiles').update({ full_name: form.full_name.trim(), phone: form.mobile_number || null, updated_at: new Date().toISOString() }).eq('id', editIntern.profile_id);
        const durMonths = parseFloat((((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30.44))).toFixed(1));
        await supabase.from('intern_details').update({ college_name: form.college_name || null, internship_role: form.internship_role || null, mobile_number: form.mobile_number || null, start_date: form.start_date, end_date: form.end_date, duration_months: durMonths, reporting_manager_id: form.reporting_manager_id || null, notes: form.notes || null }).eq('id', editIntern.id);
        toast.success('Intern updated');
      } else {
        // Create intern via Edge Function (service_role — never hijacks current management session)
        const { data: result, error: fnErr } = await supabase.functions.invoke('create-intern', {
          body: {
            email: form.email.trim(),
            password: form.password,
            full_name: form.full_name.trim(),
            mobile_number: form.mobile_number || null,
            department_id: myProfile?.department_id || null,
            internship_role: form.internship_role || null,
            college_name: form.college_name || null,
            start_date: form.start_date,
            end_date: form.end_date,
            reporting_manager_id: form.reporting_manager_id || null,
            notes: form.notes || null,
          },
        });
        if (fnErr) {
          const errMsg = await fnErr?.context?.text();
          let parsed: any = {};
          try { parsed = JSON.parse(errMsg || '{}'); } catch { /* ignore */ }
          toast.error(parsed?.error || fnErr.message || 'Failed to create intern');
          setSaving(false);
          return;
        }
        toast.success(`Intern created — ID: ${result?.employee_id}`);
      }
      setShowAdd(false); setEditIntern(null); setForm(EMPTY_FORM); fetchAll();
    } catch (err: any) { toast.error(err.message || 'Operation failed'); }
    finally { setSaving(false); }
  };

  const openEdit = (i: InternRow) => {
    setEditIntern(i);
    setForm({ full_name: (i.profile as any)?.full_name || '', email: (i.profile as any)?.email || '', password: '', mobile_number: i.mobile_number || '', internship_role: i.internship_role || '', college_name: i.college_name || '', start_date: i.start_date, end_date: i.end_date, reporting_manager_id: i.reporting_manager_id || '', notes: i.notes || '' });
    setShowAdd(true);
  };

  const updateStatus = async (id: string, status: InternStatus) => {
    await supabase.from('intern_details').update({ status }).eq('id', id);
    toast.success(`Status updated to "${status}"`);
    fetchAll();
  };

  const [togglingAccount, setTogglingAccount] = useState<string | null>(null);

  const handleToggleAccount = async (intern: InternRow, disable: boolean) => {
    setTogglingAccount(intern.id);
    try {
      const { error: detErr } = await supabase
        .from('intern_details')
        .update({ account_disabled: disable })
        .eq('id', intern.id);
      if (detErr) { toast.error(detErr.message); return; }

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ is_active: !disable })
        .eq('id', intern.profile_id);
      if (profErr) { toast.error(profErr.message); return; }

      if (disable) {
        const { notifyInternDisabled } = await import('@/lib/notifications');
        notifyInternDisabled(intern.profile_id);
        toast.success('Intern account disabled — login blocked immediately.');
      } else {
        const { notifyInternEnabled } = await import('@/lib/notifications');
        notifyInternEnabled(intern.profile_id);
        toast.success('Intern account enabled — login restored.');
      }
      fetchAll();
    } finally {
      setTogglingAccount(null);
    }
  };
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Internship Management</h1>
          <p className="text-sm text-muted-foreground">Manage interns in your department</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button onClick={() => { setEditIntern(null); setForm(EMPTY_FORM); setShowAdd(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Intern
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Interns', value: stats.total, icon: UserCheck, cls: 'text-primary' },
          { label: 'Active', value: stats.active, icon: Users, cls: 'text-green-400' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle, cls: 'text-blue-400' },
          { label: 'Expired', value: stats.expired, icon: XCircle, cls: 'text-red-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}><CardContent className="p-4 flex items-center flex-wrap gap-3">
            <Icon className={`w-7 h-7 ${cls} shrink-0`} />
            <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl md:text-2xl font-bold text-foreground">{value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="interns">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="interns" className="flex-1 min-w-0 md:flex-none gap-1.5"><Users className="w-3.5 h-3.5" /> Interns ({interns.length})</TabsTrigger>
          <TabsTrigger value="attendance" className="flex-1 min-w-0 md:flex-none gap-1.5"><Clock className="w-3.5 h-3.5" /> Attendance</TabsTrigger>
          <TabsTrigger value="reports" className="flex-1 min-w-0 md:flex-none gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Reports</TabsTrigger>
        </TabsList>

        {/* INTERNS TAB */}
        <TabsContent value="interns" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search interns…" className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={fetchAll}><RefreshCw className="w-4 h-4" /></Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14">
              <UserCheck className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No interns in your department</p>
              <p className="text-sm text-muted-foreground mt-1">Add interns using the button above</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Intern ID','Name','Email','Role','College','Duration','Start','End','Reporting Manager','Status','Account Status','Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(i => {
                      const disp = computeStatus(i.start_date, i.end_date, i.status);
                      const rem = daysRemaining(i.end_date);
                      return (
                        <tr key={i.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs font-mono text-muted-foreground">{(i.profile as any)?.employee_id || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-medium text-foreground">{(i.profile as any)?.full_name || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{(i.profile as any)?.email || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{i.internship_role || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{i.college_name || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{calcDuration(i.start_date, i.end_date)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{new Date(i.start_date).toLocaleDateString()}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                            <div className="text-muted-foreground">{new Date(i.end_date).toLocaleDateString()}</div>
                            {disp === 'active' && rem > 0 && <div className="text-orange-400">{rem}d left</div>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{(i.reporting_manager as any)?.full_name || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[disp] || ''}`}>{disp.replace(/_/g,' ')}</Badge>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {i.account_disabled
                              ? <Badge variant="outline" className="text-xs border-red-500/30 text-red-400 bg-red-500/10">Disabled</Badge>
                              : <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/10">Active</Badge>
                            }
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewIntern(i)}><Eye className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(i)}><Edit className="w-3.5 h-3.5" /></Button>
                              {i.account_disabled
                                ? <Button size="sm" variant="ghost" className="h-7 px-2 text-green-400 hover:text-green-400 text-xs" disabled={togglingAccount === i.id} onClick={() => handleToggleAccount(i, false)}>Enable</Button>
                                : <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-400 hover:text-orange-400 text-xs" disabled={togglingAccount === i.id} onClick={() => handleToggleAccount(i, true)}>Disable</Button>
                              }
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* REPORTS TAB */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attendance summary placeholder */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><Calendar className="w-4 h-4 text-primary" />Department Intern Attendance</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border"><th className="text-left px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">Name</th><th className="text-right px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">Status</th></tr></thead>
                  <tbody>
                    {interns.slice(0,8).map(i => (
                      <tr key={i.id} className="border-b border-border">
                        <td className="px-2 py-2 text-foreground text-sm whitespace-nowrap">{(i.profile as any)?.full_name}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap"><Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[computeStatus(i.start_date,i.end_date,i.status)]}`}>{computeStatus(i.start_date,i.end_date,i.status).replace(/_/g,' ')}</Badge></td>
                      </tr>
                    ))}
                    {interns.length === 0 && <tr><td colSpan={2} className="text-center py-4 text-muted-foreground text-sm">No interns</td></tr>}
                  </tbody>
                </table>
                </div>
              </CardContent>
            </Card>

            {/* Completion Status */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center flex-wrap gap-2"><GraduationCap className="w-4 h-4 text-primary" />Completion Status</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(['created','active','in_progress','completed','expired'] as InternStatus[]).map(s => {
                  const cnt = interns.filter(i => computeStatus(i.start_date,i.end_date,i.status) === s).length;
                  const pct = interns.length > 0 ? Math.round((cnt / interns.length) * 100) : 0;
                  return (
                    <div key={s}>
                      <div className="flex justify-between flex-wrap gap-2 text-xs mb-1">
                        <span className="capitalize text-muted-foreground">{s.replace(/_/g,' ')}</span>
                        <span className="font-medium text-foreground">{cnt} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={attSearch} onChange={e => setAttSearch(e.target.value)} placeholder="Search intern..." className="pl-9" />
              </div>
              <Input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="w-full md:w-40"/>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={fetchAttendance} disabled={attLoading} className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${attLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setExportAttOpen(true)} className="gap-1.5">
                <FileDown className="w-3.5 h-3.5" /> Export
              </Button>
            </div>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Intern ID','Intern Name','Department','Date','Check In','Check Out','Working Hours','Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse w-20" /></td>)}
                        </tr>
                      ))
                    : (() => {
                        const attFiltered = attRecords.filter(r => {
                          const q = attSearch.toLowerCase();
                          return !q || r.employee?.full_name?.toLowerCase().includes(q) || r.employee?.employee_id?.toLowerCase().includes(q);
                        });
                        if (!attFiltered.length) return (
                          <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No intern attendance records for {attDate}.</td></tr>
                        );
                        const fmtT = (t: string | null) => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                        const attBadge: Record<string, string> = {
                          present:  'border-green-500/30 text-green-400 bg-green-500/10',
                          absent:   'border-red-500/30 text-red-400 bg-red-500/10',
                          late:     'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
                          on_leave: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
                        };
                        return attFiltered.map(r => (
                          <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{r.employee?.employee_id || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.employee?.department?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{r.date}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-green-400">{fmtT(r.check_in_time)}</td>
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-blue-400">{fmtT(r.check_out_time)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">{r.working_hours != null ? `${r.working_hours}h` : '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs capitalize ${attBadge[r.status] || ''}`}>
                                {r.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                          </tr>
                        ));
                      })()
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Intern List Export */}
      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Internship Management Report"
        columns={[
          { header: 'Intern ID',  key: 'profile',         format: v => (v as any)?.employee_id || '—' },
          { header: 'Name',       key: 'profile',         format: v => (v as any)?.full_name || '—' },
          { header: 'Role',       key: 'internship_role' },
          { header: 'College',    key: 'college_name' },
          { header: 'Start Date', key: 'start_date' },
          { header: 'End Date',   key: 'end_date' },
          { header: 'Status',     key: 'status',          format: v => String(v||'').replace(/_/g,' ') },
        ] satisfies ReportColumn[]}
        rows={interns as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />

      {/* Intern Attendance Export */}
      <ReportExportDialog
        open={exportAttOpen}
        onClose={() => setExportAttOpen(false)}
        reportTitle="Intern Attendance Report"
        columns={[
          { header: 'Intern ID',     key: 'employee',       format: v => (v as any)?.employee_id || '—' },
          { header: 'Intern Name',   key: 'employee',       format: v => (v as any)?.full_name || '—' },
          { header: 'Department',    key: 'employee',       format: v => (v as any)?.department?.name || '—' },
          { header: 'Date',          key: 'date' },
          { header: 'Check In',      key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
          { header: 'Check Out',     key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
          { header: 'Working Hours', key: 'working_hours',  format: v => v != null ? `${v}h` : '—' },
          { header: 'Status',        key: 'status',         format: v => String(v||'').replace(/_/g,' ') },
        ] satisfies ReportColumn[]}
        rows={attRecords as unknown as Record<string, unknown>[]}
        dateKey="date"
      />

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={v => { if (!v) { setShowAdd(false); setEditIntern(null); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editIntern ? 'Edit Intern' : 'Add New Intern'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Full Name <span className="text-red-400">*</span></Label><Input value={form.full_name} onChange={f('full_name')} placeholder="John Doe" /></div>
            <div className="space-y-1.5"><Label>Email Address <span className="text-red-400">*</span></Label><Input type="email" value={form.email} onChange={f('email')} placeholder="john@example.com" disabled={!!editIntern} /></div>
            {!editIntern && <div className="space-y-1.5"><Label>Login Password <span className="text-red-400">*</span></Label><Input type="password" value={form.password} onChange={f('password')} placeholder="Min 6 characters" /></div>}
            <div className="space-y-1.5"><Label>Mobile Number</Label><Input value={form.mobile_number} onChange={f('mobile_number')} placeholder="+1 234 567 8900" /></div>
            <div className="space-y-1.5"><Label>Internship Role</Label><Input value={form.internship_role} onChange={f('internship_role')} placeholder="e.g. Marketing Intern" /></div>
            <div className="space-y-1.5"><Label>College / Institute Name</Label><Input value={form.college_name} onChange={f('college_name')} placeholder="e.g. MIT" /></div>
            <div className="space-y-1.5"><Label>Reporting Manager</Label>
              <Select value={form.reporting_manager_id} onValueChange={v => setForm(p => ({ ...p, reporting_manager_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>{managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Start Date <span className="text-red-400">*</span></Label><Input type="date" value={form.start_date} onChange={f('start_date')} /></div>
            <div className="space-y-1.5"><Label>End Date <span className="text-red-400">*</span></Label><Input type="date" value={form.end_date} onChange={f('end_date')} /></div>
            {form.start_date && form.end_date && new Date(form.end_date) > new Date(form.start_date) && (
              <div className="md:col-span-2 text-sm text-muted-foreground bg-muted/30 rounded px-3 py-2">
                <span className="font-medium text-foreground">Duration: </span>{calcDuration(form.start_date, form.end_date)}
              </div>
            )}
            <div className="md:col-span-2 space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Additional notes…" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditIntern(null); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              {editIntern ? 'Save Changes' : 'Create Intern Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Intern Dialog */}
      <Dialog open={!!viewIntern} onOpenChange={v => !v && setViewIntern(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center flex-wrap gap-2">
              <UserCheck className="w-4 h-4 text-primary" />
              {(viewIntern?.profile as any)?.full_name}
            </DialogTitle>
          </DialogHeader>
          {viewIntern && (() => {
            const disp = computeStatus(viewIntern.start_date, viewIntern.end_date, viewIntern.status);
            const rem = daysRemaining(viewIntern.end_date);
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`capitalize ${STATUS_STYLES[disp]}`}>{disp.replace(/_/g,' ')}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{(viewIntern.profile as any)?.employee_id}</span>
                  {disp === 'active' && rem > 0 && <span className="text-xs text-orange-400">{rem} days remaining</span>}
                  {disp === 'expired' && <span className="text-xs text-red-400">Internship expired</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {[
                    ['Email', (viewIntern.profile as any)?.email || '—'],
                    ['Mobile', viewIntern.mobile_number || '—'],
                    ['Role', viewIntern.internship_role || '—'],
                    ['College', viewIntern.college_name || '—'],
                    ['Reporting Manager', (viewIntern.reporting_manager as any)?.full_name || '—'],
                    ['Start Date', new Date(viewIntern.start_date).toLocaleDateString()],
                    ['End Date', new Date(viewIntern.end_date).toLocaleDateString()],
                    ['Duration', calcDuration(viewIntern.start_date, viewIntern.end_date)],
                  ].map(([k,v]) => (
                    <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium text-foreground">{v}</p></div>
                  ))}
                </div>
                {viewIntern.notes && <div><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm bg-muted/30 rounded p-3 text-pretty">{viewIntern.notes}</p></div>}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {disp === 'created' && <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => { updateStatus(viewIntern.id, 'active'); setViewIntern(null); }}>Mark Active</Button>}
                  {disp === 'active' && <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => { updateStatus(viewIntern.id, 'in_progress'); setViewIntern(null); }}>Mark In Progress</Button>}
                  {['active','in_progress'].includes(disp) && <Button size="sm" className="gap-1.5" onClick={() => { updateStatus(viewIntern.id, 'completed'); setViewIntern(null); }}>Mark Completed</Button>}
                  <Button size="sm" variant="outline" onClick={() => setViewIntern(null)} className="ml-auto">Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
