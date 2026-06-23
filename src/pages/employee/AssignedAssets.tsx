import { useEffect, useState, useCallback } from 'react';
import { Package, Search, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_STYLES: Record<string, string> = {
  assigned: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  available: 'border-green-500/30 text-green-400 bg-green-500/10',
  maintenance: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  retired: 'border-muted-foreground/30 text-muted-foreground',
};

interface AssetRow {
  id: string; name: string; asset_code: string; category: string;
  status: string; assigned_at: string | null; notes: string | null;
}

export default function AssignedAssets() {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAssets = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('assets')
      .select('id,name,asset_code,category,status,assigned_at,notes')
      .eq('assigned_to', profile.id)
      .order('assigned_at', { ascending: false });
    setAssets((data || []) as AssetRow[]);
    if (!silent) setLoading(false);
  }, [profile]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('emp-assets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `assigned_to=eq.${profile.id}` },
        () => fetchAssets(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAssets, profile]);

  const filtered = assets.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_code.toLowerCase().includes(search.toLowerCase()) ||
    a.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Assigned Assets</h1>
          <p className="text-sm text-muted-foreground">{assets.length} asset{assets.length !== 1 ? 's' : ''} currently assigned to you</p>
        </div>
        <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchAssets()} title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Asset ID', 'Asset Name', 'Category', 'Serial Number', 'Assigned Date', 'Asset Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}
                    </tr>
                  ))
                  : filtered.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p>No assets currently assigned to you</p>
                      </td></tr>
                    : filtered.map(a => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">{a.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center flex-wrap gap-2">
                            <Package className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-medium text-foreground">{a.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground capitalize">{a.category}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted-foreground">{a.asset_code}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${STATUS_STYLES[a.status] || ''}`}>{a.status}</Badge>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
