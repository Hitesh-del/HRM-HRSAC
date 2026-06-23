import { useEffect, useState } from 'react';
import { Users, ClipboardCheck, Calendar, FolderKanban, Clock, CheckSquare, UserX, AlarmClock, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import UpcomingHolidaysWidget from '@/components/common/UpcomingHolidaysWidget';

export default function ManagementDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ teamSize:0, presentToday:0, pendingLeaves:0, activeTasks:0, activeProjects:0, completedTasks:0 });
  const [attSummary, setAttSummary] = useState({ present:0, absent:0, late:0, half_day:0, overtime:0 });
  const [loading, setLoading] = useState(true);
  const [recentLeaves, setRecentLeaves] = useState<{id:string;employee?:{full_name?:string};leave_type?:{name?:string};status:string;start_date:string}[]>([]);

  useEffect(() => {
    if (!profile?.department_id) { setLoading(false); return; }
    const deptId = profile.department_id;
    const today = new Date().toISOString().split('T')[0];
    const fetch = async () => {
      const { data: teamMembers } = await supabase.from('profiles').select('id').eq('department_id',deptId).eq('is_active',true).in('role',['employee','management']);
      const memberIds = (teamMembers||[]).map(m=>m.id);
      if (!memberIds.length) { setLoading(false); return; }

      const [{ count: present },{ count: pendingLeaves },{ count: activeTasks },{ count: activeProjects },{ count: completedTasks }] = await Promise.all([
        supabase.from('attendance').select('*',{count:'exact',head:true}).eq('date',today).eq('status','present').in('employee_id',memberIds),
        supabase.from('leave_requests').select('*',{count:'exact',head:true}).eq('status','pending').in('employee_id',memberIds),
        supabase.from('tasks').select('*',{count:'exact',head:true}).in('status',['todo','in_progress']).in('assigned_to',memberIds),
        supabase.from('projects').select('*',{count:'exact',head:true}).eq('department_id',deptId).in('status',['planning','active']),
        supabase.from('tasks').select('*',{count:'exact',head:true}).eq('status','completed').in('assigned_to',memberIds),
      ]);
      setStats({ teamSize:memberIds.length, presentToday:present||0, pendingLeaves:pendingLeaves||0, activeTasks:activeTasks||0, activeProjects:activeProjects||0, completedTasks:completedTasks||0 });

      // Full attendance summary for today
      const { data: attToday } = await supabase.from('attendance').select('status').eq('date',today).in('employee_id',memberIds);
      const arr = attToday || [];
      setAttSummary({
        present:  arr.filter(r=>r.status==='present').length,
        absent:   arr.filter(r=>r.status==='absent').length,
        late:     arr.filter(r=>r.status==='late').length,
        half_day: arr.filter(r=>r.status==='half_day').length,
        overtime: arr.filter(r=>r.status==='overtime').length,
      });

      const { data: leaves } = await supabase.from('leave_requests').select('id,status,start_date,employee:profiles(full_name),leave_type:leave_types(name)').in('employee_id',memberIds).order('created_at',{ascending:false}).limit(5);
      setRecentLeaves((leaves||[]) as any);
      setLoading(false);
    };
    fetch();
  }, [profile]);

  const cards = [
    {l:'Team Members',v:stats.teamSize,icon:Users,c:'text-primary',bg:'bg-primary/10'},
    {l:'Present Today',v:stats.presentToday,icon:ClipboardCheck,c:'text-green-400',bg:'bg-green-500/10'},
    {l:'Pending Leaves',v:stats.pendingLeaves,icon:Calendar,c:'text-yellow-400',bg:'bg-yellow-500/10'},
    {l:'Active Tasks',v:stats.activeTasks,icon:Clock,c:'text-orange-400',bg:'bg-orange-500/10'},
    {l:'Active Projects',v:stats.activeProjects,icon:FolderKanban,c:'text-blue-400',bg:'bg-blue-500/10'},
    {l:'Completed Tasks',v:stats.completedTasks,icon:CheckSquare,c:'text-emerald-400',bg:'bg-emerald-500/10'},
  ];

  const STATUS_STYLES: Record<string,string> = {pending:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',approved:'border-green-500/30 text-green-400 bg-green-500/10',rejected:'border-red-500/30 text-red-400 bg-red-500/10'};

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Management Dashboard</h1><p className="text-sm text-muted-foreground">{profile?.department?.name || 'Department'} overview</p></div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {loading?Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-16 bg-muted"/></CardContent></Card>):cards.map(c=>(
          <Card key={c.l}><CardContent className="p-4"><div className={`w-8 h-8 rounded ${c.bg} flex items-center justify-center mb-3`}><c.icon className={`w-4 h-4 ${c.c}`}/></div><p className="text-xl font-bold text-foreground">{c.v}</p><p className="text-xs text-muted-foreground mt-0.5">{c.l}</p></CardContent></Card>
        ))}
      </div>

      {!loading&&!profile?.department_id&&<div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">No department assigned. Contact the Director to assign your department.</div>}

      {/* Today's Attendance Summary */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's Attendance Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { l:'Present',  v:attSummary.present,  c:'text-green-400',  bg:'bg-green-500/10',  Icon:ClipboardCheck },
            { l:'Absent',   v:attSummary.absent,   c:'text-red-400',    bg:'bg-red-500/10',    Icon:UserX },
            { l:'Late',     v:attSummary.late,     c:'text-yellow-400', bg:'bg-yellow-500/10', Icon:AlarmClock },
            { l:'Half Day', v:attSummary.half_day, c:'text-orange-400', bg:'bg-orange-500/10', Icon:Clock },
            { l:'Overtime', v:attSummary.overtime, c:'text-purple-400', bg:'bg-purple-500/10', Icon:Zap },
          ].map(s=>(
            <Card key={s.l}>
              <CardContent className="p-3 flex items-center flex-wrap gap-2">
                <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}><s.Icon className={`w-4 h-4 ${s.c}`}/></div>
                <div><p className={`text-xl font-bold ${s.c}`}>{loading ? '—' : s.v}</p><p className="text-xs text-muted-foreground">{s.l}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Bottom: recent leaves + upcoming holidays */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Leave Requests</CardTitle></CardHeader>
          <CardContent>
            {recentLeaves.length===0?<p className="text-sm text-muted-foreground py-4 text-center">No recent leave requests</p>:(
              <div className="space-y-2">
                {recentLeaves.map(l=>(
                  <div key={l.id} className="flex items-center justify-between flex-wrap gap-3 py-2 border-b border-border last:border-0">
                    <div><p className="text-sm font-medium text-foreground">{l.employee?.full_name||'—'}</p><p className="text-xs text-muted-foreground">{l.leave_type?.name} · {new Date(l.start_date).toLocaleDateString()}</p></div>
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[l.status]||''}`}>{l.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <UpcomingHolidaysWidget />
      </div>
    </div>
  );
}
