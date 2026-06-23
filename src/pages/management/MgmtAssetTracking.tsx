import { useEffect, useState, useCallback } from 'react';
import { Package, Search, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface AssetRow {
  id: string; name: string; asset_code: string; category: string;
  status: string; assigned_at: string | null; notes: string | null;
  assignee?: { id: string; full_name: string; department_id: string | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  assigned: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  available: 'border-green-500/30 text-green-400 bg-green-500/10',
  maintenance: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  retired: 'border-muted-foreground/30 text-muted-foreground bg-muted/10',
};

export default function MgmtAssetTracking() {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchAssets = useCallback(async (silent = false) => {
    if (!profile?.department_id) { setLoading(false); return; }
    if (!silent) setLoading(true);

    // Get all employee IDs in this department
    const { data: members } = await supabase
      .from('profiles')
      .select('id')
      .eq('department_id', profile.department_id)
      .in('role', ['employee', 'management']);

    const memberIds = (members || []).map(m => m.id);
    if (!memberIds.length) { setAssets([]); if (!silent) setLoading(false); return; }

    let q = supabase
      .from('assets')
      .select('id,name,asset_code,category,status,assigned_at,notes,assignee:profiles!assets_assigned_to_fkey(id,full_name,department_id)')
      .in('assigned_to', memberIds)
      .order('assigned_at', { ascending: false });

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data } = await q;
    setAssets((data || []) as unknown as AssetRow[]);
    if (!silent) setLoading(false);
  }, [profile?.department_id, statusFilter]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  useEffect(() => {
    if (!profile?.department_id) return;
    const ch = supabase.channel('mgmt-assets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => fetchAssets(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAssets, profile?.department_id]);

  const filtered = assets.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.asset_code.toLowerCase().includes(search.toLowerCase()) ||
    (a.assignee?.full_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Asset Tracking</h1>
          <p className="text-sm text-muted-foreground">Assets assigned to your department employees</p>
        </div>
        <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchAssets()} title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-0 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search assets or employee..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-sm w-full md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Asset ID', 'Asset Name', 'Category', 'Serial Number', 'Assigned To', 'Assigned Date', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}
                    </tr>
                  ))
                  : filtered.length === 0
                    ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        {!profile?.department_id ? 'No department assigned to your account.' : 'No assets assigned to employees in your department.'}
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
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{a.assignee?.full_name || '—'}</td>
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
