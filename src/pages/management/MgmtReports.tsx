import { useEffect, useState, useCallback } from 'react';
import { FileDown, FileText, Users, Calendar, DollarSign, TrendingUp, BookOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function MgmtReports() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [exportOpenTab, setExportOpenTab] = useState<string | null>(null);

  const [attRows, setAttRows] = useState<any[]>([]);
  const [leaveRows, setLeaveRows] = useState<any[]>([]);
  const [payrollRows, setPayrollRows] = useState<any[]>([]);
  const [recruitRows, setRecruitRows] = useState<any[]>([]);
  const [perfRows, setPerfRows] = useState<any[]>([]);
  const [trainingRows, setTrainingRows] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);
    const mon = Number(month); const yr = Number(year);
    const startDate = `${yr}-${String(mon).padStart(2,'0')}-01`;
    const endDate = new Date(yr, mon, 0).toISOString().split('T')[0];

    // Get dept member IDs
    const { data: members } = await supabase.from('profiles').select('id').eq('department_id', profile.department_id).in('role',['employee','management']);
    const ids = (members||[]).map(m=>m.id);

    if (!ids.length) { setLoading(false); return; }

    const [att, leaves, payroll, jobs, perf, trainings] = await Promise.all([
      supabase.from('attendance').select('id,date,status,check_in_time,check_out_time,working_hours,is_late,employee:profiles!attendance_employee_id_fkey(full_name,employee_id)').in('employee_id',ids).gte('date',startDate).lte('date',endDate).order('date',{ascending:false}),
      supabase.from('leave_requests').select('id,start_date,end_date,total_days,status,reason,leave_type:leave_types(name),employee:profiles!leave_requests_employee_id_fkey(full_name,employee_id)').in('employee_id',ids).gte('start_date',startDate).lte('end_date',endDate).order('start_date',{ascending:false}),
      supabase.from('payroll').select('id,month,year,basic_salary,net_salary,status,employee:profiles!payroll_employee_id_fkey(full_name,employee_id)').in('employee_id',ids).eq('month',mon).eq('year',yr),
      supabase.from('job_openings').select('id,title,status,vacancies,created_at').eq('department_id',profile.department_id),
      supabase.from('performance_reviews').select('id,overall_rating,review_period_start,review_period_end,review_status,employee:profiles!performance_reviews_employee_id_fkey(full_name,employee_id)').in('employee_id',ids).gte('review_period_start',startDate).order('created_at',{ascending:false}),
      supabase.from('training_enrollments').select('id,status,enrolled_at,program:training_programs(title,start_date),employee:profiles!training_enrollments_employee_id_fkey(full_name,employee_id)').in('employee_id',ids).order('enrolled_at',{ascending:false}),
    ]);

    setAttRows(att.data||[]); setLeaveRows(leaves.data||[]); setPayrollRows(payroll.data||[]);
    setRecruitRows(jobs.data||[]); setPerfRows(perf.data||[]); setTrainingRows(trainings.data||[]);
    setLoading(false);
  }, [profile, month, year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const attCols: ReportColumn[] = [
    { header: 'Employee ID', key: 'employee', format: v => (v as any)?.employee_id || '—' },
    { header: 'Employee',    key: 'employee', format: v => (v as any)?.full_name || '—' },
    { header: 'Date',        key: 'date' },
    { header: 'Check-In',   key: 'check_in_time',  format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Check-Out',  key: 'check_out_time', format: v => v ? new Date(v as string).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { header: 'Hours',       key: 'working_hours',  format: v => v != null ? `${Number(v).toFixed(1)} hrs` : '—' },
    { header: 'Status',      key: 'status' },
    { header: 'Late',        key: 'is_late', format: v => v ? 'Yes' : 'No' },
  ];
  const leaveCols: ReportColumn[] = [
    { header: 'Employee ID', key: 'employee',   format: v => (v as any)?.employee_id || '—' },
    { header: 'Employee',    key: 'employee',   format: v => (v as any)?.full_name || '—' },
    { header: 'Leave Type',  key: 'leave_type', format: v => (v as any)?.name || '—' },
    { header: 'Start Date',  key: 'start_date' },
    { header: 'End Date',    key: 'end_date' },
    { header: 'Days',        key: 'total_days', format: v => String(v ?? '—') },
    { header: 'Status',      key: 'status' },
  ];
  const payCols: ReportColumn[] = [
    { header: 'Employee ID',   key: 'employee',     format: v => (v as any)?.employee_id || '—' },
    { header: 'Employee',      key: 'employee',     format: v => (v as any)?.full_name || '—' },
    { header: 'Basic Salary',  key: 'basic_salary', format: v => v != null ? `$${Number(v).toLocaleString()}` : '—' },
    { header: 'Net Salary',    key: 'net_salary',   format: v => v != null ? `$${Number(v).toLocaleString()}` : '—' },
    { header: 'Status',        key: 'status' },
  ];
  const recruitCols: ReportColumn[] = [
    { header: 'Position',  key: 'title' },
    { header: 'Status',    key: 'status' },
    { header: 'Vacancies', key: 'vacancies',   format: v => String(v ?? '—') },
    { header: 'Created',   key: 'created_at',  format: v => v ? new Date(v as string).toLocaleDateString() : '—' },
  ];
  const perfCols: ReportColumn[] = [
    { header: 'Employee ID',  key: 'employee',           format: v => (v as any)?.employee_id || '—' },
    { header: 'Employee',     key: 'employee',           format: v => (v as any)?.full_name || '—' },
    { header: 'Period Start', key: 'review_period_start' },
    { header: 'Period End',   key: 'review_period_end' },
    { header: 'Rating',       key: 'overall_rating',     format: v => String(v ?? '—') },
    { header: 'Status',       key: 'review_status' },
  ];
  const trainCols: ReportColumn[] = [
    { header: 'Employee ID', key: 'employee', format: v => (v as any)?.employee_id || '—' },
    { header: 'Employee',    key: 'employee', format: v => (v as any)?.full_name || '—' },
    { header: 'Program',     key: 'program',  format: v => (v as any)?.title || '—' },
    { header: 'Start Date',  key: 'program',  format: v => (v as any)?.start_date || '—' },
    { header: 'Status',      key: 'status' },
  ];

  // Attendance summary for selected month
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

  const TABS = [
    { id: 'attendance',  label: 'Attendance',  icon: Calendar,   count: attRows.length,      rows: attRows,      cols: attCols,      dateKey: 'date' },
    { id: 'leave',       label: 'Leave',       icon: FileText,   count: leaveRows.length,    rows: leaveRows,    cols: leaveCols,    dateKey: 'start_date' },
    { id: 'payroll',     label: 'Payroll',     icon: DollarSign, count: payrollRows.length,  rows: payrollRows,  cols: payCols,      dateKey: 'created_at' },
    { id: 'recruitment', label: 'Recruitment', icon: Users,      count: recruitRows.length,  rows: recruitRows,  cols: recruitCols,  dateKey: 'created_at' },
    { id: 'performance', label: 'Performance', icon: TrendingUp, count: perfRows.length,     rows: perfRows,     cols: perfCols,     dateKey: 'review_period_start' },
    { id: 'training',    label: 'Training',    icon: BookOpen,   count: trainingRows.length, rows: trainingRows, cols: trainCols,    dateKey: 'enrolled_at' },
  ] as const;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Department Reports</h1>
          <p className="text-sm text-muted-foreground">Generate and export department data reports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m,i)=><SelectItem key={m} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{[2023,2024,2025,2026].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="secondary" onClick={fetchAll} className="gap-1.5"><RefreshCw className="w-4 h-4" /> Refresh</Button>
        </div>
      </div>

      {/* Attendance Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
        {[
          { label: 'Present',  value: attSummary.present,     color: 'text-green-400'  },
          { label: 'Absent',   value: attSummary.absent,      color: 'text-red-400'    },
          { label: 'On Leave', value: attSummary.on_leave,    color: 'text-cyan-400'   },
          { label: 'Late',     value: attSummary.late,        color: 'text-yellow-400' },
          { label: 'Half Day', value: attSummary.half_day,    color: 'text-orange-400' },
          { label: 'Overtime', value: attSummary.overtime,    color: 'text-purple-400' },
          { label: 'Holiday',  value: attSummary.holiday,     color: 'text-blue-400'   },
          { label: 'Weekend',  value: attSummary.weekend_off, color: 'text-muted-foreground' },
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
              <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
                <t.icon className="w-4 h-4" /> {t.label} Report – {MONTHS[Number(month)-1]} {year}
                <Badge variant="secondary">{t.count} records</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5 h-8"
                onClick={() => setExportOpenTab(t.id)}>
                <FileDown className="w-3.5 h-3.5" /> Export
              </Button>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {t.cols.map(c => <th key={c.header} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{c.header}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-border">
                            {t.cols.map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}
                          </tr>
                        ))
                      : t.rows.length === 0
                        ? <tr><td colSpan={t.cols.length} className="px-4 py-10 text-center text-muted-foreground">No {t.label.toLowerCase()} data for {MONTHS[Number(month)-1]} {year}</td></tr>
                        : t.rows.map((row: any, i: number) => (
                            <tr key={i} className="border-b border-border hover:bg-muted/30 transition-colors">
                              {t.cols.map((col, j) => (
                                <td key={j} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                                  {col.format ? col.format(row[col.key]) : (row[col.key] ?? '—')}
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

      {TABS.map(t => (
        <ReportExportDialog
          key={t.id}
          open={exportOpenTab === t.id}
          onClose={() => setExportOpenTab(null)}
          reportTitle={`${t.label} Report – ${MONTHS[Number(month)-1]} ${year}`}
          columns={t.cols as ReportColumn[]}
          rows={t.rows as Record<string, unknown>[]}
          dateKey={t.dateKey}
        />
      ))}
    </div>
  );
}
