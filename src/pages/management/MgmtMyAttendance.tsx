import { useEffect, useState, useCallback } from 'react';
import { LogIn, LogOut, Clock, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import UpcomingHolidaysWidget from '@/components/common/UpcomingHolidaysWidget';
import { STATUS_STYLES, STATUS_LABEL, deriveAttendanceStatus, timeToMins } from '@/lib/attendanceLogic';
import type { CompanyWorkSchedule, Holiday } from '@/types/types';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';

interface AttRecord {
  id: string; date: string; status: string;
  check_in_time?: string | null; check_out_time?: string | null;
  working_hours?: number | null; overtime_hours?: number | null;
  late_minutes?: number | null; early_minutes?: number | null;
  late_label?: string | null; early_label?: string | null;
}

export default function MgmtMyAttendance() {
  const [exportOpen, setExportOpen] = useState(false);
  const { profile, companySettings } = useAuth();
  const [today, setToday] = useState<AttRecord | null>(null);
  const [history, setHistory] = useState<AttRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [liveTime, setLiveTime] = useState('');
  const [schedule, setSchedule] = useState<CompanyWorkSchedule | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const todayDate = new Date().toISOString().split('T')[0];

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

  const fetchAttendance = useCallback(async () => {
    if (!profile) return;
    const [{ data: todayData }, { data: hist }, { data: approvedLeaves }] = await Promise.all([
      supabase.from('attendance').select('*').eq('employee_id', profile.id).eq('date', todayDate).maybeSingle(),
      supabase.from('attendance')
        .select('id,date,status,check_in_time,check_out_time,working_hours,overtime_hours,late_minutes,early_minutes,late_label,early_label')
        .eq('employee_id', profile.id)
        .order('date', { ascending: false })
        .limit(30),
      supabase.from('leave_requests').select('start_date,end_date').eq('employee_id', profile.id).eq('status', 'approved'),
    ]);
    // Build set of dates covered by approved leaves
    const leaveDateSet = new Set<string>();
    (approvedLeaves || []).forEach((lr: { start_date: string; end_date: string }) => {
      let d = new Date(lr.start_date);
      const end = new Date(lr.end_date);
      while (d <= end) { leaveDateSet.add(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    });
    const mergedHist = (hist || []).map(r => {
      if (!r.check_in_time && leaveDateSet.has(r.date)) return { ...r, status: 'on_leave' };
      return r;
    });
    setToday(todayData);
    setHistory(mergedHist);
    setLoading(false);
  }, [profile, todayDate]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // Live timer
  useEffect(() => {
    if (!today?.check_in_time || today.check_out_time) { setLiveTime(''); return; }
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(today.check_in_time!).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLiveTime(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [today]);

  const handleAttendance = async () => {
    if (!profile) return;
    setChecking(true);
    const now = new Date();
    const nowISO = now.toISOString();

    if (today?.check_in_time && !today.check_out_time) {
      // Check out
      let derived = { status: 'present', overtime_hours: 0, early_minutes: 0, late_minutes: today.late_minutes ?? 0, late_label: today.late_label, early_label: null as string | null, working_hours: null as number | null };
      if (schedule) {
        const d = deriveAttendanceStatus(today.check_in_time ?? null, nowISO, schedule);
        derived = { status: d.status, overtime_hours: d.overtime_hours, early_minutes: d.early_minutes, late_minutes: d.late_minutes, late_label: d.late_label, early_label: d.early_label, working_hours: d.working_hours };
      } else {
        derived.working_hours = Math.round((Date.now() - new Date(today.check_in_time).getTime()) / 360000) / 10;
      }
      const { error } = await supabase.from('attendance').update({
        check_out_time: nowISO, status: derived.status,
        working_hours: derived.working_hours,
        overtime_hours: derived.overtime_hours,
        early_minutes: derived.early_minutes,
        late_minutes: derived.late_minutes,
        late_label: derived.late_label,
        early_label: derived.early_label,
      }).eq('id', today.id);
      if (!error) {
        const msg = derived.overtime_hours > 0 ? `Checked out · Overtime: ${derived.overtime_hours}h` : derived.early_label ? `Checked out · ${derived.early_label}` : `Checked out · Worked ${derived.working_hours?.toFixed(1)}h`;
        toast.success(msg);
        await fetchAttendance();
      }
    } else if (!today) {
      // Check in
      let status = 'present';
      let late_minutes = 0;
      let late_label: string | null = null;
      if (schedule) {
        const startMins = timeToMins(schedule.start_time);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        if (nowMins > startMins) {
          late_minutes = nowMins - startMins;
          if (late_minutes <= schedule.late_threshold_few) late_label = 'Few Minutes Late';
          else if (late_minutes <= schedule.late_threshold_late) late_label = 'Late';
          else late_label = 'Very Late';
          status = 'late';
        }
      } else {
        if (now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15)) status = 'late';
      }
      const isHoliday = holidayDates.has(todayDate);
      if (isHoliday) { toast.info("Today is a holiday — no need to check in!"); setChecking(false); return; }
      const { error } = await supabase.from('attendance').insert({
        employee_id: profile.id, date: todayDate, check_in_time: nowISO,
        status, is_late: status === 'late', late_minutes, late_label,
      });
      if (!error) {
        toast.success(late_label ? `Checked in · ${late_label}` : 'Checked in successfully!');
        await fetchAttendance();
      } else { toast.error(error.message); }
    } else {
      toast.info('Attendance already completed for today');
    }
    setChecking(false);
  };

  const fmtTime = (ts?: string | null) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  const isHolidayToday = holidayDates.has(todayDate);

  const present  = history.filter(h => ['present', 'late', 'overtime'].includes(h.status)).length;
  const absent   = history.filter(h => h.status === 'absent').length;
  const late     = history.filter(h => h.status === 'late').length;

  const attCols: ReportColumn[] = [
    { header: 'Date',      key: 'date' },
    { header: 'Status',    key: 'status' },
    { header: 'Check-In',  key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Check-Out', key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Hours',     key: 'working_hours',  format: v => v != null ? `${Number(v).toFixed(1)}h` : '—' },
    { header: 'OT Hours',  key: 'overtime_hours', format: v => v && Number(v) > 0 ? `${Number(v).toFixed(1)}h` : '—' },
    { header: 'Late Mins', key: 'late_minutes',   format: v => v && Number(v) > 0 ? String(v) : '—' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">My Attendance</h1>
          <p className="text-sm text-muted-foreground">Track your personal attendance · {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0"><FileDown className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {/* Check-in / Check-out card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-semibold text-foreground">{new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
              {isHolidayToday && <p className="text-sm text-blue-400 mt-0.5">🎉 Holiday today — enjoy your day!</p>}
              {!isHolidayToday && today?.check_in_time && !today.check_out_time && liveTime ? (
                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-xl md:text-2xl font-bold text-primary font-mono">{liveTime}</p>
                  <span className="text-xs text-muted-foreground">elapsed</span>
                </div>
              ) : today?.check_in_time ? (
                <p className="text-sm text-muted-foreground mt-1">
                  In: <span className="text-foreground font-medium">{fmtTime(today.check_in_time)}</span>
                  {today.check_out_time && <> · Out: <span className="text-foreground font-medium">{fmtTime(today.check_out_time)}</span></>}
                  {today.working_hours && <> · <span className="text-green-400 font-medium">{Number(today.working_hours).toFixed(1)}h</span></>}
                  {today.overtime_hours && today.overtime_hours > 0 && <> · <span className="text-purple-400 font-medium">OT: {today.overtime_hours}h</span></>}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Not checked in yet today</p>
              )}
              {schedule && !isHolidayToday && (
                <p className="text-xs text-muted-foreground mt-1">
                  <Clock className="inline w-3 h-3 mr-1" />
                  Schedule: {schedule.start_time} – {schedule.end_time}
                </p>
              )}
              {today?.status && (
                <Badge variant="outline" className={`mt-2 text-xs ${STATUS_STYLES[today.status] || ''}`}>{STATUS_LABEL[today.status] || today.status}</Badge>
              )}
              {today?.late_label && <p className="text-xs text-yellow-400 mt-1">{today.late_label}</p>}
              {today?.early_label && <p className="text-xs text-orange-400 mt-0.5">{today.early_label}</p>}
            </div>
            {!isHolidayToday && (
              <Button
                onClick={handleAttendance}
                disabled={checking || !!today?.check_out_time}
                className={today?.check_in_time && !today.check_out_time ? 'bg-red-500 hover:bg-red-600 text-white' : ''}>
                {today?.check_in_time && !today.check_out_time
                  ? <><LogOut className="w-4 h-4 mr-1.5" />Check Out</>
                  : <><LogIn className="w-4 h-4 mr-1.5" />Check In</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Present (30d)', value: present, c: 'text-green-400' },
          { label: 'Absent',        value: absent,  c: 'text-red-400' },
          { label: 'Late',          value: late,    c: 'text-yellow-400' },
        ].map(({ label, value, c }) => (
          <Card key={label}>
            <CardContent className="p-3 md:p-4">
              <p className={`text-xl font-bold ${c}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* History */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
                <Clock className="w-4 h-4" /> Attendance History
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {['Date','Check In','Check Out','Hours','OT','Status','Note'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16 bg-muted" /></td>)}
                        </tr>
                      ))
                    : history.length === 0
                    ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No attendance records yet</td></tr>
                    : history.map(r => (
                        <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-foreground">{new Date(r.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={r.check_in_time ? 'text-green-400 font-mono text-xs' : 'text-muted-foreground'}>{fmtTime(r.check_in_time)}</span>
                            {r.late_label && <p className="text-[10px] text-yellow-400">{r.late_label}</p>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={r.check_out_time ? 'text-blue-400 font-mono text-xs' : 'text-muted-foreground'}>{fmtTime(r.check_out_time)}</span>
                            {r.early_label && <p className="text-[10px] text-orange-400">{r.early_label}</p>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{r.working_hours != null ? `${Number(r.working_hours).toFixed(1)}h` : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {r.overtime_hours && r.overtime_hours > 0 ? <span className="text-purple-400 text-xs">{Number(r.overtime_hours).toFixed(1)}h</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {r.late_minutes && r.late_minutes > 0 ? `${r.late_minutes}m late` : r.early_minutes && r.early_minutes > 0 ? `${r.early_minutes}m early` : '—'}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Upcoming Holidays */}
        <UpcomingHolidaysWidget />
      </div>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="My Attendance History"
        columns={attCols}
        rows={history as unknown as Record<string, unknown>[]}
        dateKey="date"
      />
    </div>
  );
}

