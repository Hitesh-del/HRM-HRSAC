import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ClipboardList, History, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_STYLES: Record<string, string> = {
  planning:   'border-blue-500/30 text-blue-400 bg-blue-500/10',
  pending:    'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  active:     'border-green-500/30 text-green-400 bg-green-500/10',
  in_progress:'border-green-500/30 text-green-400 bg-green-500/10',
  on_hold:    'border-orange-500/30 text-orange-400 bg-orange-500/10',
  completed:  'border-primary/30 text-primary bg-primary/10',
  cancelled:  'border-red-500/30 text-red-400 bg-red-500/10',
};

const STATUS_OPTIONS = [
  { value: 'pending',     label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'completed',   label: 'Completed' },
  { value: 'cancelled',   label: 'Cancelled' },
];

interface StatusEntry { status: string; changed_by: string; changed_at: string; note?: string }
interface Project {
  id: string; title: string; status: string; progress: number;
  start_date?: string; end_date?: string; description?: string; priority?: string;
  cancelled_reason?: string; updated_by?: string; status_history?: StatusEntry[];
  updated_at?: string;
  updater?: { full_name?: string } | null;
}

export default function MgmtProjects() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [manualProgress, setManualProgress] = useState<number>(0);
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyProject, setHistoryProject] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('projects')
      .select('id,title,status,progress,start_date,end_date,description,priority,cancelled_reason,updated_by,status_history,updated_at,updater:profiles!projects_updated_by_fkey(full_name)')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false });
    if (error) console.error('fetchProjects:', error.message);
    setProjects((data || []) as unknown as Project[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchProjects();
    const ch = supabase.channel('mgmt-projects-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchProjects]);

  const openEdit = (p: Project) => {
    setEditProject(p);
    setNewStatus(p.status);
    setCancelReason(p.cancelled_reason || '');
    setManualProgress(p.progress || 0);
  };

  const saveStatus = async () => {
    if (!editProject || !newStatus) return;
    if (newStatus === 'cancelled' && !cancelReason.trim()) {
      toast.error('Cancellation reason is required');
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const prevHistory: StatusEntry[] = Array.isArray(editProject.status_history) ? editProject.status_history : [];
    const newEntry: StatusEntry = {
      status: newStatus,
      changed_by: profile?.full_name || profile?.id || 'Manager',
      changed_at: now,
      note: newStatus === 'cancelled' ? cancelReason.trim() : undefined,
    };

    // Auto-calculate progress based on status
    let newProgress = editProject.progress;
    if (newStatus === 'pending' || newStatus === 'planning') {
      newProgress = 0;
    } else if (newStatus === 'in_progress' || newStatus === 'active') {
      // Use manual progress if set, otherwise bump to at least 25%
      newProgress = manualProgress > 0 ? manualProgress : Math.max(editProject.progress || 0, 25);
    } else if (newStatus === 'completed') {
      newProgress = 100;
    } else if (newStatus === 'cancelled') {
      newProgress = 0;
    } else if (newStatus === 'on_hold') {
      newProgress = manualProgress > 0 ? manualProgress : editProject.progress;
    }

    const { error } = await supabase.from('projects').update({
      status: newStatus,
      progress: newProgress,
      cancelled_reason: newStatus === 'cancelled' ? cancelReason.trim() : null,
      updated_by: profile?.id,
      updated_at: now,
      status_history: [...prevHistory, newEntry],
    }).eq('id', editProject.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(`Project status updated to "${STATUS_OPTIONS.find(s => s.value === newStatus)?.label || newStatus}"`);
    setSaving(false);
    setEditProject(null);
    fetchProjects();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Project Management</h1>
          <p className="text-sm text-muted-foreground">Manage and update department project statuses</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchProjects} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No projects assigned to your department</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(p => (
            <Card key={p.id} className="h-full flex flex-col">
              <CardContent className="p-4 flex flex-col flex-1 min-w-0">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-2 gap-2">
                  <h3 className="font-semibold text-foreground flex-1 min-w-0 text-balance">{p.title}</h3>
                  <Badge variant="outline" className={`shrink-0 text-xs capitalize ${STATUS_STYLES[p.status] || ''}`}>
                    {p.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3 flex-1 min-w-0 line-clamp-2 text-pretty">{p.description || 'No description'}</p>

                {p.cancelled_reason && (
                  <p className="text-xs text-red-400 mb-2 bg-red-500/5 px-2 py-1 rounded border border-red-500/20 line-clamp-2">
                    Cancelled: {p.cancelled_reason}
                  </p>
                )}

                <div className="mt-auto space-y-2">
                  <div>
                    <div className="flex justify-between flex-wrap gap-2 text-xs mb-1">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{p.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  {p.updater && (
                    <p className="text-xs text-muted-foreground">
                      Last updated by <span className="text-foreground">{(p.updater as any)?.full_name}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="secondary" className="flex-1 min-w-0 h-8 text-xs" onClick={() => openEdit(p)}>
                      Update Status
                    </Button>
                    {Array.isArray(p.status_history) && p.status_history.length > 0 && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Status History" onClick={() => setHistoryProject(p)}>
                        <History className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Update Status Dialog ─── */}
      <Dialog open={!!editProject} onOpenChange={o => !o && setEditProject(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-balance">{editProject?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">New Status</p>
              <Select value={newStatus} onValueChange={v => {
                setNewStatus(v);
                if (v === 'pending' || v === 'planning') setManualProgress(0);
                else if (v === 'completed') setManualProgress(100);
                else if (v === 'cancelled') setManualProgress(0);
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Progress slider for in_progress / on_hold */}
            {['in_progress', 'active', 'on_hold'].includes(newStatus) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-sm font-medium text-foreground">Progress</p>
                  <span className="text-sm font-bold text-primary">{manualProgress}%</span>
                </div>
                <input
                  type="range" min={1} max={99} step={1}
                  value={manualProgress}
                  onChange={e => setManualProgress(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${manualProgress}%` }} />
                </div>
              </div>
            )}

            {newStatus === 'cancelled' && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  Cancellation Reason <span className="text-red-400">*</span>
                </p>
                <Textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Provide a reason for cancellation…"
                  rows={3}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={() => setEditProject(null)}>Cancel</Button>
              <Button size="sm" onClick={saveStatus} disabled={saving || (newStatus === 'cancelled' && !cancelReason.trim())}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Save Status
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Status History Dialog ─── */}
      <Dialog open={!!historyProject} onOpenChange={o => !o && setHistoryProject(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center flex-wrap gap-2">
              <History className="w-4 h-4" /> Status History — {historyProject?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(historyProject?.status_history || []).slice().reverse().map((entry: StatusEntry, i: number) => (
              <div key={i} className="flex flex-wrap gap-3 items-start py-2 border-b border-border/50 last:border-0">
                <Badge variant="outline" className={`shrink-0 text-xs capitalize mt-0.5 ${STATUS_STYLES[entry.status] || ''}`}>
                  {entry.status.replace(/_/g, ' ')}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    By <span className="text-foreground font-medium">{entry.changed_by}</span>
                    {' · '}{new Date(entry.changed_at).toLocaleString()}
                  </p>
                  {entry.note && <p className="text-xs text-red-400 mt-0.5">{entry.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Project Management Report"
        columns={[
          { header: 'Project Name', key: 'title' },
          { header: 'Department',   key: 'department', format: v => (v as any)?.name || '—' },
          { header: 'Manager',      key: 'manager',    format: v => (v as any)?.full_name || '—' },
          { header: 'Priority',     key: 'priority' },
          { header: 'Status',       key: 'status',     format: v => String(v||'').replace(/_/g,' ') },
          { header: 'Start Date',   key: 'start_date' },
          { header: 'End Date',     key: 'end_date' },
          { header: 'Progress',     key: 'progress',   format: v => `${v ?? 0}%` },
        ] satisfies ReportColumn[]}
        rows={projects as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
