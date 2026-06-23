import { useEffect, useState, useCallback } from 'react';
import { FolderKanban, Calendar, Users, Flag, Building2, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_STYLES: Record<string, string> = {
  planning:    'border-blue-500/30 text-blue-400 bg-blue-500/10',
  pending:     'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  active:      'border-green-500/30 text-green-400 bg-green-500/10',
  in_progress: 'border-green-500/30 text-green-400 bg-green-500/10',
  on_hold:     'border-orange-500/30 text-orange-400 bg-orange-500/10',
  completed:   'border-primary/30 text-primary bg-primary/10',
  cancelled:   'border-red-500/30 text-red-400 bg-red-500/10',
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-yellow-500/30 text-yellow-400',
  high:   'border-red-500/30 text-red-400',
  critical:'border-red-500/30 text-red-400 bg-red-500/10',
};

interface TeamMember { id: string; full_name?: string; employee_id?: string }
interface Project {
  id: string; title: string; status: string; progress: number;
  description?: string; start_date?: string; end_date?: string; priority?: string;
  department?: { name: string } | null;
  creator?: { full_name?: string } | null;
  members: { employee: TeamMember | null }[];
  joined_at?: string;
}

export default function MyProjects() {
  const { profile } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('project_members')
      .select(`
        joined_at,
        project:projects(
          id, title, status, progress, description, start_date, end_date, priority,
          department:departments!projects_department_id_fkey(name),
          creator:profiles!projects_created_by_fkey(full_name),
          members:project_members(employee:profiles!project_members_employee_id_fkey(id,full_name,employee_id))
        )
      `)
      .eq('employee_id', profile.id)
      .order('joined_at', { ascending: false });

    const ps = (data || []).map((d: any) => {
      const proj = Array.isArray(d.project) ? d.project[0] : d.project;
      if (!proj) return null;
      return { ...proj, joined_at: d.joined_at, members: Array.isArray(proj.members) ? proj.members : [] };
    }).filter(Boolean) as Project[];

    setProjects(ps);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchProjects();
    if (!profile) return;
    const ch = supabase.channel(`my-projects-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members',
        filter: `employee_id=eq.${profile.id}` }, () => fetchProjects())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchProjects, profile]);

  const projCols: ReportColumn[] = [
    { header: 'Title',       key: 'title' },
    { header: 'Status',      key: 'status' },
    { header: 'Priority',    key: 'priority', format: v => String(v ?? '—') },
    { header: 'Progress',    key: 'progress', format: v => `${v ?? 0}%` },
    { header: 'Start Date',  key: 'start_date', format: v => v ? String(v) : '—' },
    { header: 'End Date',    key: 'end_date',   format: v => v ? String(v) : '—' },
    { header: 'Description', key: 'description', format: v => String(v ?? '') },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
        <div>
        <h1 className="text-xl font-bold text-foreground text-balance">My Projects</h1>
        <p className="text-sm text-muted-foreground">Projects you're assigned to as a team member</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0"><FileDown className="w-3.5 h-3.5" /> Export</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-40 bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects assigned</p>
          <p className="text-sm mt-1">Projects assigned to you by a manager will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(p => (
            <Card key={p.id} className="h-full flex flex-col">
              <CardContent className="p-4 flex flex-col flex-1 min-w-0">
                {/* Title + status */}
                <div className="flex items-start gap-2 mb-2">
                  <FolderKanban className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-balance">{p.title}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="outline" className={`text-xs capitalize ${STATUS_STYLES[p.status] || ''}`}>
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                      {p.priority && (
                        <Badge variant="outline" className={`text-xs capitalize ${PRIORITY_STYLES[p.priority] || ''}`}>
                          <Flag className="w-2.5 h-2.5 mr-0.5" />{p.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground mb-3 flex-1 min-w-0 line-clamp-2 text-pretty">
                  {p.description || 'No description'}
                </p>

                {/* Meta info */}
                <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                  {p.department && (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>{(p.department as any)?.name}</span>
                    </div>
                  )}
                  {(p.start_date || p.end_date) && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>
                        {p.start_date ? new Date(p.start_date).toLocaleDateString() : '—'}
                        {p.end_date && ` → ${new Date(p.end_date).toLocaleDateString()}`}
                      </span>
                    </div>
                  )}
                  {p.creator && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 shrink-0" />
                      <span>Assigned by <span className="text-foreground">{(p.creator as any)?.full_name}</span></span>
                    </div>
                  )}
                  {p.joined_at && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>Joined {new Date(p.joined_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* Team members */}
                {p.members && p.members.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Team Members ({p.members.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {p.members.slice(0, 5).map((m, i) => (
                        <Badge key={(m.employee as any)?.id || i} variant="secondary" className="text-xs">
                          {(m.employee as any)?.full_name || 'Unknown'}
                        </Badge>
                      ))}
                      {p.members.length > 5 && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          +{p.members.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                <div className="mt-auto">
                  <div className="flex justify-between flex-wrap gap-2 text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">{p.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="My Projects"
        columns={projCols}
        rows={projects as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
