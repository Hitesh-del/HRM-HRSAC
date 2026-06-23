import { useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import type { ActivityLog } from '@/types/types';

export default function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const fetchLogs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('activity_logs')
      .select('*, actor:profiles(id,full_name)')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page]);

  type LogExtended = ActivityLog & { actor?:{full_name?:string} };
  const filtered = (logs as LogExtended[]).filter(l => (l.description||l.action).toLowerCase().includes(search.toLowerCase()) || (l.actor?.full_name||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Activity Logs</h1><p className="text-sm text-muted-foreground">System-wide audit trail</p></div>
        <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="w-4 h-4 mr-1.5"/>Refresh</Button>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search logs..." className="pl-9"/></div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">{['Time','User','Action','Entity','Description'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading?Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:5}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20"/></td>)}</tr>)
              :filtered.length===0?<tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No activity logs found</td></tr>
              :filtered.map(l=>(
                <tr key={l.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{l.actor?.full_name||'System'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{l.action}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{l.entity_type||'—'}</td>
                  <td className="px-4 py-3 max-w-xs whitespace-nowrap"><p className="truncate text-xs text-muted-foreground">{l.description||'—'}</p></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button>
            <Button variant="outline" size="sm" onClick={()=>setPage(p=>p+1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
