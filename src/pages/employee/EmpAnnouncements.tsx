import { useEffect, useState } from 'react';
import { Megaphone, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const PRIORITY_STYLES: Record<string, string> = { low: 'border-muted-foreground/30 text-muted-foreground', normal: 'border-blue-500/30 text-blue-400 bg-blue-500/10', high: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10', urgent: 'border-red-500/30 text-red-400 bg-red-500/10' };

export default function EmpAnnouncements() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; priority: string; is_global: boolean; created_at: string; poster?: { full_name?: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    const deptFilter = profile?.department_id ? `is_global.eq.true,department_id.eq.${profile.department_id}` : 'is_global.eq.true';
    supabase.from('announcements').select('id,title,content,priority,is_global,created_at,poster:profiles(full_name)').or(deptFilter).order('created_at', { ascending: false }).then(({ data }) => { setAnnouncements((data||[]) as any); setLoading(false); });
  }, [profile]);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Announcements</h1><p className="text-sm text-muted-foreground">Company and department updates</p></div>
      {loading ? Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)
        : announcements.length === 0 ? <div className="text-center py-12 text-muted-foreground">No announcements</div>
          : announcements.map(a => (
            <Card key={a.id} className={`transition-all ${read.has(a.id) ? 'opacity-70' : ''}`} onClick={() => setRead(s => new Set([...s, a.id]))}>
              <CardContent className="p-4 cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 mt-0.5 ${read.has(a.id) ? 'bg-muted' : 'bg-primary/10'}`}>
                    {read.has(a.id) ? <Check className="w-4 h-4 text-muted-foreground" /> : <Megaphone className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                      <Badge variant="outline" className={`text-xs ${PRIORITY_STYLES[a.priority] || ''}`}>{a.priority}</Badge>
                      {a.is_global && <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">All Staff</Badge>}
                      {!read.has(a.id) && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.poster?.full_name} · {new Date(a.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
    </div>
  );
}
