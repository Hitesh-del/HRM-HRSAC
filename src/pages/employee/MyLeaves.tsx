import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Calendar, Clock, CheckCircle, XCircle, RefreshCw, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { notifyLeaveSubmitted } from '@/lib/notifications';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  under_manager_review: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  manager_approved: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  director_review: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
  approved: 'border-green-500/30 text-green-400 bg-green-500/10',
  rejected: 'border-red-500/30 text-red-400 bg-red-500/10',
  cancelled: 'border-muted-foreground/30 text-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Submitted',
  under_manager_review: 'Under Manager Review',
  manager_approved: 'Manager Approved',
  director_review: 'Director Review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  under_manager_review: <Clock className="w-3 h-3" />,
  manager_approved: <CheckCircle className="w-3 h-3" />,
  director_review: <Clock className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
  cancelled: <XCircle className="w-3 h-3" />,
};

interface LeaveForm { leave_type_id: string; start_date: string; end_date: string; reason: string; }

type LeaveRow = {
  id: string; status: string; start_date: string; end_date: string;
  total_days: number; reason?: string; manager_comment?: string; review_comment?: string;
  leave_type?: { name?: string };
};

export default function MyLeaves() {
  const { profile, companySettings } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
  const [balances, setBalances] = useState<{ leave_type?: { name?: string }; balance: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const form = useForm<LeaveForm>({ defaultValues: { leave_type_id: '', start_date: '', end_date: '', reason: '' } });

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: reqs }, { data: types }, { data: bals }] = await Promise.all([
      supabase.from('leave_requests')
        .select('id,status,start_date,end_date,total_days,reason,manager_comment,review_comment,leave_type:leave_types(name)')
        .eq('employee_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('leave_types').select('id,name').eq('is_active', true).order('name'),
      supabase.from('leave_balances').select('balance,leave_type:leave_types(name)').eq('employee_id', profile.id),
    ]);
    setRequests((reqs || []) as LeaveRow[]);
    setLeaveTypes(types || []);
    setBalances((bals || []) as any);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchData();
    if (!profile) return;
    const channel = supabase.channel(`myleaves-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: `employee_id=eq.${profile.id}` }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, profile]);

  const onSubmit = async (v: LeaveForm) => {
    if (!v.start_date || !v.end_date) { toast.error('Please select start and end dates'); return; }
    const start = new Date(v.start_date);
    const end = new Date(v.end_date);
    if (end < start) { toast.error('End date must be after start date'); return; }
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    setSaving(true);
    const { data: newLeave, error } = await supabase.from('leave_requests').insert({
      employee_id: profile!.id,
      leave_type_id: v.leave_type_id,
      start_date: v.start_date,
      end_date: v.end_date,
      total_days: days,
      reason: v.reason || null,
      status: 'pending',
    }).select('id').maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Leave request submitted — awaiting manager review');
    // Notify department manager
    if (newLeave?.id && profile?.department_id) {
      notifyLeaveSubmitted(profile.full_name || 'An employee', profile.department_id, newLeave.id);
    }
    setCreateOpen(false);
    form.reset();
    fetchData();
    setSaving(false);
  };

  const filtered = requests.filter(r => {
    const name = (r.leave_type?.name || '').toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = requests.filter(r => ['pending','under_manager_review','manager_approved','director_review'].includes(r.status)).length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  const leaveCols: ReportColumn[] = [
    { header: 'Leave Type',  key: 'leave_type',  format: v => (v as any)?.name ?? '—' },
    { header: 'Start Date',  key: 'start_date' },
    { header: 'End Date',    key: 'end_date' },
    { header: 'Days',        key: 'total_days',  format: v => String(v ?? '—') },
    { header: 'Status',      key: 'status' },
    { header: 'Reason',      key: 'reason',      format: v => String(v ?? '') },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Leave Requests</h1>
          <p className="text-sm text-muted-foreground">Submit and track your leave requests</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 shrink-0"><RefreshCw className="w-3.5 h-3.5" /></Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0"><FileDown className="w-3.5 h-3.5" /> Export</Button>
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Request Leave</Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'In Progress', value: pendingCount, color: 'text-yellow-400' },
          { label: 'Approved', value: approvedCount, color: 'text-green-400' },
          { label: 'Rejected', value: rejectedCount, color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <p className={`text-xl md:text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leave balances */}
      {balances.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
              <Calendar className="w-4 h-4" /> Leave Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {balances.map((b, i) => (
                <div key={i} className="flex items-center flex-wrap gap-2 bg-muted/30 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">{b.leave_type?.name || '—'}</span>
                  <span className="text-sm font-semibold text-primary">{b.balance}d</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leave type…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Submitted</SelectItem>
            <SelectItem value="under_manager_review">Under Manager Review</SelectItem>
            <SelectItem value="manager_approved">Manager Approved</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requests table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Type', 'Start', 'End', 'Days', 'Status', 'Comment'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}
                    </tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No leave requests yet</td></tr>
                  : filtered.map(r => (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.leave_type?.name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.start_date}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.end_date}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{r.total_days}d</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs flex items-center gap-1 w-fit ${STATUS_STYLES[r.status] || ''}`}>
                            {STATUS_ICON[r.status]}
                            {STATUS_LABEL[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate whitespace-nowrap">
                          {r.review_comment || r.manager_comment || '—'}
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Leave Request</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="leave_type_id" rules={{ required: 'Leave type is required' }} render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                      <SelectContent>
                        {leaveTypes.length === 0
                          ? <SelectItem value="none" disabled>No leave types available</SelectItem>
                          : leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                        }
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="start_date" rules={{ required: 'Start date is required' }} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="end_date" rules={{ required: 'End date is required' }} render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl><Textarea placeholder="Reason for leave (optional)…" rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit Request'}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="My Leave History"
        columns={leaveCols}
        rows={requests as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
