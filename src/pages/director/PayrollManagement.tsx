import { useEffect, useState, useCallback, useRef } from 'react';
import { DollarSign, Plus, Search, Play, CheckCircle, Clock, Edit, Trash2, RefreshCw, AlertTriangle, Users, Eye, FileText, FileDown, BadgeCheck } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Payroll, Profile } from '@/types/types';

const STATUS_STYLES: Record<string, string> = {
  draft:     'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  processed: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  generated: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  pending:   'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  paid:      'border-green-500/30 text-green-400 bg-green-500/10',
  active:    'border-green-500/30 text-green-400 bg-green-500/10',
  inactive:  'border-muted-foreground/30 text-muted-foreground bg-muted/10',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface SalaryForm {
  employee_id: string; basic_salary: string; hra: string; transport_allowance: string;
  medical_allowance: string; special_allowance: string; other_allowances: string;
  bonus: string;
  pf_deduction: string; esi_deduction: string; tax_deduction: string; other_deductions: string;
  effective_from: string; status: string;
}

interface SalaryRow {
  id: string; employee_id: string; basic_salary: number; hra: number; transport_allowance: number;
  medical_allowance: number; special_allowance: number; other_allowances: number; bonus: number;
  pf_deduction: number; esi_deduction: number; tax_deduction: number; other_deductions: number;
  effective_from: string; status: string; created_at: string; updated_at: string;
  employee?: { id: string; full_name?: string; employee_id?: string; department_id?: string; department?: { name: string } | null } | null;
}
type PayrollRow = Payroll & { employee?: Profile & { department?: { name: string } | null } };

export default function PayrollManagement() {
  const { profile } = useAuth();

  // payroll state
  const [payrolls, setPayrolls] = useState<PayrollRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth() + 1));
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [payrollSearch, setPayrollSearch] = useState('');
  const [processing, setProcessing] = useState(false);

  // view payroll state
  const [viewPayroll, setViewPayroll] = useState<PayrollRow | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // salary structure state
  const [salaries, setSalaries] = useState<SalaryRow[]>([]);
  const [salaryLoading, setSalaryLoading] = useState(true);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [salarySearch, setSalarySearch] = useState('');
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<SalaryRow | null>(null);
  const [savingSalary, setSavingSalary] = useState(false);

  const salaryForm = useForm<SalaryForm>({
    defaultValues: {
      employee_id: '', basic_salary: '', hra: '0', transport_allowance: '0',
      medical_allowance: '0', special_allowance: '0', other_allowances: '0',
      bonus: '0',
      pf_deduction: '0', esi_deduction: '', tax_deduction: '', other_deductions: '',
      effective_from: new Date().toISOString().split('T')[0],
    },
  });

  // ---------- fetchers ----------
  const fetchSalaries = useCallback(async () => {
    setSalaryLoading(true);
    const { data, error } = await supabase
      .from('salary_structures')
      .select('id,employee_id,basic_salary,hra,transport_allowance,medical_allowance,special_allowance,other_allowances,bonus,pf_deduction,esi_deduction,tax_deduction,other_deductions,effective_from,status,created_at,updated_at,employee:profiles(id,full_name,employee_id,department_id,department:departments(name))')
      .order('created_at', { ascending: false });
    if (error) console.error('fetchSalaries error:', error.message);
    setSalaries((data || []) as unknown as SalaryRow[]);
    setSalaryLoading(false);
  }, []);

  const fetchPayrolls = useCallback(async () => {
    setPayrollLoading(true);
    const { data, error } = await supabase
      .from('payroll')
      .select([
        'id,employee_id,month,year,status,processed_at,notes,created_at',
        'basic_salary,hra,transport_allowance,medical_allowance,special_allowance,other_allowances,bonus,overtime_pay',
        'pf_deduction,esi_deduction,tax_deduction,other_deductions,unpaid_leave_deduction,late_deduction,net_salary',
        'total_days,working_days,present_days,absent_days,overtime_hours',
        'employee:profiles!payroll_employee_id_fkey(id,full_name,employee_id,department:departments!profiles_department_id_fkey(id,name))',
      ].join(','))
      .eq('month', Number(monthFilter))
      .eq('year', Number(yearFilter))
      .order('created_at', { ascending: false });
    if (error) {
      console.error('fetchPayrolls error:', error.message, error.details, error.hint);
    }
    setPayrolls((data || []) as unknown as PayrollRow[]);
    setPayrollLoading(false);
  }, [monthFilter, yearFilter]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,full_name,employee_id,role,department_id')
      .in('role', ['employee', 'management'])
      .eq('is_active', true)
      .order('full_name');
    setEmployees((data || []) as unknown as Profile[]);
  }, []);

  useEffect(() => {
    fetchSalaries();
    fetchEmployees();
  }, [fetchSalaries, fetchEmployees]);

  useEffect(() => { fetchPayrolls(); }, [fetchPayrolls]);

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase.channel('payroll-mgmt-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_structures' }, () => fetchSalaries())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll' }, () => fetchPayrolls())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchSalaries, fetchPayrolls]);

  // ---------- salary CRUD ----------
  const openCreateSalary = () => {
    setEditingSalary(null);
    salaryForm.reset({
      employee_id: '', basic_salary: '', hra: '0', transport_allowance: '0',
      medical_allowance: '0', special_allowance: '0', other_allowances: '0',
      bonus: '0',
      pf_deduction: '0', esi_deduction: '0', tax_deduction: '0', other_deductions: '0',
      effective_from: new Date().toISOString().split('T')[0],
      status: 'active',
    });
    setSalaryDialogOpen(true);
  };

  const openEditSalary = (s: SalaryRow) => {
    setEditingSalary(s);
    salaryForm.reset({
      employee_id: s.employee_id,
      basic_salary: String(s.basic_salary),
      hra: String(s.hra),
      transport_allowance: String(s.transport_allowance),
      medical_allowance: String(s.medical_allowance),
      special_allowance: String(s.special_allowance),
      other_allowances: String(s.other_allowances),
      bonus: String(s.bonus ?? 0),
      pf_deduction: String(s.pf_deduction),
      esi_deduction: String(s.esi_deduction),
      tax_deduction: String(s.tax_deduction),
      other_deductions: String(s.other_deductions),
      effective_from: s.effective_from,
      status: s.status || 'active',
    });
    setSalaryDialogOpen(true);
  };

  const onSalarySubmit = async (v: SalaryForm) => {
    setSavingSalary(true);
    const payload = {
      employee_id: v.employee_id,
      basic_salary: Number(v.basic_salary),
      hra: Number(v.hra),
      transport_allowance: Number(v.transport_allowance),
      medical_allowance: Number(v.medical_allowance),
      special_allowance: Number(v.special_allowance),
      other_allowances: Number(v.other_allowances),
      bonus: Number(v.bonus || 0),
      pf_deduction: Number(v.pf_deduction),
      esi_deduction: Number(v.esi_deduction),
      tax_deduction: Number(v.tax_deduction),
      other_deductions: Number(v.other_deductions),
      effective_from: v.effective_from,
      status: v.status || 'active',
    };
    if (editingSalary) {
      const { error } = await supabase.from('salary_structures').update(payload).eq('id', editingSalary.id);
      if (error) { toast.error(error.message); setSavingSalary(false); return; }
      toast.success('Salary structure updated');
    } else {
      const { error } = await supabase.from('salary_structures').insert(payload);
      if (error) { toast.error(error.message); setSavingSalary(false); return; }
      toast.success('Salary structure created');
    }
    setSavingSalary(false);
    setSalaryDialogOpen(false);
    fetchSalaries();
  };

  const deleteSalary = async (id: string) => {
    const { error } = await supabase.from('salary_structures').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Salary structure deleted');
    fetchSalaries();
  };

  // ---------- run payroll engine ----------
  const runPayroll = async () => {
    setProcessing(true);
    const mon = Number(monthFilter);
    const yr = Number(yearFilter);

    try {
      // Step 1: Get all active employees
      const { data: activeEmps } = await supabase
        .from('profiles')
        .select('id,full_name,employee_id')
        .in('role', ['employee', 'management'])
        .eq('is_active', true);

      if (!activeEmps?.length) { toast.error('No active employees found'); setProcessing(false); return; }

      // Step 2: Fetch salary structures for active employees
      const { data: allSalaries } = await supabase
        .from('salary_structures')
        .select('*')
        .in('employee_id', activeEmps.map(e => e.id));

      const salaryMap = new Map((allSalaries || []).map(s => [s.employee_id, s]));
      const missing = activeEmps.filter(e => !salaryMap.has(e.id));
      // Filter to only employees WITH salary structures
      const processableEmps = activeEmps.filter(e => salaryMap.has(e.id));

      if (!processableEmps.length) {
        const names = missing.slice(0, 5).map(e => e.full_name || e.employee_id).join(', ');
        toast.error(`No salary structures found. Please assign salary structures first. Missing: ${names}`);
        setProcessing(false);
        return;
      }

      if (missing.length > 0) {
        toast.warning(`${missing.length} employee(s) skipped (no salary structure): ${missing.map(e=>e.full_name||e.employee_id).slice(0,3).join(', ')}${missing.length>3?'…':''}`);
      }

      // Step 3: Get attendance for the month
      const startDate = `${yr}-${String(mon).padStart(2,'0')}-01`;
      const endDate = new Date(yr, mon, 0).toISOString().split('T')[0];

      const { data: attendanceRecords } = await supabase
        .from('attendance')
        .select('employee_id,status,overtime_hours,is_late')
        .gte('date', startDate)
        .lte('date', endDate);

      // Step 4: Get leave records for the month
      const { data: leaveRecords } = await supabase
        .from('leave_requests')
        .select('employee_id,total_days,leave_type:leave_types(carry_forward)')
        .in('status', ['approved'])
        .gte('start_date', startDate)
        .lte('end_date', endDate);

      const totalWorkingDays = new Date(yr, mon, 0).getDate();
      let processed = 0;

      for (const emp of processableEmps) {
        const sal = salaryMap.get(emp.id)!;

        // Calculate attendance metrics
        const empAtt = (attendanceRecords || []).filter(a => a.employee_id === emp.id);
        const presentDays = empAtt.filter(a => ['present', 'late', 'half_day'].includes(a.status)).length;
        const absentDays = empAtt.filter(a => a.status === 'absent').length;
        const lateDays = empAtt.filter(a => a.is_late).length;
        const overtimeHrs = empAtt.reduce((s, a) => s + Number(a.overtime_hours || 0), 0);

        // Calculate leave deductions (unpaid = carry_forward = false treated as unpaid)
        const empLeaves = (leaveRecords || []).filter(l => l.employee_id === emp.id);
        const unpaidLeaveDays = empLeaves
          .filter(l => !(l.leave_type as any)?.carry_forward)
          .reduce((s, l) => s + l.total_days, 0);

        // Salary calculations
        const perDaySalary = sal.basic_salary / totalWorkingDays;
        const unpaidLeaveDeduction = perDaySalary * unpaidLeaveDays;
        const lateDeduction = (lateDays > 3) ? perDaySalary * 0.5 * Math.max(0, lateDays - 3) : 0;
        const overtimePay = overtimeHrs > 0 ? (sal.basic_salary / (totalWorkingDays * 8)) * 1.5 * overtimeHrs : 0;

        const grossSalary = sal.basic_salary + sal.hra + sal.transport_allowance +
          sal.medical_allowance + sal.special_allowance + sal.other_allowances + overtimePay;
        const totalDeductions = sal.pf_deduction + sal.esi_deduction + sal.tax_deduction +
          sal.other_deductions + unpaidLeaveDeduction + lateDeduction;
        const netSalary = Math.max(0, grossSalary - totalDeductions);

        const payloadRecord = {
          employee_id: emp.id,
          month: mon,
          year: yr,
          basic_salary: sal.basic_salary,
          hra: sal.hra,
          transport_allowance: sal.transport_allowance,
          medical_allowance: sal.medical_allowance,
          special_allowance: sal.special_allowance,
          other_allowances: sal.other_allowances,
          bonus: Number(sal.bonus ?? 0),
          overtime_pay: Math.round(overtimePay * 100) / 100,
          pf_deduction: sal.pf_deduction,
          esi_deduction: sal.esi_deduction,
          tax_deduction: sal.tax_deduction,
          other_deductions: sal.other_deductions,
          unpaid_leave_deduction: Math.round(unpaidLeaveDeduction * 100) / 100,
          late_deduction: Math.round(lateDeduction * 100) / 100,
          net_salary: Math.round(netSalary * 100) / 100,
          total_days: totalWorkingDays,
          working_days: totalWorkingDays - absentDays,
          present_days: presentDays,
          absent_days: absentDays,
          overtime_hours: overtimeHrs,
          status: 'generated' as const,
          processed_by: profile?.id,
          processed_at: new Date().toISOString(),
        };
        const { error: insertErr } = await supabase
          .from('payroll')
          .upsert(payloadRecord, { onConflict: 'employee_id,month,year', ignoreDuplicates: false });
        if (insertErr) {
          console.error('payroll upsert error:', insertErr.message);
        } else {
          processed++;
        }
      }

      await fetchPayrolls();
      if (processed === 0 && missing.length > 0) {
        toast.warning(`Payroll skipped: all ${missing.length} employee(s) have no salary structure assigned.`);
      } else if (processed > 0) {
        toast.success(`Payroll generated for ${processed} employee(s). Records updated in the table below.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Payroll processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const markAsPaid = async (id: string) => {
    const { error } = await supabase.from('payroll').update({ status: 'paid' }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Marked as paid');
    setPayrolls(prev => prev.map(p => p.id === id ? { ...p, status: 'paid' } : p));
  };

  // ---------- payslip helpers ----------
  const generatePayslipHTML = (p: PayrollRow): string => {
    const emp = p.employee as any;
    const allowances = Number(p.transport_allowance) + Number(p.medical_allowance) + Number(p.special_allowance) + Number(p.other_allowances);
    const deductions = Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.tax_deduction) + Number(p.other_deductions) + Number(p.unpaid_leave_deduction) + Number(p.late_deduction);
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payslip</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;}
      h1{font-size:22px;margin:0 0 4px;} .sub{color:#555;font-size:13px;margin-bottom:16px;}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;background:#f5f5f5;padding:12px;border-radius:6px;margin-bottom:16px;font-size:13px;}
      .info-grid span{color:#555;} .info-grid strong{color:#111;}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;}
      th{background:#f5f5f5;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}
      td{padding:8px 10px;border-bottom:1px solid #eee;}
      .total-row td{font-weight:700;background:#f9f9f9;}
      .net{font-size:18px;font-weight:700;text-align:right;padding:12px;background:#111;color:#fff;border-radius:6px;}
      @media print{.no-print{display:none!important;}}
    </style></head><body>
    <h1>Payslip</h1>
    <div class="sub">${MONTHS[p.month - 1]} ${p.year}</div>
    <div class="info-grid">
      <span>Employee</span><strong>${emp?.full_name || '—'}</strong>
      <span>Employee ID</span><strong>${emp?.employee_id || '—'}</strong>
      <span>Department</span><strong>${emp?.department?.name || '—'}</strong>
      <span>Status</span><strong style="text-transform:capitalize;">${p.status}</strong>
    </div>
    <div className="w-full overflow-x-auto">
    <table><thead><tr><th>Earnings</th><th>Amount</th></tr></thead><tbody>
      <tr><td>Basic Salary</td><td>$${Number(p.basic_salary).toLocaleString()}</td></tr>
      <tr><td>HRA</td><td>$${Number(p.hra).toLocaleString()}</td></tr>
      <tr><td>Allowances</td><td>$${allowances.toLocaleString()}</td></tr>
      <tr><td>Bonus</td><td>$${Number(p.bonus).toLocaleString()}</td></tr>
      <tr><td>Overtime Pay</td><td>$${Number(p.overtime_pay).toLocaleString()}</td></tr>
      <tr class="total-row"><td>Gross Salary</td><td>$${(Number(p.basic_salary)+Number(p.hra)+allowances+Number(p.bonus)+Number(p.overtime_pay)).toLocaleString()}</td></tr>
    </tbody></table>
    </div>
    <div className="w-full overflow-x-auto">
    <table><thead><tr><th>Deductions</th><th>Amount</th></tr></thead><tbody>
      <tr><td>Provident Fund</td><td>$${Number(p.pf_deduction).toLocaleString()}</td></tr>
      <tr><td>ESI</td><td>$${Number(p.esi_deduction).toLocaleString()}</td></tr>
      <tr><td>Tax</td><td>$${Number(p.tax_deduction).toLocaleString()}</td></tr>
      <tr><td>Other Deductions</td><td>$${Number(p.other_deductions).toLocaleString()}</td></tr>
      <tr><td>Unpaid Leave</td><td>$${Number(p.unpaid_leave_deduction).toLocaleString()}</td></tr>
      <tr><td>Late Deduction</td><td>$${Number(p.late_deduction).toLocaleString()}</td></tr>
      <tr class="total-row"><td>Total Deductions</td><td>$${deductions.toLocaleString()}</td></tr>
    </tbody></table>
    </div>
    <div class="net">Net Salary: $${Number(p.net_salary).toLocaleString()}</div>
    </body></html>`;
  };

  const printPayslip = (p: PayrollRow) => {
    const html = generatePayslipHTML(p);
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) { toast.error('Pop-up blocked. Allow pop-ups to print payslip.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  };

  const downloadPayslip = (p: PayrollRow) => {
    const html = generatePayslipHTML(p);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const emp = p.employee as any;
    a.href = url;
    a.download = `payslip_${emp?.employee_id || p.employee_id}_${MONTHS[p.month-1]}_${p.year}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Payslip downloaded');
  };

  // ---------- computed stats ----------
  const totalPayroll = payrolls.reduce((s, p) => s + Number(p.net_salary), 0);
  const paidCount = payrolls.filter(p => p.status === 'paid').length;
  const pendingCount = payrolls.filter(p => p.status !== 'paid').length;

  const filteredPayrolls = payrolls.filter(p => {
    const name = p.employee?.full_name?.toLowerCase() || '';
    const eid = p.employee?.employee_id?.toLowerCase() || '';
    const q = payrollSearch.toLowerCase();
    return name.includes(q) || eid.includes(q);
  });

  const filteredSalaries = salaries.filter(s => {
    const name = (s.employee as any)?.full_name?.toLowerCase() || '';
    const eid = (s.employee as any)?.employee_id?.toLowerCase() || '';
    const q = salarySearch.toLowerCase();
    return name.includes(q) || eid.includes(q);
  });

  // employees without salary structure
  const assignedEmployeeIds = new Set(salaries.map(s => s.employee_id));
  const unassignedEmployees = employees.filter(e => !assignedEmployeeIds.has(e.id));

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-foreground text-balance">Payroll Management</h1>
        <p className="text-sm text-muted-foreground">Manage salary structures and process payroll</p>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="payroll" className="flex-1 min-w-0 md:flex-none">Payroll Processing</TabsTrigger>
          <TabsTrigger value="salary" className="flex-1 min-w-0 md:flex-none">Salary Structures</TabsTrigger>
        </TabsList>

        {/* ─── PAYROLL TAB ─── */}
        <TabsContent value="payroll" className="space-y-4 mt-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Total Payroll', value: `$${totalPayroll.toLocaleString()}`, icon: DollarSign, color: 'text-primary' },
              { label: 'Paid', value: paidCount, icon: CheckCircle, color: 'text-green-400' },
              { label: 'Pending', value: pendingCount, icon: Clock, color: 'text-yellow-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-4 flex items-center flex-wrap gap-3">
                  <Icon className={`w-8 h-8 ${color} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-bold text-foreground truncate">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Run payroll controls */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Month</p>
                  <Select value={monthFilter} onValueChange={setMonthFilter}>
                    <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Year</p>
                  <Select value={yearFilter} onValueChange={setYearFilter}>
                    <SelectTrigger className="w-full md:w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{[2023,2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={runPayroll} disabled={processing} className="gap-2">
                  {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {processing ? 'Processing…' : 'Run Payroll'}
                </Button>
                {unassignedEmployees.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {unassignedEmployees.length} employee(s) missing salary structure
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Search */}
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[12rem] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={payrollSearch} onChange={e => setPayrollSearch(e.target.value)} placeholder="Search employee…" className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0">
              <FileDown className="w-4 h-4" /> Export
            </Button>
          </div>

          {/* Payroll table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee','Dept','Basic','HRA','Allowances','Overtime','Bonus','Deductions','Net Salary','Status','Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payrollLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 11 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}
                        </tr>
                      ))
                    : filteredPayrolls.length === 0
                      ? <tr><td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                          No payroll has been generated for the selected month.
                        </td></tr>
                      : filteredPayrolls.map(p => {
                          const allowances = Number(p.transport_allowance) + Number(p.medical_allowance) + Number(p.special_allowance) + Number(p.other_allowances);
                          const deductions = Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.tax_deduction) + Number(p.other_deductions) + Number(p.unpaid_leave_deduction) + Number(p.late_deduction);
                          return (
                            <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="font-medium text-foreground">{(p.employee as any)?.full_name || '—'}</div>
                                <div className="text-xs text-muted-foreground font-mono">{(p.employee as any)?.employee_id || ''}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{(p.employee as any)?.department?.name || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">${Number(p.basic_salary).toLocaleString()}</td>
                              <td className="px-4 py-3 whitespace-nowrap">${Number(p.hra).toLocaleString()}</td>
                              <td className="px-4 py-3 whitespace-nowrap">${allowances.toLocaleString()}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-green-400">{Number(p.overtime_pay) > 0 ? `+$${Number(p.overtime_pay).toLocaleString()}` : '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{Number(p.bonus) > 0 ? `$${Number(p.bonus).toLocaleString()}` : '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-red-400">-${deductions.toLocaleString()}</td>
                              <td className="px-4 py-3 whitespace-nowrap font-semibold text-primary">${Number(p.net_salary).toLocaleString()}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[p.status] || STATUS_STYLES['draft']}`}>{p.status}</Badge>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View Payroll" onClick={() => setViewPayroll(p)}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print Payslip" onClick={() => printPayslip(p)}>
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download Payslip" onClick={() => downloadPayslip(p)}>
                                    <FileDown className="w-3.5 h-3.5" />
                                  </Button>
                                  {p.status !== 'paid' && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:text-green-300" title="Mark as Paid" onClick={() => markAsPaid(p.id)}>
                                      <BadgeCheck className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ─── SALARY STRUCTURES TAB ─── */}
        <TabsContent value="salary" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="relative flex-1 min-w-[10rem] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={salarySearch} onChange={e => setSalarySearch(e.target.value)} placeholder="Search employee…" className="pl-9" />
            </div>
            <Button onClick={openCreateSalary} className="gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Add Salary Structure
            </Button>
          </div>

          {unassignedEmployees.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-yellow-400">Salary Structure Not Assigned</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {unassignedEmployees.map(e => e.full_name).join(', ')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
                <Users className="w-4 h-4" /> Salary Structures ({filteredSalaries.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Emp ID','Employee Name','Department','Basic Salary','HRA','Allowances','Bonus','PF','ESI','Tax','Other Ded.','Status','Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {salaryLoading
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-border">
                            {Array.from({ length: 13 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>)}
                          </tr>
                        ))
                      : filteredSalaries.length === 0
                        ? <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">No salary structures found. Click "Add Salary Structure" to create one.</td></tr>
                        : filteredSalaries.map(s => {
                            const emp = s.employee as any;
                            const totalAllowances = Number(s.hra) + Number(s.transport_allowance) + Number(s.medical_allowance) + Number(s.special_allowance) + Number(s.other_allowances);
                            return (
                              <tr key={s.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">{emp?.employee_id || '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{emp?.full_name || '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{emp?.department?.name || '—'}</td>
                                <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">${Number(s.basic_salary).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap">${Number(s.hra).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap">${totalAllowances.toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap">${Number(s.bonus ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-red-400">${Number(s.pf_deduction).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-red-400">${Number(s.esi_deduction).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-red-400">${Number(s.tax_deduction).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-red-400">${Number(s.other_deductions).toLocaleString()}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <Badge variant="outline" className={`text-xs ${STATUS_STYLES[s.status] || STATUS_STYLES['active']}`}>{s.status || 'active'}</Badge>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex flex-wrap gap-1">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditSalary(s)}>
                                      <Edit className="w-3.5 h-3.5" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Salary Structure?</AlertDialogTitle>
                                          <AlertDialogDescription>This will remove the salary structure for {emp?.full_name}.</AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteSalary(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                    }
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── SALARY DIALOG ─── */}
      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSalary ? 'Edit Salary Structure' : 'Create Salary Structure'}</DialogTitle>
          </DialogHeader>
          <Form {...salaryForm}>
            <form onSubmit={salaryForm.handleSubmit(onSalarySubmit)} className="space-y-4">
              {!editingSalary && (
                <FormField control={salaryForm.control} name="employee_id" rules={{ required: 'Employee is required' }} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                        <SelectContent>
                          {unassignedEmployees.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.employee_id})</SelectItem>
                          ))}
                          {unassignedEmployees.length === 0 && (
                            <SelectItem value="none" disabled>All employees assigned</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['basic_salary','Basic Salary', true],
                  ['hra','HRA', false],
                  ['transport_allowance','Transport Allowance', false],
                  ['medical_allowance','Medical Allowance', false],
                  ['special_allowance','Special Allowance', false],
                  ['other_allowances','Other Allowances', false],
                  ['bonus','Bonus', false],
                  ['pf_deduction','PF Deduction', false],
                  ['esi_deduction','ESI Deduction', false],
                  ['tax_deduction','Tax Deduction', false],
                  ['other_deductions','Other Deductions', false],
                ].map(([name, label, required]) => (
                  <FormField key={name as string} control={salaryForm.control} name={name as keyof SalaryForm}
                    rules={{ required: required ? `${label} is required` : false, min: { value: 0, message: 'Cannot be negative' } }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label as string}</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={salaryForm.control} name="effective_from" rules={{ required: 'Effective date is required' }} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective From</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={salaryForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSalaryDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingSalary}>{savingSalary ? 'Saving…' : editingSalary ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ─── VIEW PAYROLL DIALOG ─── */}
      <Dialog open={!!viewPayroll} onOpenChange={o => !o && setViewPayroll(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center flex-wrap gap-2">
              <FileText className="w-4 h-4" /> Payroll Detail — {viewPayroll ? `${MONTHS[viewPayroll.month - 1]} ${viewPayroll.year}` : ''}
            </DialogTitle>
          </DialogHeader>
          {viewPayroll && (() => {
            const p = viewPayroll;
            const emp = p.employee as any;
            const allowances = Number(p.transport_allowance) + Number(p.medical_allowance) + Number(p.special_allowance) + Number(p.other_allowances);
            const deductions = Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.tax_deduction) + Number(p.other_deductions) + Number(p.unpaid_leave_deduction) + Number(p.late_deduction);
            const gross = Number(p.basic_salary) + Number(p.hra) + allowances + Number(p.bonus) + Number(p.overtime_pay);
            return (
              <div className="space-y-4" ref={printRef}>
                {/* Employee info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
                  {[
                    ['Employee', emp?.full_name || '—'],
                    ['Employee ID', emp?.employee_id || '—'],
                    ['Department', emp?.department?.name || '—'],
                    ['Period', `${MONTHS[p.month - 1]} ${p.year}`],
                    ['Working Days', String(p.working_days ?? '—')],
                    ['Present Days', String(p.present_days ?? '—')],
                    ['Status', p.status],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium text-foreground capitalize">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Earnings */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings</p>
                  <div className="space-y-1 text-sm">
                    {[
                      ['Basic Salary', p.basic_salary],
                      ['HRA', p.hra],
                      ['Allowances', allowances],
                      ['Bonus', p.bonus],
                      ['Overtime Pay', p.overtime_pay],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between flex-wrap gap-2 py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{String(label)}</span>
                        <span className="font-medium text-foreground">${Number(val).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between flex-wrap gap-2 py-1.5 font-semibold">
                      <span>Gross Salary</span>
                      <span className="text-primary">${gross.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deductions</p>
                  <div className="space-y-1 text-sm">
                    {[
                      ['Provident Fund', p.pf_deduction],
                      ['ESI', p.esi_deduction],
                      ['Income Tax', p.tax_deduction],
                      ['Other Deductions', p.other_deductions],
                      ['Unpaid Leave', p.unpaid_leave_deduction],
                      ['Late Deduction', p.late_deduction],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between flex-wrap gap-2 py-1 border-b border-border/50">
                        <span className="text-muted-foreground">{String(label)}</span>
                        <span className="font-medium text-red-400">-${Number(val).toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="flex justify-between flex-wrap gap-2 py-1.5 font-semibold">
                      <span>Total Deductions</span>
                      <span className="text-red-400">-${deductions.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Net salary */}
                <div className="flex flex-wrap justify-between items-center gap-2 bg-primary rounded-lg px-4 py-3">
                  <span className="text-primary-foreground font-semibold">Net Salary</span>
                  <span className="text-primary-foreground text-xl font-bold">${Number(p.net_salary).toLocaleString()}</span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => printPayslip(p)}>
                    <FileText className="w-3.5 h-3.5" /> Print Payslip
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => downloadPayslip(p)}>
                    <FileDown className="w-3.5 h-3.5" /> Download
                  </Button>
                  {p.status !== 'paid' && (
                    <Button size="sm" className="gap-1.5" onClick={() => { markAsPaid(p.id); setViewPayroll(prev => prev ? { ...prev, status: 'paid' } : null); }}>
                      <BadgeCheck className="w-3.5 h-3.5" /> Mark as Paid
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Payroll Management Report"
        columns={[
          { header: 'Employee',     key: 'employee',    format: v => (v as any)?.full_name || '—' },
          { header: 'Department',   key: 'employee',    format: v => (v as any)?.department?.name || '—' },
          { header: 'Basic Salary', key: 'basic_salary',format: v => `$${Number(v||0).toLocaleString()}` },
          { header: 'Net Salary',   key: 'net_salary',  format: v => `$${Number(v||0).toLocaleString()}` },
          { header: 'Month',        key: 'payroll_month', format: v => String(v ?? '—') },
          { header: 'Year',         key: 'payroll_year',  format: v => String(v ?? '—') },
          { header: 'Status',       key: 'status' },
        ] satisfies ReportColumn[]}
        rows={payrolls as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}
