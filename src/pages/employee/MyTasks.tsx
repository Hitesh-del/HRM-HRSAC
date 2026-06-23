import { useEffect, useState, useCallback } from 'react';
import { CheckSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_STYLES: Record<string, string> = { todo: 'border-muted-foreground/30 text-muted-foreground', in_progress: 'border-blue-500/30 text-blue-400 bg-blue-500/10', completed: 'border-green-500/30 text-green-400 bg-green-500/10', cancelled: 'border-red-500/30 text-red-400 bg-red-500/10' };
const PRIORITY_STYLES: Record<string, string> = { low: 'border-muted-foreground/30 text-muted-foreground', medium: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10', high: 'border-orange-500/30 text-orange-400 bg-orange-500/10', urgent: 'border-red-500/30 text-red-400 bg-red-500/10' };

export default function MyTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<{ id: string; title: string; description?: string; status: string; priority: string; due_date?: string; assigner?: { full_name?: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchTasks = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let q = supabase.from('tasks').select('id,title,description,status,priority,due_date,assigner:profiles!assigned_by(full_name)').eq('assigned_to', profile.id).order('created_at', { ascending: false });
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data } = await q;
    setTasks((data||[]) as any);
    setLoading(false);
  }, [profile, statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('tasks').update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('id', id);
    toast.success('Task updated');
    fetchTasks();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">My Tasks</h1><p className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned to you</p></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="todo">Todo</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select>
      </div>
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}</div>
        : tasks.length === 0 ? <div className="text-center py-12 text-muted-foreground">No tasks assigned</div>
          : (
            <div className="space-y-3">
              {tasks.map(t => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><CheckSquare className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between flex-wrap gap-3 flex-wrap">
                          <h3 className="font-semibold text-foreground">{t.title}</h3>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <Badge variant="outline" className={`text-xs ${PRIORITY_STYLES[t.priority] || ''}`}>{t.priority}</Badge>
                            <Badge variant="outline" className={`text-xs ${STATUS_STYLES[t.status] || ''}`}>{t.status.replace('_', ' ')}</Badge>
                          </div>
                        </div>
                        {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                        <div className="flex items-center gap-3 flex-wrap mt-2 flex-wrap">
                          {t.due_date && <span className="text-xs text-muted-foreground">Due: {new Date(t.due_date).toLocaleDateString()}</span>}
                          {t.assigner?.full_name && <span className="text-xs text-muted-foreground">From: {t.assigner.full_name}</span>}
                          {t.status !== 'completed' && t.status !== 'cancelled' && (
                            <Select value={t.status} onValueChange={v => updateStatus(t.id, v)}>
                              <SelectTrigger className="h-6 w-full md:w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{['todo', 'in_progress', 'completed'].map(s => <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
    </div>
  );
}
