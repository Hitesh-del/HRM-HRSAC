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

export default function MyAttendance() {
  const { profile, companySettings } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [today, setToday] = useState<{ id: string; check_in_time?: string; check_out_time?: string; working_hours?: number; status: string; overtime_hours?: number } | null>(null);
  const [history, setHistory] = useState<{ id: string; date: string; status: string; check_in_time?: string; check_out_time?: string; working_hours?: number; overtime_hours?: number; late_minutes?: number; early_minutes?: number; late_label?: string | null; early_label?: string | null }[]>([]);
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
      supabase.from('attendance').select('id,date,status,check_in_time,check_out_time,working_hours,overtime_hours,late_minutes,early_minutes,late_label,early_label').eq('employee_id', profile.id).order('date', { ascending: false }).limit(30),
      supabase.from('leave_requests').select('start_date,end_date').eq('employee_id', profile.id).eq('status', 'approved'),
    ]);
    // Build set of dates covered by approved leaves
    const leaveDateSet = new Set<string>();
    (approvedLeaves || []).forEach((lr: { start_date: string; end_date: string }) => {
      let d = new Date(lr.start_date);
      const end = new Date(lr.end_date);
      while (d <= end) { leaveDateSet.add(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    });
    // Overlay on_leave for history rows with no check-in that fall in leave dates
    const mergedHist = (hist || []).map(r => {
      if (!r.check_in_time && leaveDateSet.has(r.date)) return { ...r, status: 'on_leave' };
      return r;
    });
    setToday(todayData);
    setHistory(mergedHist);
    setLoading(false);
  }, [profile, todayDate]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  useEffect(() => {
    if (!today?.check_in_time || today.check_out_time) { setLiveTime(''); return; }
    const interval = setInterval(() => {
      const diff = Date.now() - new Date(today.check_in_time!).getTime();
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      setLiveTime(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [today]);

  const handleCheckIn = async () => {
    setChecking(true);
    const now = new Date();
    const nowISO = now.toISOString();

    if (today?.check_in_time && !today.check_out_time) {
      // Check out
      let derived = { status: 'present', overtime_hours: 0, early_minutes: 0, late_minutes: 0, late_label: null as string | null, early_label: null as string | null, working_hours: null as number | null };
      if (schedule) {
        const d = deriveAttendanceStatus(today.check_in_time, nowISO, schedule);
        derived = { status: d.status, overtime_hours: d.overtime_hours, early_minutes: d.early_minutes, late_minutes: d.late_minutes, late_label: d.late_label, early_label: d.early_label, working_hours: d.working_hours };
      } else {
        const hours = Math.round((Date.now() - new Date(today.check_in_time).getTime()) / 360000) / 10;
        derived.working_hours = hours;
      }
      const { error } = await supabase.from('attendance').update({
        check_out_time: nowISO,
        working_hours: derived.working_hours,
        overtime_hours: derived.overtime_hours,
        early_minutes: derived.early_minutes,
        late_minutes: derived.late_minutes,
        late_label: derived.late_label,
        early_label: derived.early_label,
        status: derived.status,
        checkout_label: derived.overtime_hours > 0 ? `Overtime ${derived.overtime_hours}h` : null,
      }).eq('id', today.id);
      if (!error) {
        const msg = derived.overtime_hours > 0
          ? `Checked out · Overtime: ${derived.overtime_hours}h`
          : derived.early_label
          ? `Checked out · ${derived.early_label}`
          : `Checked out · Worked ${derived.working_hours?.toFixed(1)}h`;
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
          if (late_minutes <= schedule.late_threshold_few) { status = 'late'; late_label = 'Few Minutes Late'; }
          else if (late_minutes <= schedule.late_threshold_late) { status = 'late'; late_label = 'Late'; }
          else { status = 'late'; late_label = 'Very Late'; }
        }
      } else {
        if (now.getHours() >= 9 && now.getMinutes() > 15) status = 'late';
      }
      const { error } = await supabase.from('attendance').insert({
        employee_id: profile!.id, date: todayDate,
        check_in_time: nowISO, status, is_late: status === 'late',
        late_minutes, late_label,
      });
      if (!error) {
        toast.success(late_label ? `Checked in · ${late_label}` : 'Checked in successfully!');
        await fetchAttendance();
      }
    } else {
      toast.info('Attendance already completed for today');
    }
    setChecking(false);
  };

  const isHolidayToday = holidayDates.has(todayDate);
  const isOnLeaveToday = today?.status === 'on_leave';

  const monthlyPresent = history.filter(h => ['present', 'late', 'overtime'].includes(h.status)).length;
  const monthlyAbsent  = history.filter(h => h.status === 'absent').length;
  const monthlyLate    = history.filter(h => h.status === 'late').length;
  const monthlyOnLeave = history.filter(h => h.status === 'on_leave').length;

  const attExportCols: ReportColumn[] = [
    { header: 'Date',      key: 'date' },
    { header: 'Status',    key: 'status' },
    { header: 'Check-In',  key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Check-Out', key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Hours',     key: 'working_hours',  format: v => v != null ? `${Number(v).toFixed(1)}h` : '—' },
    { header: 'OT Hours',  key: 'overtime_hours', format: v => v && Number(v) > 0 ? `${Number(v).toFixed(1)}h` : '—' },
    { header: 'Late Mins', key: 'late_minutes',   format: v => v && Number(v) > 0 ? String(v) : '—' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
        <div><h1 className="text-xl font-bold text-foreground text-balance">My Attendance</h1><p className="text-sm text-muted-foreground">Track your daily attendance and history</p></div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0"><FileDown className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {/* Today card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-medium text-foreground">Today — {new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              {isHolidayToday && (
                <p className="text-sm text-blue-400 mt-0.5">🎉 Holiday today — enjoy your day!</p>
              )}
              {!isHolidayToday && isOnLeaveToday && (
                <p className="text-sm text-cyan-400 mt-0.5">🌴 You are on approved leave today.</p>
              )}
              {!isHolidayToday && !isOnLeaveToday && today?.check_in_time && !today.check_out_time && liveTime ? (
                <div className="flex items-center flex-wrap gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <p className="text-xl md:text-2xl font-bold text-primary font-mono">{liveTime}</p>
                </div>
              ) : !isHolidayToday && !isOnLeaveToday && today?.check_in_time ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  In: {new Date(today.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {today.check_out_time && ` · Out: ${new Date(today.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  {today.working_hours && ` · ${today.working_hours}h`}
                  {today.overtime_hours && today.overtime_hours > 0 && ` · OT: ${today.overtime_hours}h`}
                </p>
              ) : !isHolidayToday && !isOnLeaveToday ? (
                <p className="text-sm text-muted-foreground mt-0.5">Not checked in yet</p>
              ) : null}
              {schedule && !isHolidayToday && (
                <p className="text-xs text-muted-foreground mt-1">
                  <Clock className="inline w-3 h-3 mr-1" />
                  Schedule: {schedule.start_time} – {schedule.end_time}
                </p>
              )}
            </div>
            {!isHolidayToday && !isOnLeaveToday && (
              <Button
                onClick={handleCheckIn}
                disabled={checking || !!today?.check_out_time}
                className={today?.check_in_time && !today.check_out_time ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
              >
                {today?.check_in_time && !today.check_out_time
                  ? <><LogOut className="w-4 h-4 mr-1.5" />Check Out</>
                  : <><LogIn className="w-4 h-4 mr-1.5" />Check In</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {/* Monthly stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { l: 'Present (month)', v: monthlyPresent, c: 'text-green-400' },
              { l: 'Absent', v: monthlyAbsent, c: 'text-red-400' },
              { l: 'Late', v: monthlyLate, c: 'text-yellow-400' },
            ].map(s => (
              <Card key={s.l}><CardContent className="p-3 text-center"><p className={`text-xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-muted-foreground mt-0.5">{s.l}</p></CardContent></Card>
            ))}
          </div>

          {/* History */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance History</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Date', 'Check In', 'Check Out', 'Hours', 'OT', 'Status', 'Note'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>)}</tr>)
                      : history.map(h => (
                          <tr key={h.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 whitespace-nowrap text-foreground">{new Date(h.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={h.check_in_time ? 'text-green-400 font-mono text-xs' : 'text-muted-foreground'}>
                                {h.check_in_time ? new Date(h.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                              {h.late_label && <p className="text-[10px] text-yellow-400">{h.late_label}</p>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={h.check_out_time ? 'text-blue-400 font-mono text-xs' : 'text-muted-foreground'}>
                                {h.check_out_time ? new Date(h.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                              {h.early_label && <p className="text-[10px] text-orange-400">{h.early_label}</p>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{h.working_hours != null ? `${h.working_hours}h` : '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {h.overtime_hours ? <span className="text-purple-400 text-xs">{h.overtime_hours}h</span> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs ${STATUS_STYLES[h.status] || ''}`}>
                                {STATUS_LABEL[h.status] || h.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {h.late_minutes && h.late_minutes > 0 ? `${h.late_minutes}m late` : h.early_minutes && h.early_minutes > 0 ? `${h.early_minutes}m early` : '—'}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Holidays sidebar */}
        <div><UpcomingHolidaysWidget /></div>
      </div>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="My Attendance History"
        columns={attExportCols}
        rows={history as unknown as Record<string, unknown>[]}
        dateKey="date"
      />
    </div>
  );
}
