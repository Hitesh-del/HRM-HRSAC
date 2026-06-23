import { useEffect, useState, useCallback } from 'react';
import { Plus, Calendar, Clock, CheckCircle, XCircle, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { notifyManagementLeaveSubmitted } from '@/lib/notifications';

const STATUS_STYLES: Record<string, string> = {
  pending:            'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  director_review:    'border-purple-500/30 text-purple-400 bg-purple-500/10',
  approved:           'border-green-500/30 text-green-400 bg-green-500/10',
  rejected:           'border-red-500/30 text-red-400 bg-red-500/10',
};
const STATUS_LABEL: Record<string, string> = {
  pending:            'Pending',
  director_review:    'Director Review',
  approved:           'Approved',
  rejected:           'Rejected',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  approved:        <CheckCircle className="w-3 h-3" />,
  rejected:        <XCircle className="w-3 h-3" />,
  director_review: <Clock className="w-3 h-3" />,
  pending:         <Clock className="w-3 h-3" />,
};

interface LeaveReq {
  id: string; status: string; start_date: string; end_date: string; total_days: number;
  reason?: string; review_comment?: string; created_at: string;
  leave_type?: { name: string } | null;
}
interface LeaveType { id: string; name: string; }
interface LeaveForm { leave_type_id: string; start_date: string; end_date: string; reason: string; }

export default function MgmtMyLeaves() {
  const { profile } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [requests, setRequests] = useState<LeaveReq[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<LeaveForm>({
    defaultValues: { leave_type_id: '', start_date: '', end_date: '', reason: '' },
  });

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: reqs }, { data: types }] = await Promise.all([
      supabase.from('leave_requests')
        .select('id,status,start_date,end_date,total_days,reason,review_comment,created_at,leave_type:leave_types(name)')
        .eq('employee_id', profile.id)
        .order('created_at', { ascending: false }),
      supabase.from('leave_types').select('id,name').order('name'),
    ]);
    setRequests((reqs || []) as unknown as LeaveReq[]);
    setLeaveTypes(types || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('mgmt-my-leaves-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests', filter: `employee_id=eq.${profile.id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, fetchData]);

  const onSubmit = async (v: LeaveForm) => {
    if (!v.start_date || !v.end_date) { toast.error('Please select start and end dates'); return; }
    const start = new Date(v.start_date); const end = new Date(v.end_date);
    if (end < start) { toast.error('End date must be after start date'); return; }
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    setSaving(true);
    const { data: newLeave, error } = await supabase.from('leave_requests').insert({
      employee_id: profile!.id,
      leave_type_id: v.leave_type_id,
      start_date: v.start_date, end_date: v.end_date, total_days: days,
      reason: v.reason || null,
      // Manager leaves go DIRECTLY to director — no manager approval step needed
      status: 'director_review',
    }).select('id').maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Leave request submitted — awaiting Director approval');
    // Notify director
    if (newLeave?.id) {
      notifyManagementLeaveSubmitted(profile?.full_name || 'A department manager', newLeave.id);
    }
    setCreateOpen(false);
    form.reset();
    fetchData();
    setSaving(false);
  };

  const pendingCount  = requests.filter(r => ['pending','director_review'].includes(r.status)).length;
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
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">My Leave Requests</h1>
          <p className="text-sm text-muted-foreground">Apply for leave — requests go directly to Director</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0"><FileDown className="w-3.5 h-3.5" /> Export</Button>
          <Button onClick={() => { form.reset(); setCreateOpen(true); }} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" /> Apply for Leave</Button>
        </div>
      </div>

      {/* Workflow notice */}
      <Card className="border-purple-500/30 bg-purple-500/5">
        <CardContent className="p-3 flex items-start gap-2">
          <Clock className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-purple-400">Manager Leave Workflow</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              As a Department Manager, your leave requests are sent <strong className="text-foreground">directly to the Director</strong> for approval — bypassing the normal employee → manager → director flow.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: pendingCount, icon: Clock, cls: 'text-yellow-400' },
          { label: 'Approved', value: approvedCount, icon: CheckCircle, cls: 'text-green-400' },
          { label: 'Rejected', value: rejectedCount, icon: XCircle, cls: 'text-red-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}><CardContent className="p-3 md:p-4 flex items-center flex-wrap gap-2 md:gap-3">
            <Icon className={`w-6 h-6 md:w-7 md:h-7 ${cls} shrink-0`} />
            <div className="min-w-0"><p className="text-lg md:text-xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
            <Calendar className="w-4 h-4" /> Leave History ({requests.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Leave Type','From','To','Days','Status','Director Comments'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                : requests.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No leave requests yet</td></tr>
                  : requests.map(r => (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{(r.leave_type as any)?.name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{new Date(r.start_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{new Date(r.end_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">{r.total_days}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs flex items-center gap-1 w-fit ${STATUS_STYLES[r.status] || ''}`}>
                            {STATUS_ICON[r.status]}{STATUS_LABEL[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 max-w-xs whitespace-nowrap">
                          <p className="text-xs text-muted-foreground truncate">{r.review_comment || '—'}</p>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Apply Leave Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="leave_type_id" rules={{ required: 'Leave type is required' }} render={({ field }) => (
                <FormItem><FormLabel>Leave Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                    <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="start_date" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="end_date" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="reason" render={({ field }) => (
                <FormItem><FormLabel>Reason (optional)</FormLabel><FormControl><Textarea rows={3} placeholder="Reason for leave..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="p-3 bg-purple-500/10 rounded-md text-xs text-purple-400 flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This request will be sent directly to the Director for approval.
              </div>
              <div className="flex justify-end gap-2 pt-1">
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
