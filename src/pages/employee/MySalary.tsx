import { useEffect, useState } from 'react';
import { DollarSign, Download, TrendingUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_STYLES: Record<string, string> = {
  draft:     'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  processed: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  generated: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  pending:   'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  paid:      'border-green-500/30 text-green-400 bg-green-500/10',
};

type PayrollRow = {
  id: string; month: number; year: number; net_salary: number; basic_salary: number;
  hra: number; transport_allowance: number; medical_allowance: number; special_allowance: number;
  other_allowances: number; bonus: number; overtime_pay: number; pf_deduction: number;
  esi_deduction: number; tax_deduction: number; other_deductions: number;
  unpaid_leave_deduction: number; late_deduction: number; present_days: number; absent_days: number; status: string;
};

type SalaryRow = {
  basic_salary: number; hra: number; transport_allowance: number; medical_allowance: number;
  special_allowance: number; other_allowances: number; pf_deduction: number; esi_deduction: number;
  tax_deduction: number; other_deductions: number;
};

export default function MySalary() {
  const { profile } = useAuth();
  const [payrolls, setPayrolls] = useState<PayrollRow[]>([]);
  const [salary, setSalary] = useState<SalaryRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    if (!profile) return;
    Promise.all([
      supabase.from('payroll').select('*').eq('employee_id', profile.id)
        .order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
      supabase.from('salary_structures').select('*').eq('employee_id', profile.id)
        .order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([{ data: pay }, { data: sal }]) => {
      setPayrolls((pay || []) as PayrollRow[]);
      setSalary(sal as SalaryRow | null);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
    if (!profile) return;
    const channel = supabase.channel(`salary-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll', filter: `employee_id=eq.${profile.id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartData = [...payrolls].reverse().map(p => ({ month: `${MONTHS[p.month - 1]} ${p.year}`, net: p.net_salary }));

  const netCalc = salary
    ? salary.basic_salary + salary.hra + salary.transport_allowance + salary.medical_allowance +
      salary.special_allowance + salary.other_allowances - salary.pf_deduction - salary.esi_deduction -
      salary.tax_deduction - salary.other_deductions
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Salary & Payslips</h1>
          <p className="text-sm text-muted-foreground">Your salary information and payslip history</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData} className="shrink-0 gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Current Salary Structure */}
      {loading ? (
        <Card><CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent></Card>
      ) : salary ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
              <DollarSign className="w-4 h-4" /> Current Salary Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                ['Basic Salary', salary.basic_salary, false],
                ['HRA', salary.hra, false],
                ['Transport', salary.transport_allowance, false],
                ['Medical', salary.medical_allowance, false],
                ['Special Allowance', salary.special_allowance, false],
                ['Other Allowances', salary.other_allowances, false],
                ['PF Deduction', salary.pf_deduction, true],
                ['ESI Deduction', salary.esi_deduction, true],
                ['Tax Deduction', salary.tax_deduction, true],
                ['Other Deductions', salary.other_deductions, true],
              ].map(([l, v, isDeduction]) => (
                <div key={l as string}>
                  <p className="text-xs text-muted-foreground">{l as string}</p>
                  <p className={`text-base font-semibold ${isDeduction ? 'text-red-400' : 'text-foreground'}`}>
                    {isDeduction ? '-' : '+'}${Number(v).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex flex-wrap justify-between items-center gap-2">
              <span className="text-sm font-medium text-foreground">Net Salary</span>
              <span className="text-xl font-bold text-primary">${netCalc.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 md:p-6 text-center text-muted-foreground text-sm">
            No salary structure assigned yet. Please contact your administrator.
          </CardContent>
        </Card>
      )}

      {/* Salary Trend Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
              <TrendingUp className="w-4 h-4" /> Salary Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Net Salary']} />
                  <Bar dataKey="net" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payslip History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Payslip History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Month', 'Present Days', 'Basic', 'Overtime', 'Deductions', 'Net Salary', 'Status', 'Action'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-16" /></td>)}
                      </tr>
                    ))
                  : payrolls.length === 0
                    ? <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No payroll has been generated for you yet.</td></tr>
                    : payrolls.map(p => {
                        const totalDed = Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.tax_deduction) + Number(p.other_deductions) + Number(p.unpaid_leave_deduction);
                        return (
                          <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-3 whitespace-nowrap font-medium text-foreground">{MONTHS[p.month - 1]} {p.year}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{p.present_days} / {p.present_days + p.absent_days}</td>
                            <td className="px-3 py-3 whitespace-nowrap">${Number(p.basic_salary).toLocaleString()}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-green-400">{Number(p.overtime_pay) > 0 ? `+$${Number(p.overtime_pay).toLocaleString()}` : '—'}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-red-400">-${totalDed.toLocaleString()}</td>
                            <td className="px-3 py-3 whitespace-nowrap font-semibold text-primary">${Number(p.net_salary).toLocaleString()}</td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs ${STATUS_STYLES[p.status] || ''}`}>{p.status}</Badge>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                                const allowances = Number(p.transport_allowance) + Number(p.medical_allowance) + Number(p.special_allowance) + Number(p.other_allowances);
                                const deductions = Number(p.pf_deduction) + Number(p.esi_deduction) + Number(p.tax_deduction) + Number(p.other_deductions) + Number(p.unpaid_leave_deduction) + Number(p.late_deduction);
                                const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payslip</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111;}h1{margin:0 0 4px;}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;}th{background:#f5f5f5;text-align:left;padding:8px;}td{padding:8px;border-bottom:1px solid #eee;}.net{font-size:18px;font-weight:700;text-align:right;padding:12px;background:#111;color:#fff;border-radius:6px;}</style></head><body><h1>Payslip — ${MONTHS[p.month-1]} ${p.year}</h1><p>Employee: ${profile?.full_name} | Dept: ${profile?.department?.name || '—'}</p><table><thead><tr><th>Earnings</th><th>Amount</th></tr></thead><tbody><tr><td>Basic Salary</td><td>$${Number(p.basic_salary).toLocaleString()}</td></tr><tr><td>HRA</td><td>$${Number(p.hra).toLocaleString()}</td></tr><tr><td>Allowances</td><td>$${allowances.toLocaleString()}</td></tr><tr><td>Bonus</td><td>$${Number(p.bonus).toLocaleString()}</td></tr><tr><td>Overtime</td><td>$${Number(p.overtime_pay).toLocaleString()}</td></tr></tbody></table><table><thead><tr><th>Deductions</th><th>Amount</th></tr></thead><tbody><tr><td>PF</td><td>$${Number(p.pf_deduction).toLocaleString()}</td></tr><tr><td>ESI</td><td>$${Number(p.esi_deduction).toLocaleString()}</td></tr><tr><td>Tax</td><td>$${Number(p.tax_deduction).toLocaleString()}</td></tr><tr><td>Other</td><td>$${Number(p.other_deductions).toLocaleString()}</td></tr><tr><td>Unpaid Leave</td><td>$${Number(p.unpaid_leave_deduction).toLocaleString()}</td></tr><tr><td>Total</td><td>$${deductions.toLocaleString()}</td></tr></tbody></table><div class="net">Net Salary: $${Number(p.net_salary).toLocaleString()}</div></body></html>`;
                                const blob = new Blob([html], { type: 'text/html' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `payslip_${MONTHS[p.month-1]}_${p.year}.html`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}>
                                <Download className="w-3 h-3" /> Download
                              </Button>
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
    </div>
  );
}

