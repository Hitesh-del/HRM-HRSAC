import { useEffect, useState, useCallback } from 'react';
import { GraduationCap, Search, RefreshCw, Calendar, Award, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

export default function MgmtTraining() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState<TrainingRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
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
    const ch = supabase.channel('mgmt-training-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_programs' }, () => fetchPrograms(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPrograms, profile?.department_id]);

  const filtered = programs.filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Training Programs</h1>
          <p className="text-sm text-muted-foreground">Training assigned to your department</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchPrograms()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search training..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Total', value: programs.length, color: 'text-foreground' },
            { label: 'Upcoming', value: programs.filter(p => !p.start_date || new Date(p.start_date) > new Date()).length, color: 'text-blue-400' },
            { label: 'Completed', value: programs.filter(p => !!p.end_date && new Date(p.end_date) < new Date()).length, color: 'text-green-400' },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Training Name', 'Description', 'Training Date', 'Department', 'Status', 'Certificate'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}
                    </tr>
                  ))
                  : filtered.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        {!profile?.department_id ? 'No department assigned.' : 'No training programs for your department.'}
                      </td></tr>
                    : filtered.map(p => {
                      const now = new Date();
                      const start = p.start_date ? new Date(p.start_date) : null;
                      const end = p.end_date ? new Date(p.end_date) : null;
                      const sk = end && end < now ? 'completed' : start && start <= now ? 'ongoing' : 'upcoming';
                      return (
                        <tr key={p.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center flex-wrap gap-2">
                              <GraduationCap className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-medium text-foreground">{p.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-[180px] whitespace-nowrap"><p className="truncate text-xs text-muted-foreground">{p.description || '—'}</p></td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {p.start_date ? new Date(p.start_date).toLocaleDateString() : '—'}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{p.department?.name || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge variant="outline" className={`text-xs ${STATUS_STYLES[sk] || ''}`}>{sk}</Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {sk === 'completed'
                              ? <span className="flex items-center gap-1 text-xs text-yellow-400"><Award className="w-3 h-3" />Eligible</span>
                              : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Training Programs Report"
        columns={[
          { header: 'Program',    key: 'title' },
          { header: 'Status',     key: 'status' },
          { header: 'Start Date', key: 'start_date' },
          { header: 'End Date',   key: 'end_date' },
          { header: 'Capacity',   key: 'max_participants', format: v => String(v ?? '—') },
        ] satisfies ReportColumn[]}
        rows={programs as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
