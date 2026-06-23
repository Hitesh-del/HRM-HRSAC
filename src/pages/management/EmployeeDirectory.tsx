import { useEffect, useState } from 'react';
import { Search, Phone, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/types';

export default function EmployeeDirectory() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile?.department_id) { setLoading(false); return; }
    supabase.from('profiles').select('*').eq('department_id', profile.department_id).eq('role', 'employee').eq('is_active', true).order('full_name').then(({ data }) => { setEmployees(data || []); setLoading(false); });
  }, [profile]);

  const filtered = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (e.designation || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Employee Directory</h1><p className="text-sm text-muted-foreground">{employees.length} employees in your department</p></div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, title, ID..." className="pl-9" /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? Array.from({ length: 6 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24" /></CardContent></Card>)
          : filtered.length === 0 ? <div className="col-span-full text-center py-12 text-muted-foreground">No employees found</div>
            : filtered.map(e => (
              <Card key={e.id}><CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10 shrink-0"><AvatarFallback className="bg-primary/10 text-primary">{e.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{e.full_name}</p>
                    <p className="text-xs text-muted-foreground">{e.designation || 'Employee'}</p>
                    {e.employee_id && <p className="text-xs text-muted-foreground">{e.employee_id}</p>}
                    <div className="mt-2 space-y-1">
                      {e.email && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{e.email}</span></div>}
                      {e.phone && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3 shrink-0" /><span>{e.phone}</span></div>}
                    </div>
                    {!e.is_active && <Badge variant="outline" className="text-xs mt-2 border-red-500/30 text-red-400">Inactive</Badge>}
                  </div>
                </div>
              </CardContent></Card>
            ))}
      </div>
    </div>
  );
}
