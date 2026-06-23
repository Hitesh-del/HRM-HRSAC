import { useEffect, useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Task, Profile } from '@/types/types';

const STATUS_STYLES: Record<string,string> = {
  todo:'border-muted-foreground/30 text-muted-foreground',
  in_progress:'border-blue-500/30 text-blue-400 bg-blue-500/10',
  completed:'border-green-500/30 text-green-400 bg-green-500/10',
  cancelled:'border-red-500/30 text-red-400 bg-red-500/10',
};
const PRIORITY_STYLES: Record<string,string> = {
  low:'border-muted-foreground/30 text-muted-foreground',
  medium:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  high:'border-orange-500/30 text-orange-400 bg-orange-500/10',
  urgent:'border-red-500/30 text-red-400 bg-red-500/10',
};

interface TaskForm { title:string; description:string; assigned_to:string; priority:string; due_date:string; }

export default function TaskManagement() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<TaskForm>({ defaultValues: { title:'',description:'',assigned_to:'',priority:'medium',due_date:'' } });

  const fetchTasks = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase.from('profiles').select('id').eq('department_id',profile.department_id).in('role',['employee','management']);
    const ids = (members||[]).map(m=>m.id);
    let q = supabase.from('tasks').select('*, assignee:profiles!assigned_to(id,full_name), assigner:profiles!assigned_by(id,full_name)').order('created_at',{ascending:false});
    if (ids.length) q = q.in('assigned_to',ids);
    if (statusFilter!=='all') q = q.eq('status',statusFilter);
    const { data } = await q;
    setTasks(data||[]);
    setLoading(false);
  }, [profile, statusFilter]);

  useEffect(() => {
    fetchTasks();
    if (profile?.department_id) {
      supabase.from('profiles').select('id,full_name').eq('department_id',profile.department_id).in('role',['employee','management']).eq('is_active',true).order('full_name').then(({data})=>setTeamMembers((data||[]) as unknown as Profile[]));
    }
  }, [fetchTasks, profile]);

  const onSubmit = async (v: TaskForm) => {
    setSaving(true);
    const { error } = await supabase.from('tasks').insert({ title:v.title, description:v.description||null, assigned_to:v.assigned_to||null, assigned_by:profile!.id, priority:v.priority, due_date:v.due_date||null, status:'todo' });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Task created');
    setCreateOpen(false);
    form.reset();
    fetchTasks();
    setSaving(false);
  };

  const updateTaskStatus = async (id: string, status: string) => {
    await supabase.from('tasks').update({ status, completed_at: status==='completed'?new Date().toISOString():null }).eq('id',id);
    fetchTasks();
  };

  type TaskExtended = Task & { assignee?:{full_name?:string}; assigner?:{full_name?:string} };
  const filtered = (tasks as TaskExtended[]).filter(t => t.title.toLowerCase().includes(search.toLowerCase())||(t.assignee?.full_name||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Task Management</h1><p className="text-sm text-muted-foreground">Assign and track team tasks</p></div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5"/>New Task</Button></DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
            <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
            <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
              <FormField control={form.control} name="title" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Title</FormLabel><FormControl><Input {...field} placeholder="Task title"/></FormControl><FormMessage/></FormItem>)}/>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="assigned_to" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Assign To</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger></FormControl><SelectContent>{teamMembers.map(m=><SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="priority" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Priority</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="due_date" render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Due Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
              </div>
              <FormField control={form.control} name="description" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Description</FormLabel><FormControl><Textarea {...field} rows={3}/></FormControl><FormMessage/></FormItem>)}/>
              <div className="flex flex-wrap gap-2 pt-1"><Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Creating...':'Create'}</Button></div>
            </form></Form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[10rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks..." className="pl-9"/></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full md:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="todo">Todo</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select>
      </div>
      <Card><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b border-border">{['Task','Assigned To','Priority','Due Date','Status','Update'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {loading?Array.from({length:5}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:6}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20"/></td>)}</tr>)
          :filtered.length===0?<tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No tasks found</td></tr>
          :filtered.map(t=>(
            <tr key={t.id} className="border-b border-border hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap"><p className="font-medium text-foreground">{t.title}</p></td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{t.assignee?.full_name||'—'}</td>
              <td className="px-4 py-3 whitespace-nowrap"><Badge variant="outline" className={`text-xs ${PRIORITY_STYLES[t.priority]||''}`}>{t.priority}</Badge></td>
              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{t.due_date?new Date(t.due_date).toLocaleDateString():'—'}</td>
              <td className="px-4 py-3 whitespace-nowrap"><Badge variant="outline" className={`text-xs ${STATUS_STYLES[t.status]||''}`}>{t.status.replace('_',' ')}</Badge></td>
              <td className="px-4 py-3 whitespace-nowrap">
                <Select value={t.status} onValueChange={v=>updateTaskStatus(t.id,v)}>
                  <SelectTrigger className="h-7 w-full md:w-28 text-xs"><SelectValue/></SelectTrigger>
                  <SelectContent>{['todo','in_progress','completed','cancelled'].map(s=><SelectItem key={s} value={s} className="text-xs">{s.replace('_',' ')}</SelectItem>)}</SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div></Card>
    </div>
  );
}
