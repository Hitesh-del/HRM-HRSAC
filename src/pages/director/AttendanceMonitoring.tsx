import { useEffect, useState, useCallback } from 'react';
import { Search, FileDown, RefreshCw, ChevronLeft, ChevronRight, Clock, UserCheck, UserX, AlertCircle, Coffee, Sun, CalendarDays, Zap } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  STATUS_STYLES, STATUS_LABEL,
  isWorkingDay, deriveAttendanceStatus,
} from '@/lib/attendanceLogic';
import type { CompanyWorkSchedule, Holiday } from '@/types/types';
import type { Department } from '@/types/types';

interface AttRec {
  id: string; date: string; status: string;
  check_in_time?: string | null; check_out_time?: string | null;
  working_hours?: number | null; overtime_hours?: number;
  late_minutes?: number; early_minutes?: number;
  late_label?: string | null; early_label?: string | null;
  is_late?: boolean; notes?: string | null;
  employee?: {
    id: string; full_name: string; employee_id: string; avatar_url: string | null;
    department_id: string | null;
    department?: { id: string; name: string } | null;
  } | null;
}

// Synthetic absent record for employees with no check-in on a working day
interface AbsentRec {
  id: string; date: string; status: string;
  check_in_time: null; check_out_time: null;
  working_hours: null; overtime_hours: number;
  late_minutes: number; early_minutes: number;
  late_label: null; early_label: null;
  employee: { id: string; full_name: string; employee_id: string; avatar_url: null; department_id: string | null; department?: { id: string; name: string } | null };
}

const PAGE_SIZE = 15;

