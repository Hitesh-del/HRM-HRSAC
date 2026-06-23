import { useEffect, useState } from 'react';
import { Clock, Calendar, CheckSquare, Megaphone, DollarSign, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import UpcomingHolidaysWidget from '@/components/common/UpcomingHolidaysWidget';
import { STATUS_LABEL, STATUS_STYLES, deriveAttendanceStatus, timeToMins } from '@/lib/attendanceLogic';
import type { CompanyWorkSchedule, Holiday } from '@/types/types';

export default function EmployeeDashboard() {
  const { profile, companySettings } = useAuth();
  const [todayAttendance, setTodayAttendance] = useState<{id:string;status:string;check_in_time?:string|null;check_out_time?:string|null;working_hours?:number|null;late_label?:string|null;overtime_hours?:number|null}|null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [leaveBalance, setLeaveBalance] = useState<number>(0);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [announcements, setAnnouncements] = useState<{id:string;title:string;content:string;created_at:string}[]>([]);
  const [latestPayroll, setLatestPayroll] = useState<{net_salary:number;month:number;year:number}|null>(null);
  const [liveTime, setLiveTime] = useState('');
  const [schedule, setSchedule] = useState<CompanyWorkSchedule | null>(null);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  const todayDate = new Date().toISOString().split('T')[0];

  // Load schedule + holidays
  useEffect(() => {
    if (!companySettings) return;
    supabase.from('company_work_schedule').select('*').eq('company_settings_id', companySettings.id).maybeSingle()
      .then(({ data }) => { if (data) setSchedule(data as CompanyWorkSchedule); });
    supabase.from('holidays').select('date').eq('company_settings_id', companySettings.id)
      .then(({ data }) => {
        const s = new Set<string>(); (data as Holiday[]||[]).forEach(h=>s.add(h.date)); setHolidayDates(s);
      });
  }, [companySettings]);

  useEffect(() => {
    if (!profile) return;
    const fetch = async () => {
      const [attRes, tasksRes, annRes, leaveBRes, payRes, leaveRes] = await Promise.all([
        supabase.from('attendance').select('*').eq('employee_id',profile.id).eq('date',todayDate).maybeSingle(),
        supabase.from('tasks').select('*',{count:'exact',head:true}).eq('assigned_to',profile.id).in('status',['todo','in_progress']),
        supabase.from('announcements').select('id,title,content,created_at').or('is_global.eq.true').order('created_at',{ascending:false}).limit(3),
        supabase.from('leave_balances').select('balance').eq('employee_id',profile.id).limit(4),
        supabase.from('payroll').select('net_salary,month,year').eq('employee_id',profile.id).order('year',{ascending:false}).order('month',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('leave_requests').select('id').eq('employee_id',profile.id).eq('status','approved').lte('start_date',todayDate).gte('end_date',todayDate).maybeSingle(),
      ]);
      // If today is covered by an approved leave and employee hasn't checked in, show on_leave
      const rawAtt = attRes.data;
      const isOnLeaveToday = !!leaveRes.data;
      const todayAtt = rawAtt
        ? (!rawAtt.check_in_time && isOnLeaveToday ? { ...rawAtt, status: 'on_leave' } : rawAtt)
        : (isOnLeaveToday ? { id: 'leave-today', status: 'on_leave', check_in_time: null, check_out_time: null } : null);
      setTodayAttendance(todayAtt);
      setTaskCount(tasksRes.count || 0);
      setAnnouncements(annRes.data || []);
      setLeaveBalance(((leaveBRes.data)||[]).reduce((s:number,b:any)=>s+(b.balance||0),0));
      setLatestPayroll(payRes.data);
      setLoading(false);
    };
    fetch();
  }, [profile, todayDate]);

  useEffect(() => {
    if (!todayAttendance?.check_in_time || todayAttendance.check_out_time) { setLiveTime(''); return; }
    const interval = setInterval(() => {
      const start = new Date(todayAttendance.check_in_time!).getTime();
      const diff = Date.now() - start;
      const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
      setLiveTime(`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [todayAttendance]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    const isHoliday = holidayDates.has(todayDate);
    if (isHoliday) { toast.info("Today is a holiday — no need to check in!"); setCheckingIn(false); return; }
    if (todayAttendance?.status === 'on_leave') { toast.info("You have approved leave today — no check-in needed."); setCheckingIn(false); return; }

    const now = new Date();
    const nowISO = now.toISOString();

    if (todayAttendance?.check_in_time && !todayAttendance.check_out_time) {
      // Check out with schedule logic
      let updateData: Record<string,unknown> = { check_out_time: nowISO, status: 'present' };
      if (schedule) {
        const d = deriveAttendanceStatus(todayAttendance.check_in_time, nowISO, schedule);
        updateData = { check_out_time: nowISO, status: d.status, working_hours: d.working_hours,
          overtime_hours: d.overtime_hours, early_minutes: d.early_minutes,
          early_label: d.early_label, late_minutes: d.late_minutes, late_label: d.late_label };
      } else {
        const hours = Math.round((Date.now()-new Date(todayAttendance.check_in_time).getTime())/360000)/10;
        updateData = { check_out_time: nowISO, working_hours: hours, status: 'present' };
      }
      const { error } = await supabase.from('attendance').update(updateData).eq('id', todayAttendance.id);
      if (!error) {
        toast.success('Checked out successfully');
        const { data } = await supabase.from('attendance').select('*').eq('id', todayAttendance.id).maybeSingle();
        setTodayAttendance(data);
      }
    } else if (!todayAttendance) {
      // Check in with schedule logic
      let status = 'present', late_minutes = 0, late_label: string|null = null;
      if (schedule) {
        const startMins = timeToMins(schedule.start_time);
        const nowMins = now.getHours()*60 + now.getMinutes();
        if (nowMins > startMins) {
          late_minutes = nowMins - startMins;
          if (late_minutes <= schedule.late_threshold_few) late_label = 'Few Minutes Late';
          else if (late_minutes <= schedule.late_threshold_late) late_label = 'Late';
          else late_label = 'Very Late';
          status = 'late';
        }
      } else {
        if (now.getHours() > 9 || (now.getHours()===9 && now.getMinutes()>15)) status = 'late';
      }
      const { data, error } = await supabase.from('attendance')
        .insert({ employee_id:profile!.id, date:todayDate, check_in_time:nowISO, status, is_late: status==='late', late_minutes, late_label })
        .select().maybeSingle();
      if (!error) {
        toast.success(late_label ? `Checked in · ${late_label}` : 'Checked in!');
        setTodayAttendance(data);
      }
    } else {
      toast.info('Already checked out for today');
    }
    setCheckingIn(false);
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isHolidayToday = holidayDates.has(todayDate);

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-foreground text-balance">Good {new Date().getHours()<12?'Morning':new Date().getHours()<17?'Afternoon':'Evening'}, {profile?.full_name?.split(' ')[0]||'there'}</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})}</p>
      </div>

      {/* Attendance Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Today's Attendance</p>
              {isHolidayToday && <p className="text-sm text-blue-400 mt-0.5">🎉 Holiday today — enjoy your day!</p>}
              {!isHolidayToday && todayAttendance?.check_in_time && !todayAttendance.check_out_time && liveTime ? (
                <div className="flex items-center flex-wrap gap-2 mt-1"><div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/><p className="text-xl font-bold text-primary font-mono">{liveTime}</p></div>
              ) : (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {todayAttendance?.check_in_time
                    ? `Checked in ${new Date(todayAttendance.check_in_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`
                    : 'Not checked in yet'}
                  {todayAttendance?.check_out_time && ` · Out ${new Date(todayAttendance.check_out_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`}
                </p>
              )}
              {todayAttendance?.check_out_time && todayAttendance.working_hours && (
                <p className="text-xs text-muted-foreground mt-0.5">Worked {Number(todayAttendance.working_hours).toFixed(1)}h today
                  {todayAttendance.overtime_hours && todayAttendance.overtime_hours > 0 && <span className="text-purple-400 ml-1">· OT: {todayAttendance.overtime_hours}h</span>}
                </p>
              )}
              {todayAttendance?.late_label && <p className="text-xs text-yellow-400 mt-0.5">{todayAttendance.late_label}</p>}
              {todayAttendance?.status && (
                <span className={`inline-flex mt-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${STATUS_STYLES[todayAttendance.status]||''}`}>
                  {STATUS_LABEL[todayAttendance.status] || todayAttendance.status}
                </span>
              )}
              {schedule && !isHolidayToday && (
                <p className="text-xs text-muted-foreground mt-1"><Clock className="inline w-3 h-3 mr-1"/>{schedule.start_time} – {schedule.end_time}</p>
              )}
            </div>
            {!isHolidayToday && (
              <Button onClick={handleCheckIn} disabled={checkingIn||(!!todayAttendance?.check_out_time)} className={todayAttendance?.check_in_time&&!todayAttendance.check_out_time?'bg-red-500 hover:bg-red-600 text-white':''}>
                {todayAttendance?.check_in_time&&!todayAttendance.check_out_time?<><LogOut className="w-4 h-4 mr-1.5"/>Check Out</>:<><LogIn className="w-4 h-4 mr-1.5"/>Check In</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading?Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-16"/></CardContent></Card>):<>
          <Card><CardContent className="p-4"><div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center mb-2"><Clock className="w-4 h-4 text-primary"/></div><p className="text-xl font-bold text-foreground">{todayAttendance?.working_hours||0}h</p><p className="text-xs text-muted-foreground">Today's Hours</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center mb-2"><Calendar className="w-4 h-4 text-blue-400"/></div><p className="text-xl font-bold text-foreground">{leaveBalance}</p><p className="text-xs text-muted-foreground">Leave Balance</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="w-8 h-8 rounded bg-orange-500/10 flex items-center justify-center mb-2"><CheckSquare className="w-4 h-4 text-orange-400"/></div><p className="text-xl font-bold text-foreground">{taskCount}</p><p className="text-xs text-muted-foreground">Pending Tasks</p></CardContent></Card>
          <Card><CardContent className="p-4"><div className="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center mb-2"><DollarSign className="w-4 h-4 text-green-400"/></div><p className="text-xl font-bold text-foreground">{latestPayroll?`$${latestPayroll.net_salary.toLocaleString()}`:'—'}</p><p className="text-xs text-muted-foreground">{latestPayroll?`${MONTHS[latestPayroll.month-1]} Salary`:'No payroll'}</p></CardContent></Card>
        </>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2"><Megaphone className="w-4 h-4"/>Latest Announcements</CardTitle></CardHeader>
          <CardContent>
            {loading?<Skeleton className="h-20 bg-muted"/>:announcements.length===0?<p className="text-sm text-muted-foreground text-center py-4">No announcements</p>:(
              <div className="space-y-2">
                {announcements.map(a=>(
                  <div key={a.id} className="py-2 border-b border-border last:border-0">
                    <h4 className="text-sm font-medium text-foreground">{a.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.content}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <UpcomingHolidaysWidget />
      </div>
    </div>
  );
}
