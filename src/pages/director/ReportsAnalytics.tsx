import { useEffect, useState, useCallback } from 'react';
import { FileDown, Printer, RefreshCw, Calendar, FileText, DollarSign, Users, TrendingUp, BookOpen, BarChart2 } from 'lucide-react';
import { generatePDF, generateCSV, printReport } from '@/lib/reportExport';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COLORS = ['hsl(191,100%,50%)','hsl(142,71%,45%)','hsl(38,92%,50%)','hsl(0,65%,51%)','hsl(280,55%,62%)'];

function fmtTime(ts: string | null | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ReportsAnalytics() {
  const { companySettings } = useAuth();
  const companyName = companySettings?.company_name || 'HRM System';
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [payrollData, setPayrollData] = useState<{ month: string; total: number }[]>([]);
  const [leaveData, setLeaveData] = useState<{ name: string; value: number }[]>([]);
  const [deptData, setDeptData] = useState<{ name: string; employees: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  // Tabular report state
  const [attRows, setAttRows] = useState<any[]>([]);
  const [leaveRows, setLeaveRows] = useState<any[]>([]);
  const [payrollRows, setPayrollRows] = useState<any[]>([]);
  const [recruitRows, setRecruitRows] = useState<any[]>([]);
  const [perfRows, setPerfRows] = useState<any[]>([]);
  const [trainingRows, setTrainingRows] = useState<any[]>([]);
  const [tableLoading, setTableLoading] = useState(false);

  // Charts (yearly)
  useEffect(() => {
    const fetchCharts = async () => {
      setChartLoading(true);
      const yr = Number(year);
      const payrollResults = await Promise.all(
        MONTHS.map(async (m, i) => {
          const { data } = await supabase.from('payroll').select('net_salary').eq('year', yr).eq('month', i + 1);
          return { month: m, total: data?.reduce((s, r) => s + Number(r.net_salary), 0) || 0 };
        })
      );
      setPayrollData(payrollResults);

      const { data: leaves } = await supabase.from('leave_requests').select('leave_type:leave_types!leave_requests_leave_type_id_fkey(name)');
      const leaveMap: Record<string, number> = {};
      leaves?.forEach((l: any) => {
        const name = l.leave_type?.name || 'Unknown';
        leaveMap[name] = (leaveMap[name] || 0) + 1;
      });
      setLeaveData(Object.entries(leaveMap).map(([name, value]) => ({ name, value })));

      const { data: depts } = await supabase.from('departments').select('id,name');
      const deptResults = await Promise.all((depts || []).map(async d => {
        const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('department_id', d.id).eq('is_active', true);
        return { name: d.name, employees: count || 0 };
      }));
      setDeptData(deptResults.filter(d => d.employees > 0).sort((a, b) => b.employees - a.employees).slice(0, 8));
      setChartLoading(false);
    };
    fetchCharts();
  }, [year]);

  // Tabular data (monthly)
  const fetchTables = useCallback(async () => {
    setTableLoading(true);
    const mon = Number(month); const yr = Number(year);
    const startDate = `${yr}-${String(mon).padStart(2, '0')}-01`;
    const endDate = new Date(yr, mon, 0).toISOString().split('T')[0];

    const [att, leaves, payroll, recruits, perf, trainings] = await Promise.all([
      supabase.from('attendance')
        .select('date,status,check_in_time,check_out_time,working_hours,is_late,employee:profiles!attendance_employee_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
        .gte('date', startDate).lte('date', endDate).order('date', { ascending: false }).limit(500),
      supabase.from('leave_requests')
        .select('start_date,end_date,total_days,status,reason,leave_type:leave_types!leave_requests_leave_type_id_fkey(name),employee:profiles!leave_requests_employee_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
        .gte('start_date', startDate).lte('end_date', endDate).order('start_date', { ascending: false }).limit(500),
      supabase.from('payroll')
        .select('month,year,basic_salary,net_salary,status,employee:profiles!payroll_employee_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
        .eq('month', mon).eq('year', yr).order('created_at', { ascending: false }),
      supabase.from('job_applications')
        .select('status,created_at,applicant:profiles!job_applications_applicant_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name)),job:job_openings!job_applications_job_id_fkey(title,department:departments!job_openings_department_id_fkey(name))')
        .gte('created_at', `${startDate}T00:00:00`).lte('created_at', `${endDate}T23:59:59`).order('created_at', { ascending: false }).limit(300),
      supabase.from('performance_reviews')
        .select('overall_rating,review_period_start,review_period_end,review_status,employee:profiles!performance_reviews_employee_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
        .gte('review_period_start', startDate).order('created_at', { ascending: false }).limit(300),
      supabase.from('training_enrollments')
        .select('status,enrolled_at,program:training_programs(title,start_date),employee:profiles!training_enrollments_employee_id_fkey(full_name,employee_id,department:departments!profiles_department_id_fkey(name))')
        .order('enrolled_at', { ascending: false }).limit(300),
    ]);
    setAttRows(att.data || []);
    setLeaveRows(leaves.data || []);
    setPayrollRows((payroll.data || []).map((r: any) => ({
      ...r,
      _month_year: `${FULL_MONTHS[(r.month ?? 1) - 1]} ${r.year}`,
    })));
    setRecruitRows(recruits.data || []);
    setPerfRows(perf.data || []);
    setTrainingRows(trainings.data || []);
    setTableLoading(false);
  }, [month, year]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  // Column definitions
  // Attendance summary counts for the selected month
  const attSummary = {
    present:     attRows.filter(r => r.status === 'present').length,
    absent:      attRows.filter(r => r.status === 'absent').length,
    on_leave:    attRows.filter(r => r.status === 'on_leave').length,
    late:        attRows.filter(r => r.status === 'late').length,
    half_day:    attRows.filter(r => r.status === 'half_day').length,
    overtime:    attRows.filter(r => r.status === 'overtime').length,
    holiday:     attRows.filter(r => r.status === 'holiday').length,
    weekend_off: attRows.filter(r => r.status === 'weekend_off').length,
  };

  // ── Report column definitions (used by PDF/Print/CSV) ──
  const attCols: ReportColumn[] = [
    { header: 'Emp ID',     key: 'employee', format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Employee',   key: 'employee', format: v => (v as any)?.full_name ?? '—' },
    { header: 'Department', key: 'employee', format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Date',       key: 'date' },
    { header: 'Check-In',   key: 'check_in_time',  format: v => fmtTime(v as string) },
    { header: 'Check-Out',  key: 'check_out_time', format: v => fmtTime(v as string) },
    { header: 'Hours',      key: 'working_hours',  format: v => v != null ? `${Number(v).toFixed(1)}h` : '—' },
    { header: 'Status',     key: 'status' },
    { header: 'Late',       key: 'is_late', format: v => v ? 'Yes' : 'No' },
  ];
  const leaveCols: ReportColumn[] = [
    { header: 'Emp ID',     key: 'employee',   format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Employee',   key: 'employee',   format: v => (v as any)?.full_name ?? '—' },
    { header: 'Department', key: 'employee',   format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Leave Type', key: 'leave_type', format: v => (v as any)?.name ?? '—' },
    { header: 'Start',      key: 'start_date' },
    { header: 'End',        key: 'end_date' },
    { header: 'Days',       key: 'total_days', format: v => String(v ?? '—') },
    { header: 'Status',     key: 'status' },
  ];
  const payCols: ReportColumn[] = [
    { header: 'Emp ID',     key: 'employee',     format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Employee',   key: 'employee',     format: v => (v as any)?.full_name ?? '—' },
    { header: 'Department', key: 'employee',     format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Month/Year', key: '_month_year',  format: v => String(v ?? '—') },
    { header: 'Basic',      key: 'basic_salary', format: v => v != null ? `$${Number(v).toLocaleString()}` : '—' },
    { header: 'Net Salary', key: 'net_salary',   format: v => v != null ? `$${Number(v).toLocaleString()}` : '—' },
    { header: 'Status',     key: 'status' },
  ];
  const recruitCols: ReportColumn[] = [
    { header: 'Applicant',    key: 'applicant', format: v => (v as any)?.full_name ?? '—' },
    { header: 'Emp ID',       key: 'applicant', format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Department',   key: 'applicant', format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Position',     key: 'job',       format: v => (v as any)?.title ?? '—' },
    { header: 'Applied Dept', key: 'job',       format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Date',         key: 'created_at', format: v => v ? new Date(v as string).toLocaleDateString() : '—' },
    { header: 'Status',       key: 'status' },
  ];
  const perfCols: ReportColumn[] = [
    { header: 'Emp ID',       key: 'employee',           format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Employee',     key: 'employee',           format: v => (v as any)?.full_name ?? '—' },
    { header: 'Department',   key: 'employee',           format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Period Start', key: 'review_period_start' },
    { header: 'Period End',   key: 'review_period_end' },
    { header: 'Rating',       key: 'overall_rating',     format: v => String(v ?? '—') },
    { header: 'Status',       key: 'review_status' },
  ];
  const trainCols: ReportColumn[] = [
    { header: 'Emp ID',     key: 'employee', format: v => (v as any)?.employee_id ?? '—' },
    { header: 'Employee',   key: 'employee', format: v => (v as any)?.full_name ?? '—' },
    { header: 'Department', key: 'employee', format: v => (v as any)?.department?.name ?? '—' },
    { header: 'Program',    key: 'program',  format: v => (v as any)?.title ?? '—' },
    { header: 'Start Date', key: 'program',  format: v => (v as any)?.start_date ?? '—' },
    { header: 'Enrollment', key: 'status' },
  ];

  const TABS = [
    { id: 'attendance',  label: 'Attendance',  icon: Calendar,    count: attRows.length,     cols: attCols,     rows: attRows     },
    { id: 'leave',       label: 'Leave',        icon: FileText,    count: leaveRows.length,   cols: leaveCols,   rows: leaveRows   },
    { id: 'payroll',     label: 'Payroll',      icon: DollarSign,  count: payrollRows.length, cols: payCols,     rows: payrollRows },
    { id: 'recruitment', label: 'Recruitment',  icon: Users,       count: recruitRows.length, cols: recruitCols, rows: recruitRows },
    { id: 'performance', label: 'Performance',  icon: TrendingUp,  count: perfRows.length,    cols: perfCols,    rows: perfRows    },
    { id: 'training',    label: 'Training',     icon: BookOpen,    count: trainingRows.length, cols: trainCols,  rows: trainingRows },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Organization-wide insights and tabular reports</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchTables} className="gap-1.5 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* ─── Charts Section ─── */}
      <div>
        <div className="flex items-center flex-wrap gap-3 mb-3">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Analytics Overview</h2>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Payroll — {year}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={payrollData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Payroll']} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Leave Requests by Type</CardTitle></CardHeader>
            <CardContent>
              {chartLoading ? <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div> : leaveData.length === 0 ? (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No leave data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={leaveData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} labelLine={false}>
                      {leaveData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} />
                    <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8, fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Department Headcount</CardTitle></CardHeader>
            <CardContent>
              {chartLoading ? <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={deptData} barSize={18} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} />
                    <Bar dataKey="employees" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]} name="Employees" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Tabular Reports ─── */}
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-semibold text-foreground">Tabular Reports</h2>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full md:w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{FULL_MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Attendance Summary Cards for selected month */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 mb-4">
          {[
            { label: 'Present',     value: attSummary.present,     color: 'text-green-400'  },
            { label: 'Absent',      value: attSummary.absent,      color: 'text-red-400'    },
            { label: 'On Leave',    value: attSummary.on_leave,    color: 'text-cyan-400'   },
            { label: 'Late',        value: attSummary.late,        color: 'text-yellow-400' },
            { label: 'Half Day',    value: attSummary.half_day,    color: 'text-orange-400' },
            { label: 'Overtime',    value: attSummary.overtime,    color: 'text-purple-400' },
            { label: 'Holiday',     value: attSummary.holiday,     color: 'text-blue-400'   },
            { label: 'Weekend',     value: attSummary.weekend_off, color: 'text-muted-foreground' },
          ].map(s => (
            <Card key={s.label} className="p-3">
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="attendance">
          <div className="overflow-x-auto">
            <TabsList className="whitespace-nowrap">
              {TABS.map(t => (
                <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
                  <t.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">{t.label}</span>
                  <Badge variant="secondary" className="text-xs ml-1">{t.count}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {TABS.map(t => (
            <TabsContent key={t.id} value={t.id} className="mt-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
                <p className="text-sm font-semibold flex items-center flex-wrap gap-2">
                  <t.icon className="w-4 h-4 text-muted-foreground" />
                  {t.label} Report — {FULL_MONTHS[Number(month) - 1]} {year}
                  <Badge variant="secondary">{t.count} records</Badge>
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8"
                    onClick={() => { if (!t.rows.length) return; generatePDF({ companyName, reportTitle: `${t.label} Report — ${FULL_MONTHS[Number(month) - 1]} ${year}` }, t.cols, t.rows as Record<string,unknown>[]); }}>
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1.5 h-8"
                    onClick={() => { if (!t.rows.length) return; generateCSV({ companyName, reportTitle: `${t.label} Report — ${FULL_MONTHS[Number(month) - 1]} ${year}` }, t.cols, t.rows as Record<string,unknown>[]); }}>
                    <FileDown className="w-3.5 h-3.5" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8"
                    onClick={() => { if (!t.rows.length) return; printReport({ companyName, reportTitle: `${t.label} Report — ${FULL_MONTHS[Number(month) - 1]} ${year}` }, t.cols, t.rows as Record<string,unknown>[]); }}>
                    <Printer className="w-3.5 h-3.5" /> Print
                  </Button>
                </div>
              </div>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        {t.cols.map(c => (
                          <th key={c.header} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{c.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableLoading
                        ? Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i} className="border-b border-border">
                              {t.cols.map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16 bg-muted" /></td>)}
                            </tr>
                          ))
                        : t.rows.length === 0
                          ? <tr><td colSpan={t.cols.length} className="px-4 py-12 text-center text-muted-foreground">No {t.label.toLowerCase()} data for {FULL_MONTHS[Number(month) - 1]} {year}</td></tr>
                          : t.rows.map((row, i) => (
                              <tr key={i} className="border-b border-border hover:bg-muted/20 transition-colors">
                                {t.cols.map((col, j) => (
                                  <td key={j} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                                    {col.format ? col.format((row as Record<string,unknown>)[col.key]) : String((row as Record<string,unknown>)[col.key] ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            ))
                      }
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
