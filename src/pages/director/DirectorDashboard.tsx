import { useEffect, useState } from 'react';
import {
  Users, UserCog, Building2, TrendingUp, Calendar,
  DollarSign, UserPlus, Clock, Briefcase, BarChart2,
  UserCheck, UserX, AlarmClock, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '@/db/supabase';
import type { DashboardStats } from '@/types/types';
import UpcomingHolidaysWidget from '@/components/common/UpcomingHolidaysWidget';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DirectorDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<{ name: string; present: number; absent: number }[]>([]);
  const [growthData, setGrowthData] = useState<{ month: string; employees: number }[]>([]);
  const [attSummary, setAttSummary] = useState({ present: 0, absent: 0, late: 0, half_day: 0, overtime: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().getMonth() + 1;
        const thisYear = new Date().getFullYear();
        const monthStart = `${thisYear}-${String(thisMonth).padStart(2, '0')}-01`;

        const [
          { count: totalEmployees },
          { count: totalManagement },
          { count: activeEmployees },
          { count: totalDepartments },
          { count: presentToday },
          { count: onLeaveToday },
          { count: pendingLeaveRequests },
          { count: openJobs },
          { count: newJoiners },
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('is_active', true),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'management').eq('is_active', true),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true).in('role', ['employee', 'management']),
          supabase.from('departments').select('*', { count: 'exact', head: true }),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('status', 'present'),
          supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('status', 'on_leave'),
          supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('job_openings').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('date_of_joining', monthStart),
        ]);

        const { data: payrollData } = await supabase
          .from('payroll')
          .select('net_salary')
          .eq('month', thisMonth)
          .eq('year', thisYear)
          .eq('status', 'processed');
        const monthlyPayrollTotal = payrollData?.reduce((s, r) => s + (r.net_salary || 0), 0) || 0;

        setStats({
          totalEmployees: totalEmployees || 0,
          totalManagement: totalManagement || 0,
          activeEmployees: activeEmployees || 0,
          totalDepartments: totalDepartments || 0,
          presentToday: presentToday || 0,
          onLeaveToday: onLeaveToday || 0,
          pendingLeaveRequests: pendingLeaveRequests || 0,
          monthlyPayrollTotal,
          newJoinersThisMonth: newJoiners || 0,
          openJobs: openJobs || 0,
        });

        // Attendance chart (last 7 days)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split('T')[0];
        });
        const { data: attRaw } = await supabase
          .from('attendance')
          .select('date, status')
          .in('date', last7Days);
        const attChart = last7Days.map(d => ({
          name: new Date(d).toLocaleDateString('en', { weekday: 'short' }),
          present: attRaw?.filter(r => r.date === d && r.status === 'present').length || 0,
          absent: attRaw?.filter(r => r.date === d && r.status === 'absent').length || 0,
        }));
        setAttendanceData(attChart);

        // Today's full attendance summary
        const { data: todayAtt } = await supabase
          .from('attendance')
          .select('status')
          .eq('date', today);
        const attArr = todayAtt || [];
        setAttSummary({
          present:  attArr.filter(r => r.status === 'present').length,
          absent:   attArr.filter(r => r.status === 'absent').length,
          late:     attArr.filter(r => r.status === 'late').length,
          half_day: attArr.filter(r => r.status === 'half_day').length,
          overtime: attArr.filter(r => r.status === 'overtime').length,
        });

        // Growth chart (last 6 months)
        const growthRaw = await Promise.all(
          Array.from({ length: 6 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const end = new Date(y, m, 0).toISOString().split('T')[0];
            return supabase.from('profiles')
              .select('*', { count: 'exact', head: true })
              .lte('date_of_joining', end)
              .in('role', ['employee', 'management'])
              .then(r => ({ month: MONTHS[m - 1], employees: r.count || 0 }));
          })
        );
        setGrowthData(growthRaw);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = stats ? [
    { label: 'Total Employees', value: stats.totalEmployees, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Management', value: stats.totalManagement, icon: UserCog, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Departments', value: stats.totalDepartments, icon: Building2, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Present Today', value: stats.presentToday, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'On Leave Today', value: stats.onLeaveToday, icon: Calendar, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Pending Leaves', value: stats.pendingLeaveRequests, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Monthly Payroll', value: `$${stats.monthlyPayrollTotal.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'New Joiners', value: stats.newJoinersThisMonth, icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Open Positions', value: stats.openJobs, icon: Briefcase, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Active Staff', value: stats.activeEmployees, icon: BarChart2, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-foreground text-balance">Director Dashboard</h1>
        <p className="text-sm text-muted-foreground">Organization overview and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="h-full">
              <CardContent className="p-4">
                <Skeleton className="h-8 w-8 rounded mb-2" />
                <Skeleton className="h-6 w-16 mb-1" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          statCards.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="h-full">
                <CardContent className="p-4">
                  <div className={`w-8 h-8 rounded ${s.bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Attendance Summary */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's Attendance Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { l: 'Present',  v: attSummary.present,  c: 'text-green-400',  bg: 'bg-green-500/10',  Icon: UserCheck },
            { l: 'Absent',   v: attSummary.absent,   c: 'text-red-400',    bg: 'bg-red-500/10',    Icon: UserX },
            { l: 'Late',     v: attSummary.late,     c: 'text-yellow-400', bg: 'bg-yellow-500/10', Icon: AlarmClock },
            { l: 'Half Day', v: attSummary.half_day, c: 'text-orange-400', bg: 'bg-orange-500/10', Icon: Clock },
            { l: 'Overtime', v: attSummary.overtime, c: 'text-purple-400', bg: 'bg-purple-500/10', Icon: Zap },
          ].map(s => (
            <Card key={s.l}>
              <CardContent className="p-4 flex items-center flex-wrap gap-3">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                  <s.Icon className={`w-4 h-4 ${s.c}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${s.c}`}>{loading ? '—' : s.v}</p>
                  <p className="text-xs text-muted-foreground">{s.l}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Charts + Holidays */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Attendance (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={attendanceData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} />
                <Bar dataKey="present" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Present" />
                <Bar dataKey="absent" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Workforce Growth (6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="employees" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 3 }} name="Employees" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        <UpcomingHolidaysWidget />
      </div>

      {/* Quick info */}
      {stats && stats.pendingLeaveRequests > 0 && (
        <div className="flex items-center flex-wrap gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
          <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
          <p className="text-sm text-foreground">
            <strong className="text-yellow-400">{stats.pendingLeaveRequests}</strong> leave request{stats.pendingLeaveRequests > 1 ? 's' : ''} awaiting your review.
          </p>
          <Badge variant="outline" className="ml-auto border-yellow-500/30 text-yellow-400 text-xs">
            Action Required
          </Badge>
        </div>
      )}
    </div>
  );
}
