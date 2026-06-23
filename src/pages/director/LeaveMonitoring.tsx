import { useEffect, useState, useCallback } from 'react';
import { Check, X, Search, RefreshCw, Eye, Settings, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Department } from '@/types/types';
import { notifyLeaveDecision } from '@/lib/notifications';

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
  under_manager_review: 'Under Mgr Review',
  manager_approved: 'Mgr Approved',
  director_review: 'Director Review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

type LeaveRow = {
  id: string; status: string; start_date: string; end_date: string; total_days: number;
  reason?: string; review_comment?: string; manager_comment?: string;
  employee?: { id: string; full_name?: string; employee_id?: string; department?: { id: string; name: string } | null } | null;
  leave_type?: { id: string; name?: string } | null;
  reviewer?: { id: string; full_name?: string } | null;
};

const PAGE_SIZE = 12;

export default function LeaveMonitoring() {
  const { profile } = useAuth();
  const [awaitingApproval, setAwaitingApproval] = useState<LeaveRow[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewReq, setViewReq] = useState<LeaveRow | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string>('director_required');
  const [savingPolicy, setSavingPolicy] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const select = 'id,status,start_date,end_date,total_days,reason,review_comment,manager_comment,employee:profiles!leave_requests_employee_id_fkey(id,full_name,employee_id,department:departments!profiles_department_id_fkey(id,name)),leave_type:leave_types(id,name)';

    // Awaiting director approval — includes manager_approved (employee leaves) and director_review (manager's own leaves)
    const { data: awaiting } = await supabase
      .from('leave_requests').select(select)
      .in('status', ['manager_approved', 'director_review'])
      .order('created_at', { ascending: false });

    // All requests with filters
    let q = supabase.from('leave_requests').select(select, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data: all, count } = await q;

    setAwaitingApproval((awaiting || []) as unknown as LeaveRow[]);
    setAllRequests((all || []) as unknown as LeaveRow[]);
    setTotal(count || 0);

    // Load policy
    const { data: settings } = await supabase.from('company_settings').select('leave_approval_policy').limit(1).maybeSingle();
    if (settings?.leave_approval_policy) setPolicy(settings.leave_approval_policy);

    if (!silent) setLoading(false); else setRefreshing(false);
  }, [statusFilter, page]);

  useEffect(() => {
    fetchAll();
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
  }, [fetchAll]);

  useEffect(() => {
    const channel = supabase.channel('director-leaves')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchAll(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const handleDecision = async (id: string, approve: boolean) => {
    setProcessing(id);
    const { error } = await supabase.from('leave_requests').update({
      status: approve ? 'approved' : 'rejected',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { toast.error(error.message); setProcessing(null); return; }
    // Notify applicant of final decision
    const req = [...awaitingApproval].find(r => r.id === id);
    const employeeId = req?.employee?.id;
    if (employeeId) notifyLeaveDecision(employeeId, approve, id);
    toast.success(approve ? 'Leave approved' : 'Leave rejected');
    setProcessing(null);
    setViewReq(null);
    fetchAll(true);
  };

  const savePolicy = async (newPolicy: string) => {
    setSavingPolicy(true);
    const { data: settings } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
    if (settings?.id) {
      await supabase.from('company_settings').update({ leave_approval_policy: newPolicy }).eq('id', settings.id);
    }
    setPolicy(newPolicy);
    setSavingPolicy(false);
    toast.success('Leave approval policy updated');
  };

  const filteredAll = allRequests.filter(r => {
    const name = (r.employee?.full_name || '').toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !search || name.includes(q);
    const matchDept = deptFilter === 'all' || r.employee?.department?.id === deptFilter;
    return matchSearch && matchDept;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Leave Monitoring</h1>
          <p className="text-sm text-muted-foreground">Manage and approve leave requests company-wide</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-3.5 h-3.5 mr-1.5"/>Export</Button>
          <Button variant="ghost" size="sm" onClick={() => fetchAll(true)} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Policy configuration */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Leave Approval Policy:</span>
          <Select value={policy} onValueChange={savePolicy} disabled={savingPolicy}>
            <SelectTrigger className="w-full md:w-56 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="director_required">Manager → Director Approval</SelectItem>
              <SelectItem value="manager_only">Manager Approval Only</SelectItem>
            </SelectContent>
          </Select>
          {savingPolicy && <span className="text-xs text-muted-foreground">Saving…</span>}
        </CardContent>
      </Card>

      <Tabs defaultValue="awaiting">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="awaiting" className="flex-1 md:flex-none whitespace-nowrap">
            Awaiting Approval
            {awaitingApproval.length > 0 && (
              <span className="ml-1.5 bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded-full">{awaitingApproval.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex-1 md:flex-none whitespace-nowrap">All Requests</TabsTrigger>
        </TabsList>

        {/* Awaiting Director Approval */}
        <TabsContent value="awaiting" className="mt-4">
          {policy === 'manager_only' ? (
            <Card><CardContent className="p-4 md:p-6 text-center text-muted-foreground text-sm">
              Policy is set to "Manager Approval Only". No director review required.
            </CardContent></Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Employee', 'Dept', 'Type', 'Dates', 'Days', 'Mgr Comment', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                      : awaitingApproval.length === 0
                        ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No leave requests awaiting director approval</td></tr>
                        : awaitingApproval.map(r => (
                            <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.employee?.department?.name || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{r.leave_type?.name || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.start_date} → {r.end_date}</td>
                              <td className="px-4 py-3 whitespace-nowrap">{r.total_days}d</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate whitespace-nowrap">{r.manager_comment || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewReq(r)}><Eye className="w-3.5 h-3.5" /></Button>
                                  <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs gap-1"
                                    disabled={processing === r.id} onClick={() => handleDecision(r.id, true)}>
                                    <Check className="w-3 h-3" /> Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs gap-1"
                                    disabled={processing === r.id} onClick={() => handleDecision(r.id, false)}>
                                    <X className="w-3 h-3" /> Reject
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
          )}
        </TabsContent>

        {/* All Requests */}
        <TabsContent value="all" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search employee…" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="manager_approved">Mgr Approved</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
              <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee', 'Dept', 'Type', 'Dates', 'Days', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : filteredAll.length === 0
                      ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No leave requests found</td></tr>
                      : filteredAll.map(r => (
                          <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.employee?.department?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.leave_type?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.start_date} → {r.end_date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.total_days}d</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status] || ''}`}>
                                {STATUS_LABEL[r.status] || r.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewReq(r)}><Eye className="w-3.5 h-3.5" /></Button>
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center flex-wrap gap-2 justify-end">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* View Dialog */}
      <Dialog open={!!viewReq} onOpenChange={open => { if (!open) setViewReq(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Leave Request Details</DialogTitle></DialogHeader>
          {viewReq && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['Employee', viewReq.employee?.full_name || '—'],
                  ['Department', viewReq.employee?.department?.name || '—'],
                  ['Leave Type', viewReq.leave_type?.name || '—'],
                  ['Status', STATUS_LABEL[viewReq.status] || viewReq.status],
                  ['Start Date', viewReq.start_date],
                  ['End Date', viewReq.end_date],
                  ['Total Days', `${viewReq.total_days} day(s)`],
                  ['Reason', viewReq.reason || 'Not provided'],
                  ['Manager Comment', viewReq.manager_comment || '—'],
                  ['Director Comment', viewReq.review_comment || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-medium text-foreground">{v}</p>
                  </div>
                ))}
              </div>
              {(['manager_approved', 'director_review'].includes(viewReq.status)) && (
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <Button variant="destructive" size="sm" className="gap-1.5"
                    disabled={processing === viewReq.id} onClick={() => handleDecision(viewReq.id, false)}>
                    <X className="w-3.5 h-3.5" /> Reject
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                    disabled={processing === viewReq.id} onClick={() => handleDecision(viewReq.id, true)}>
                    <Check className="w-3.5 h-3.5" /> Approve
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Leave Monitoring Report"
        columns={[
          { header: 'Employee',     key: 'employee',    format: v => (v as any)?.full_name || '—' },
          { header: 'Department',   key: 'employee',    format: v => (v as any)?.department?.name || '—' },
          { header: 'Leave Type',   key: 'leave_type',  format: v => (v as any)?.name || '—' },
          { header: 'Start Date',   key: 'start_date' },
          { header: 'End Date',     key: 'end_date' },
          { header: 'Days',         key: 'total_days',  format: v => String(v ?? '—') },
          { header: 'Status',       key: 'status',      format: v => String(v || '').replace(/_/g,' ') },
          { header: 'Reason',       key: 'reason' },
        ]}
        rows={allRequests as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}

