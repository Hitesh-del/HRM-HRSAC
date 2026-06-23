import { useEffect, useState, useCallback } from 'react';
import { Check, X, Search, MessageSquare, RefreshCw, Eye, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { notifyLeaveDecision, notifyLeaveForwardedToDirector } from '@/lib/notifications';

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
  pending: 'Pending',
  under_manager_review: 'Under Review',
  manager_approved: 'Mgr Approved',
  director_review: 'Director Review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

type LeaveRow = {
  id: string; status: string; start_date: string; end_date: string; total_days: number;
  reason?: string; review_comment?: string; manager_comment?: string;
  employee?: { id: string; full_name?: string; employee_id?: string; department_id?: string };
  leave_type?: { name?: string };
};

export default function MgmtLeaves() {
  const { profile } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<LeaveRow[]>([]);
  const [historyRequests, setHistoryRequests] = useState<LeaveRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [viewReq, setViewReq] = useState<LeaveRow | null>(null);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!profile?.department_id) { setLoading(false); return; }
    if (!silent) setLoading(true);

    const { data: members } = await supabase
      .from('profiles').select('id').eq('department_id', profile.department_id);
    const ids = (members || []).map(m => m.id);
    if (!ids.length) { setPendingRequests([]); setHistoryRequests([]); setLoading(false); return; }

    const select = 'id,status,start_date,end_date,total_days,reason,review_comment,manager_comment,employee:profiles!leave_requests_employee_id_fkey(id,full_name,employee_id),leave_type:leave_types(name)';

    const [{ data: pending }, { data: history }] = await Promise.all([
      supabase.from('leave_requests').select(select)
        .in('employee_id', ids).in('status', ['pending', 'under_manager_review'])
        .order('created_at', { ascending: false }),
      supabase.from('leave_requests').select(select)
        .in('employee_id', ids).not('status', 'in', '("pending","under_manager_review")')
        .order('created_at', { ascending: false }).limit(100),
    ]);

    setPendingRequests((pending || []) as unknown as LeaveRow[]);
    setHistoryRequests((history || []) as unknown as LeaveRow[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchRequests();
    if (!profile?.department_id) return;
    const channel = supabase.channel('mgmt-leaves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchRequests(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests, profile]);

  const handleDecision = async (id: string, approve: boolean) => {
    setProcessing(id);
    try {
      // Check company policy for leave approval
      const { data: settings } = await supabase
        .from('company_settings').select('leave_approval_policy').limit(1).maybeSingle();
      const policy = settings?.leave_approval_policy || 'director_required';

      const newStatus = approve
        ? (policy === 'manager_only' ? 'approved' : 'manager_approved')
        : 'rejected';

      const { error } = await supabase.from('leave_requests').update({
        status: newStatus,
        manager_id: profile?.id,
        manager_comment: comment.trim() || null,
        manager_reviewed_at: new Date().toISOString(),
      }).eq('id', id);

      if (error) { toast.error(error.message); return; }

      // Fire notifications
      const req = pendingRequests.find(r => r.id === id);
      const employeeId = req?.employee?.id;
      if (approve && newStatus === 'manager_approved') {
        // Forward to director
        const employeeName = req?.employee?.full_name || 'An employee';
        notifyLeaveForwardedToDirector(employeeName, id);
      } else if (employeeId) {
        // Final decision — notify applicant
        notifyLeaveDecision(employeeId, approve, id);
      }

      toast.success(approve
        ? policy === 'manager_only' ? 'Leave approved' : 'Forwarded to Director for final approval'
        : 'Leave rejected');
      setViewReq(null);
      setComment('');
      fetchRequests(true);
    } finally {
      setProcessing(null);
    }
  };

  const filteredPending = pendingRequests.filter(r =>
    (r.employee?.full_name || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredHistory = historyRequests.filter(r => {
    const matchSearch = (r.employee?.full_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = historyStatus === 'all' || r.status === historyStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Leave Management</h1>
          <p className="text-sm text-muted-foreground">Review and approve team leave requests</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchRequests(true)} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Pending Review', value: pendingRequests.length, color: 'text-yellow-400' },
          { label: 'Approved', value: historyRequests.filter(r => r.status === 'approved' || r.status === 'manager_approved').length, color: 'text-green-400' },
          { label: 'Rejected', value: historyRequests.filter(r => r.status === 'rejected').length, color: 'text-red-400' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className={`text-xl md:text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…" className="pl-9" />
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="pending" className="flex-1 md:flex-none whitespace-nowrap">
            Pending Review {pendingRequests.length > 0 && <span className="ml-1.5 bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full">{pendingRequests.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 md:flex-none whitespace-nowrap">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee', 'Type', 'Dates', 'Days', 'Reason', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : filteredPending.length === 0
                      ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No pending leave requests</td></tr>
                      : filteredPending.map(r => (
                          <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.leave_type?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.start_date} → {r.end_date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.total_days}d</td>
                            <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground text-xs whitespace-nowrap">{r.reason || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setViewReq(r); setComment(''); }}>
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                                  disabled={processing === r.id} onClick={() => { setViewReq(r); setComment(''); }}>
                                  <Check className="w-3 h-3" /> Review
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          <Select value={historyStatus} onValueChange={setHistoryStatus}>
            <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="manager_approved">Mgr Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Comment'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : filteredHistory.length === 0
                      ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No leave history found</td></tr>
                      : filteredHistory.map(r => (
                          <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.leave_type?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.start_date} → {r.end_date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.total_days}d</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status] || ''}`}>
                                {STATUS_LABEL[r.status] || r.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate whitespace-nowrap">{r.manager_comment || r.review_comment || '—'}</td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!viewReq} onOpenChange={open => { if (!open) { setViewReq(null); setComment(''); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Leave Request</DialogTitle>
          </DialogHeader>
          {viewReq && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  ['Employee', viewReq.employee?.full_name || '—'],
                  ['Leave Type', viewReq.leave_type?.name || '—'],
                  ['Start Date', viewReq.start_date],
                  ['End Date', viewReq.end_date],
                  ['Total Days', `${viewReq.total_days} day(s)`],
                  ['Reason', viewReq.reason || 'Not provided'],
                ].map(([k, v]) => (
                  <div key={k} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Comment (optional)
                </p>
                <Textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Add a comment for the employee…"
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => { setViewReq(null); setComment(''); }}>Cancel</Button>
                <Button variant="destructive" className="gap-1.5"
                  disabled={processing === viewReq.id}
                  onClick={() => handleDecision(viewReq.id, false)}>
                  <X className="w-3.5 h-3.5" /> Reject
                </Button>
                <Button className="gap-1.5 bg-green-600 hover:bg-green-700"
                  disabled={processing === viewReq.id}
                  onClick={() => handleDecision(viewReq.id, true)}>
                  <Check className="w-3.5 h-3.5" /> Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Leave Management Report"
        columns={[
          { header: 'Employee',   key: 'employee',    format: v => (v as any)?.full_name || '—' },
          { header: 'Leave Type', key: 'leave_type',  format: v => (v as any)?.name || '—' },
          { header: 'Start Date', key: 'start_date' },
          { header: 'End Date',   key: 'end_date' },
          { header: 'Days',       key: 'total_days',  format: v => String(v ?? '—') },
          { header: 'Status',     key: 'status',      format: v => String(v || '').replace(/_/g,' ') },
          { header: 'Reason',     key: 'reason' },
        ] satisfies ReportColumn[]}
        rows={[...pendingRequests, ...historyRequests] as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}

