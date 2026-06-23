import { useEffect, useState, useCallback } from 'react';
import { GraduationCap, Search, RefreshCw, Calendar, Award, BookOpen, FileDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';

interface TrainingRow {
  id: string; title: string; description: string | null;
  start_date: string | null; end_date: string | null;
  mode: string; trainer: string | null; duration_hours: number | null;
  department?: { name: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  upcoming: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  ongoing: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  completed: 'border-green-500/30 text-green-400 bg-green-500/10',
};

export default function MyTraining() {
  const { profile, companySettings } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [programs, setPrograms] = useState<TrainingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchPrograms = useCallback(async (silent = false) => {
    if (!profile?.department_id) { setLoading(false); return; }
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('training_programs')
      .select('id,title,description,start_date,end_date,mode,trainer,duration_hours,department:departments(name)')
      .eq('department_id', profile.department_id)
      .order('created_at', { ascending: false });
    setPrograms((data || []) as unknown as TrainingRow[]);
    if (!silent) setLoading(false);
  }, [profile?.department_id]);

  useEffect(() => { fetchPrograms(); }, [fetchPrograms]);

  useEffect(() => {
    if (!profile?.department_id) return;
    const ch = supabase.channel('emp-training-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_programs' }, () => fetchPrograms(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPrograms, profile?.department_id]);

  const filtered = programs.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()));

  const getStatus = (p: TrainingRow) => {
    const now = new Date();
    const start = p.start_date ? new Date(p.start_date) : null;
    const end = p.end_date ? new Date(p.end_date) : null;
    return end && end < now ? 'completed' : start && start <= now ? 'ongoing' : 'upcoming';
  };

  const completed = programs.filter(p => getStatus(p) === 'completed').length;
  const upcoming = programs.filter(p => getStatus(p) === 'upcoming').length;

  const trainCols: ReportColumn[] = [
    { header: 'Title',       key: 'title' },
    { header: 'Trainer',     key: 'trainer',         format: v => String(v ?? '—') },
    { header: 'Mode',        key: 'mode' },
    { header: 'Duration(h)', key: 'duration_hours',  format: v => String(v ?? '—') },
    { header: 'Start Date',  key: 'start_date',      format: v => String(v ?? '—') },
    { header: 'End Date',    key: 'end_date',         format: v => String(v ?? '—') },
    { header: 'Department',  key: 'department',       format: v => (v as any)?.name ?? '—' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">My Training</h1>
          <p className="text-sm text-muted-foreground">Training programs assigned to your department</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5"><FileDown className="w-3.5 h-3.5" /> Export</Button>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchPrograms()}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Total', value: programs.length, color: 'text-foreground' },
            { label: 'Upcoming', value: upcoming, color: 'text-blue-400' },
            { label: 'Completed', value: completed, color: 'text-green-400' },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search training..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading
        ? <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-20" /></CardContent></Card>)}</div>
        : filtered.length === 0
          ? <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>{!profile?.department_id ? 'No department assigned to your account.' : 'No training programs available for your department.'}</p>
            </div>
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(p => {
                const sk = getStatus(p);
                return (
                  <Card key={p.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          {sk === 'completed' ? <Award className="w-4 h-4 text-yellow-400" /> : <BookOpen className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between flex-wrap gap-3">
                            <h3 className="font-semibold text-foreground text-balance line-clamp-2">{p.title}</h3>
                            <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_STYLES[sk] || ''}`}>{sk}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {p.trainer && <span className="text-xs text-muted-foreground">by {p.trainer}</span>}
                            {p.duration_hours && <span className="text-xs text-muted-foreground">{p.duration_hours}h</span>}
                            {p.mode && <span className="text-xs text-muted-foreground capitalize">{p.mode}</span>}
                          </div>
                        </div>
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground text-pretty line-clamp-2 mb-2">{p.description}</p>}
                      <div className="flex items-center justify-between flex-wrap gap-3 text-xs text-muted-foreground border-t border-border pt-2 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {p.start_date ? new Date(p.start_date).toLocaleDateString() : 'TBD'}
                        </span>
                        <span>{p.department?.name || '—'}</span>
                        {sk === 'completed' && (
                          <span className="flex items-center gap-1 text-yellow-400"><Award className="w-3 h-3" />Certificate Eligible</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="My Training Records"
        columns={trainCols}
        rows={programs as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