export default function AttendanceMonitoring() {
  const { companySettings } = useAuth();
  const [records, setRecords]       = useState<(AttRec | AbsentRec)[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage]             = useState(0);
  const [total, setTotal]           = useState(0);
  const [schedule, setSchedule]     = useState<CompanyWorkSchedule | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [holidayName, setHolidayName]   = useState<string>('');

  // Load schedule + holidays once
  useEffect(() => {
    if (!companySettings) return;
    supabase.from('company_work_schedule').select('*').eq('company_settings_id', companySettings.id).maybeSingle()
      .then(({ data }) => { if (data) setSchedule(data as CompanyWorkSchedule); });
    supabase.from('holidays').select('date,name').eq('company_settings_id', companySettings.id)
      .then(({ data }) => {
        const set = new Set<string>();
        (data as Holiday[] || []).forEach(h => set.add(h.date));
        setHolidayDates(set);
      });
  }, [companySettings]);

  const fetchRecords = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    // Determine day type
    const isHoliday  = holidayDates.has(selectedDate);
    const isWeekend  = schedule ? !isWorkingDay(selectedDate, schedule) : false;

    if (isHoliday) {
      // Fetch holiday info
      if (companySettings) {
        const { data: hData } = await supabase.from('holidays').select('name').eq('date', selectedDate).eq('company_settings_id', companySettings.id).maybeSingle();
        setHolidayName((hData as { name: string } | null)?.name || '');
      }
    } else {
      setHolidayName('');
    }

    // Fetch actual attendance records for this date
    let q = supabase.from('attendance')
      .select('id,date,status,check_in_time,check_out_time,working_hours,overtime_hours,late_minutes,early_minutes,late_label,early_label,is_late,notes,employee_id,employee:profiles!attendance_employee_id_fkey(id,full_name,employee_id,avatar_url,department_id,department:departments!profiles_department_id_fkey(id,name))', { count: 'exact' })
      .eq('date', selectedDate)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data: rawData, count } = await q;
    let rows = (rawData || []) as unknown as AttRec[];

    // Fetch approved leave employee IDs for this date (for override logic)
    const { data: leaveData } = await supabase
      .from('leave_requests')
      .select('employee_id')
      .eq('status', 'approved')
      .lte('start_date', selectedDate)
      .gte('end_date', selectedDate);
    const onLeaveIds = new Set<string>((leaveData || []).map((l: { employee_id: string }) => l.employee_id));

    // Override status with computed values from schedule
    if (schedule) {
      rows = rows.map(r => {
        if (isHoliday) return { ...r, status: 'holiday' };
        if (isWeekend)  return { ...r, status: 'weekend_off' };
        // On approved leave and no check-in → on_leave
        if (!r.check_in_time && r.employee?.id && onLeaveIds.has(r.employee.id)) return { ...r, status: 'on_leave' };
        if (!r.check_in_time) return { ...r, status: 'absent' };
        const derived = deriveAttendanceStatus(r.check_in_time ?? null, r.check_out_time ?? null, schedule);
        return {
          ...r,
          status: derived.status,
          late_minutes: derived.late_minutes,
          early_minutes: derived.early_minutes,
          overtime_hours: derived.overtime_hours,
          late_label: derived.late_label,
          early_label: derived.early_label,
          working_hours: derived.working_hours ?? r.working_hours,
        };
      });
    }

    // For working days: find employees who didn't check in at all → mark absent
    if (!isHoliday && !isWeekend && schedule) {
      const checkedInIds = new Set(rows.map(r => r.employee?.id).filter(Boolean));
      const { data: allEmps } = await supabase
        .from('profiles')
        .select('id,full_name,employee_id,department_id,department:departments!profiles_department_id_fkey(id,name)')
        .eq('is_active', true)
        .in('role', ['employee', 'management', 'intern', 'director']);

      type EmpRow = { id: string; full_name: string; employee_id: string | null; department_id: string | null; department: unknown };
      const absent: AbsentRec[] = ((allEmps || []) as unknown as EmpRow[])
        .filter(e => !checkedInIds.has(e.id))
        .map(e => {
          const dept = e.department as { id: string; name: string } | { id: string; name: string }[] | null | undefined;
          const deptObj = Array.isArray(dept) ? dept[0] ?? null : dept ?? null;
          // Employees with approved leave get on_leave, not absent
          const status = onLeaveIds.has(e.id) ? 'on_leave' : 'absent';
          return {
            id: `absent-${e.id}`,
            date: selectedDate,
            status,
            check_in_time: null, check_out_time: null,
            working_hours: null, overtime_hours: 0,
            late_minutes: 0, early_minutes: 0,
            late_label: null, early_label: null,
            employee: {
              id: e.id, full_name: e.full_name, employee_id: e.employee_id || '',
              avatar_url: null, department_id: e.department_id,
              department: deptObj ?? undefined,
            },
          };
        });
      rows = [...rows, ...absent];
    }
    if (deptFilter !== 'all') rows = rows.filter(r => r.employee?.department_id === deptFilter);

    // Apply status filter to synthetic records too
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);

    setRecords(rows);
    setTotal(count ? count + rows.filter(r => r.id.startsWith('absent-')).length : rows.length);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [selectedDate, deptFilter, statusFilter, schedule, holidayDates, companySettings]);

  useEffect(() => {
    fetchRecords();
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
    const ch = supabase.channel('att-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchRecords(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRecords]);

  const filtered = records.filter(r =>
    (r.employee?.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.employee?.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const summary = {
    present:     records.filter(r => r.status === 'present').length,
    absent:      records.filter(r => r.status === 'absent').length,
    late:        records.filter(r => r.status === 'late').length,
    half_day:    records.filter(r => r.status === 'half_day').length,
    overtime:    records.filter(r => r.status === 'overtime').length,
    holiday:     records.filter(r => r.status === 'holiday').length,
    weekend_off: records.filter(r => r.status === 'weekend_off').length,
    on_leave:    records.filter(r => r.status === 'on_leave').length,
  };

  const fmt = (t: string | null | undefined) =>
    t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  const exportColumns: ReportColumn[] = [
    { header: 'Employee ID',    key: 'employee', format: v => (v as AttRec['employee'])?.employee_id || '—' },
    { header: 'Name',           key: 'employee', format: v => (v as AttRec['employee'])?.full_name || '—' },
    { header: 'Department',     key: 'employee', format: v => (v as AttRec['employee'])?.department?.name || '—' },
    { header: 'Check In',       key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
    { header: 'Check Out',      key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '—' },
    { header: 'Working Hours',  key: 'working_hours',  format: v => v != null ? `${v}h` : '—' },
    { header: 'Status',         key: 'status', format: v => STATUS_LABEL[v as string] || String(v || '—') },
    { header: 'Late (min)',      key: 'late_minutes',   format: v => v ? String(v) : '—' },
    { header: 'Early (min)',     key: 'early_minutes',  format: v => v ? String(v) : '—' },
    { header: 'Overtime (h)',    key: 'overtime_hours', format: v => v ? String(v) : '—' },
    { header: 'Date',           key: 'date' },
  ];

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const isHoliday = holidayDates.has(selectedDate);
  const isWeekend = schedule ? !isWorkingDay(selectedDate, schedule) : false;

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Attendance Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            {isHoliday && <span className="ml-2 text-blue-400">· 🎉 {holidayName || 'Holiday'}</span>}
            {isWeekend && !isHoliday && <span className="ml-2 text-muted-foreground">· Weekend</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          <Button variant="outline" size="sm" onClick={() => fetchRecords(true)} disabled={refreshing}><RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing?'animate-spin':''}`}/>Refresh</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { l:'Present',    v:summary.present,     c:'text-green-400',            bg:'bg-green-500/10',           Icon:UserCheck },
          { l:'Absent',     v:summary.absent,      c:'text-red-400',              bg:'bg-red-500/10',             Icon:UserX },
          { l:'Late',       v:summary.late,        c:'text-yellow-400',           bg:'bg-yellow-500/10',          Icon:Clock },
          { l:'Half Day',   v:summary.half_day,    c:'text-orange-400',           bg:'bg-orange-500/10',          Icon:AlertCircle },
          { l:'Overtime',   v:summary.overtime,    c:'text-purple-400',           bg:'bg-purple-500/10',          Icon:Zap },
          { l:'On Leave',   v:summary.on_leave,    c:'text-cyan-400',             bg:'bg-cyan-500/10',            Icon:Coffee },
          { l:'Holiday',    v:summary.holiday,     c:'text-blue-400',             bg:'bg-blue-500/10',            Icon:CalendarDays },
          { l:'Weekend',    v:summary.weekend_off, c:'text-muted-foreground',     bg:'bg-muted/40',               Icon:Sun },
        ].map(s=>(
          <Card key={s.l}>
            <div className="p-3 flex items-center flex-wrap gap-2">
              <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                <s.Icon className={`w-3.5 h-3.5 ${s.c}`}/>
              </div>
              <div>
                <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.l}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name or ID..." className="pl-9"/>
        </div>
        <Input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setPage(0); }} className="w-full md:w-40"/>
        <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Departments"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Status"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['Emp ID','Employee Name','Department','Check-In','Check-Out','Working Hrs','Status','Late Min','Early Min','Overtime'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:10}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16 bg-muted"/></td>)}</tr>)
                : paginated.length === 0
                ? <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No attendance records found for this date</td></tr>
                : paginated.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{r.employee?.employee_id||'—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">
                            {(r.employee?.full_name||'?').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{r.employee?.full_name||'—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.employee?.department?.name||'—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.check_in_time ? <span className="text-green-400 font-mono text-xs">{fmt(r.check_in_time)}</span> : <span className="text-muted-foreground">—</span>}
                        {(r as AttRec).late_label && <p className="text-[10px] text-yellow-400">{(r as AttRec).late_label}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.check_out_time ? <span className="text-blue-400 font-mono text-xs">{fmt(r.check_out_time)}</span> : <span className="text-muted-foreground">—</span>}
                        {(r as AttRec).early_label && <p className="text-[10px] text-orange-400">{(r as AttRec).early_label}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.working_hours != null ? <span className="font-mono text-xs text-foreground">{Number(r.working_hours).toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status]||''}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {r.late_minutes ? <span className="text-yellow-400">{r.late_minutes}m</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {r.early_minutes ? <span className="text-orange-400">{r.early_minutes}m</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {r.overtime_hours ? <span className="text-purple-400">{Number(r.overtime_hours).toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Page {page+1} of {totalPages} · {filtered.length} records</p>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-4 h-4"/></Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </Card>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Attendance Monitoring Report"
        columns={exportColumns}
        rows={records as unknown as Record<string, unknown>[]}
        dateKey="date"
      />
    </div>
  );
}
