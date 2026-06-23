import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Users, FileDown, Zap, CalendarDays, Sun } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { STATUS_STYLES, STATUS_LABEL, isWorkingDay, deriveAttendanceStatus } from '@/lib/attendanceLogic';
import type { CompanyWorkSchedule, Holiday } from '@/types/types';

interface AttRecord {
  id: string; status: string;
  check_in_time?: string | null; check_out_time?: string | null;
  working_hours?: number | null; overtime_hours?: number;
  late_minutes?: number; early_minutes?: number;
  late_label?: string | null; early_label?: string | null;
  is_late?: boolean; date: string;
  employee?: { id: string; full_name?: string; employee_id?: string; department?: { name?: string } | null } | null;
}

function fmtTime(ts?: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MgmtAttendance() {
  const { profile, companySettings } = useAuth();
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [internRecords, setInternRecords] = useState<AttRecord[]>([]);
  const [internLoading, setInternLoading] = useState(false);
  const [internSearch, setInternSearch] = useState('');
  const [exportEmpOpen, setExportEmpOpen] = useState(false);
  const [exportInternOpen, setExportInternOpen] = useState(false);
  const [schedule, setSchedule] = useState<CompanyWorkSchedule | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!companySettings) return;
    supabase.from('company_work_schedule').select('*').eq('company_settings_id', companySettings.id).maybeSingle()
      .then(({ data }) => { if (data) setSchedule(data as CompanyWorkSchedule); });
    supabase.from('holidays').select('date').eq('company_settings_id', companySettings.id)
      .then(({ data }) => {
        const s = new Set<string>();
        (data as Holiday[] || []).forEach(h => s.add(h.date));
        setHolidayDates(s);
      });
  }, [companySettings]);

  const applyLogic = useCallback((rows: AttRecord[], memberIds: Set<string>, allMembers: { id: string; full_name: string; employee_id: string; department: { name: string } | null }[], onLeaveIds: Set<string> = new Set()): AttRecord[] => {
    const isHoliday = holidayDates.has(date);
    const isWeekend = schedule ? !isWorkingDay(date, schedule) : false;

    const computed = rows.map(r => {
      if (isHoliday) return { ...r, status: 'holiday' };
      if (isWeekend) return { ...r, status: 'weekend_off' };
      // On approved leave and no check-in → on_leave
      if (!r.check_in_time && r.employee?.id && onLeaveIds.has(r.employee.id)) return { ...r, status: 'on_leave' };
      if (!r.check_in_time) return { ...r, status: 'absent' };
      if (!schedule) return r;
      const d = deriveAttendanceStatus(r.check_in_time ?? null, r.check_out_time ?? null, schedule);
      return { ...r, status: d.status, late_minutes: d.late_minutes, early_minutes: d.early_minutes, overtime_hours: d.overtime_hours, late_label: d.late_label, early_label: d.early_label, working_hours: d.working_hours ?? r.working_hours };
    });

    if (!isHoliday && !isWeekend && schedule) {
      const checkedIn = new Set(rows.map(r => r.employee?.id).filter(Boolean));
      const absent: AttRecord[] = allMembers.filter(e => memberIds.has(e.id) && !checkedIn.has(e.id)).map(e => ({
        id: `absent-${e.id}`, date, status: onLeaveIds.has(e.id) ? 'on_leave' : 'absent',
        check_in_time: null, check_out_time: null, working_hours: null, overtime_hours: 0, late_minutes: 0, early_minutes: 0,
        employee: { id: e.id, full_name: e.full_name, employee_id: e.employee_id, department: e.department },
      }));
      return [...computed, ...absent];
    }
    return computed;
  }, [date, holidayDates, schedule]);

  const fetchRecords = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase
      .from('profiles')
      .select('id,full_name,employee_id,department:departments!profiles_department_id_fkey(name)')
      .eq('department_id', profile.department_id)
      .in('role', ['employee', 'management'])
      .eq('is_active', true);
    type MemberRow = { id: string; full_name: string; employee_id: string; department: { name: string } | { name: string }[] | null };
    const memberList = ((members || []) as unknown as MemberRow[]).map(m => ({
      ...m,
      department: Array.isArray(m.department) ? (m.department[0] ?? null) : m.department,
    })) as { id: string; full_name: string; employee_id: string; department: { name: string } | null }[];
    const ids = memberList.map(m => m.id);
    if (!ids.length) { setRecords([]); setLoading(false); return; }

    let q = supabase
      .from('attendance')
      .select('id,status,check_in_time,check_out_time,working_hours,overtime_hours,late_minutes,early_minutes,late_label,early_label,is_late,date,employee:profiles!attendance_employee_id_fkey(id,full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
      .eq('date', date)
      .in('employee_id', ids);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q.order('created_at', { ascending: false });

    // Fetch on-leave IDs for this date
    const { data: leaveData } = await supabase
      .from('leave_requests')
      .select('employee_id')
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date);
    const onLeaveIds = new Set<string>((leaveData || []).map((l: { employee_id: string }) => l.employee_id));

    let rows = applyLogic((data || []) as unknown as AttRecord[], new Set(ids), memberList, onLeaveIds);
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
    setRecords(rows);
    setLoading(false);
  }, [profile, date, statusFilter, applyLogic]);

  const fetchInternRecords = useCallback(async () => {
    if (!profile?.department_id) return;
    setInternLoading(true);
    const { data: internMembers } = await supabase
      .from('profiles')
      .select('id,full_name,employee_id,department:departments!profiles_department_id_fkey(name)')
      .eq('department_id', profile.department_id)
      .eq('role', 'intern')
      .eq('is_active', true);
    type InternRow = { id: string; full_name: string; employee_id: string; department: { name: string } | { name: string }[] | null };
    const internList = ((internMembers || []) as unknown as InternRow[]).map(m => ({
      ...m,
      department: Array.isArray(m.department) ? (m.department[0] ?? null) : m.department,
    })) as { id: string; full_name: string; employee_id: string; department: { name: string } | null }[];
    const ids = internList.map(m => m.id);
    if (!ids.length) { setInternRecords([]); setInternLoading(false); return; }

    const { data } = await supabase
      .from('attendance')
      .select('id,status,check_in_time,check_out_time,working_hours,overtime_hours,late_minutes,early_minutes,late_label,early_label,date,employee:profiles!attendance_employee_id_fkey(id,full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
      .eq('date', date)
      .in('employee_id', ids)
      .order('created_at', { ascending: false });

    // Fetch on-leave IDs for this date
    const { data: internLeaveData } = await supabase
      .from('leave_requests')
      .select('employee_id')
      .eq('status', 'approved')
      .lte('start_date', date)
      .gte('end_date', date);
    const internOnLeaveIds = new Set<string>((internLeaveData || []).map((l: { employee_id: string }) => l.employee_id));

    const rows = applyLogic((data || []) as unknown as AttRecord[], new Set(ids), internList, internOnLeaveIds);
    setInternRecords(rows);
    setInternLoading(false);
  }, [profile, date, applyLogic]);

  useEffect(() => { fetchRecords(); fetchInternRecords(); }, [fetchRecords, fetchInternRecords]);

  const stats = {
    present:     records.filter(r => r.status === 'present').length,
    absent:      records.filter(r => r.status === 'absent').length,
    late:        records.filter(r => r.status === 'late').length,
    half_day:    records.filter(r => r.status === 'half_day').length,
    overtime:    records.filter(r => r.status === 'overtime').length,
    on_leave:    records.filter(r => r.status === 'on_leave').length,
    holiday:     records.filter(r => r.status === 'holiday').length,
    weekend_off: records.filter(r => r.status === 'weekend_off').length,
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return !q || r.employee?.full_name?.toLowerCase().includes(q) || r.employee?.employee_id?.toLowerCase().includes(q);
  });

  const filteredInterns = internRecords.filter(r => {
    const q = internSearch.toLowerCase();
    return !q || r.employee?.full_name?.toLowerCase().includes(q) || r.employee?.employee_id?.toLowerCase().includes(q);
  });

  const attExportCols: ReportColumn[] = [
    { header: 'Employee ID',   key: 'employee',       format: v => (v as AttRecord['employee'])?.employee_id || '—' },
    { header: 'Name',          key: 'employee',       format: v => (v as AttRecord['employee'])?.full_name || '—' },
    { header: 'Department',    key: 'employee',       format: v => (v as AttRecord['employee'])?.department?.name || '—' },
    { header: 'Date',          key: 'date' },
    { header: 'Check In',      key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
    { header: 'Check Out',     key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
    { header: 'Working Hours', key: 'working_hours',  format: v => v != null ? `${v}h` : '—' },
    { header: 'Status',        key: 'status',         format: v => STATUS_LABEL[v as string] || String(v || '') },
    { header: 'Late (min)',    key: 'late_minutes',   format: v => v ? String(v) : '—' },
    { header: 'Overtime (h)',  key: 'overtime_hours', format: v => v ? String(v) : '—' },
  ];

  const renderTable = (rows: AttRecord[], cols: number, emptyMsg: string) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {['Emp ID','Name','Department','Check-In','Check-Out','Working Hrs','Status','Late','Early','Overtime'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(cols === -1 ? internLoading : loading)
            ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 10 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-14 bg-muted"/></td>)}</tr>)
            : rows.length === 0
            ? <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">{emptyMsg}</td></tr>
            : rows.map(r => (
                <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.employee?.employee_id||'—'}</td>
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.employee?.full_name||'—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.employee?.department?.name||'—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={r.check_in_time ? 'text-green-400 font-mono text-xs' : 'text-muted-foreground'}>{fmtTime(r.check_in_time)}</span>
                    {r.late_label && <p className="text-[10px] text-yellow-400">{r.late_label}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={r.check_out_time ? 'text-blue-400 font-mono text-xs' : 'text-muted-foreground'}>{fmtTime(r.check_out_time)}</span>
                    {r.early_label && <p className="text-[10px] text-orange-400">{r.early_label}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.working_hours != null ? <span className="font-mono text-xs">{Number(r.working_hours).toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status]||''}`}>{STATUS_LABEL[r.status]||r.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{r.late_minutes ? <span className="text-yellow-400">{r.late_minutes}m</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{r.early_minutes ? <span className="text-orange-400">{r.early_minutes}m</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{r.overtime_hours ? <span className="text-purple-400">{Number(r.overtime_hours).toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Attendance</h1>
          <p className="text-sm text-muted-foreground">{profile?.department?.name || 'Department'} · {date}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { l:'Present',    v:stats.present,     c:'text-green-400',        bg:'bg-green-500/10',        Icon:CheckCircle },
          { l:'Absent',     v:stats.absent,      c:'text-red-400',          bg:'bg-red-500/10',          Icon:XCircle },
          { l:'Late',       v:stats.late,        c:'text-yellow-400',       bg:'bg-yellow-500/10',       Icon:AlertCircle },
          { l:'Half Day',   v:stats.half_day,    c:'text-orange-400',       bg:'bg-orange-500/10',       Icon:Clock },
          { l:'Overtime',   v:stats.overtime,    c:'text-purple-400',       bg:'bg-purple-500/10',       Icon:Zap },
          { l:'On Leave',   v:stats.on_leave,    c:'text-cyan-400',         bg:'bg-cyan-500/10',         Icon:Users },
          { l:'Holiday',    v:stats.holiday,     c:'text-blue-400',         bg:'bg-blue-500/10',         Icon:CalendarDays },
          { l:'Weekend',    v:stats.weekend_off, c:'text-muted-foreground', bg:'bg-muted/40',            Icon:Sun },
        ].map(s => (
          <Card key={s.l}>
            <div className="p-3 flex items-center flex-wrap gap-2">
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}><s.Icon className={`w-3.5 h-3.5 ${s.c}`}/></div>
              <div><p className={`text-lg font-bold ${s.c}`}>{s.v}</p><p className="text-[10px] text-muted-foreground">{s.l}</p></div>
            </div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="employees" className="flex-1 md:flex-none whitespace-nowrap">Employees</TabsTrigger>
          <TabsTrigger value="interns" className="flex-1 md:flex-none whitespace-nowrap">Interns</TabsTrigger>
        </TabsList>

        {/* ── Employee Tab ── */}
        <TabsContent value="employees" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID…" className="pl-9"/>
            </div>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full md:w-40"/>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setExportEmpOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
            <Button variant="outline" size="sm" onClick={() => { fetchRecords(); fetchInternRecords(); }} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`}/>Refresh</Button>
          </div>
          <Card>{renderTable(filtered, 0, `No records for ${date}`)}</Card>
        </TabsContent>

        {/* ── Intern Tab ── */}
        <TabsContent value="interns" className="space-y-3 mt-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <Input value={internSearch} onChange={e => setInternSearch(e.target.value)} placeholder="Search intern…" className="pl-9"/>
            </div>
            <Button variant="outline" size="sm" onClick={() => setExportInternOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          </div>
          <Card>{renderTable(filteredInterns, -1, `No intern records for ${date}`)}</Card>
        </TabsContent>
      </Tabs>

      <ReportExportDialog open={exportEmpOpen} onClose={() => setExportEmpOpen(false)} reportTitle="Employee Attendance Report" columns={attExportCols} rows={records as unknown as Record<string, unknown>[]} dateKey="date"/>
      <ReportExportDialog open={exportInternOpen} onClose={() => setExportInternOpen(false)} reportTitle="Intern Attendance Report" columns={attExportCols} rows={internRecords as unknown as Record<string, unknown>[]} dateKey="date"/>
    </div>
  );
}
