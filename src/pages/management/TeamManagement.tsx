import { useEffect, useState } from 'react';
import { Search, UserSquare, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/types';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';

export default function TeamManagement() {
  const { profile } = useAuth();
  const [team, setTeam] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!profile?.department_id) { setLoading(false); return; }
    supabase.from('profiles').select('*').eq('department_id', profile.department_id).in('role',['employee','management']).eq('is_active',true).order('full_name').then(({data})=>{setTeam(data||[]); setLoading(false);});
  }, [profile]);

  const filtered = team.filter(m => m.full_name.toLowerCase().includes(search.toLowerCase()) || (m.designation||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Team Management</h1><p className="text-sm text-muted-foreground">{team.length} team members</p></div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0">
          <FileDown className="w-3.5 h-3.5" /> Export
        </Button>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search team..." className="pl-9"/></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading?Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-20"/></CardContent></Card>)
        :filtered.length===0?<div className="col-span-full text-center py-12 text-muted-foreground">No team members</div>
        :filtered.map(m=>(
          <Card key={m.id}><CardContent className="p-4 flex items-center flex-wrap gap-3">
            <Avatar className="w-10 h-10"><AvatarFallback className="bg-primary/10 text-primary">{m.full_name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{m.full_name}</p>
              <p className="text-xs text-muted-foreground">{m.designation||'—'}</p>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                <Badge variant="outline" className="text-xs border-border text-muted-foreground capitalize">{m.role}</Badge>
                {m.employee_id&&<span className="text-xs text-muted-foreground">{m.employee_id}</span>}
              </div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Team Management Report"
        columns={[
          { header: 'Employee ID',  key: 'employee_id' },
          { header: 'Name',         key: 'full_name' },
          { header: 'Email',        key: 'email' },
          { header: 'Mobile',       key: 'phone' },
          { header: 'Designation',  key: 'designation' },
          { header: 'Role',         key: 'role' },
          { header: 'Status',       key: 'is_active', format: v => v ? 'Active' : 'Inactive' },
        ]}
        rows={team as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}
