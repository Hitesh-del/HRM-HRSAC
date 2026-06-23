import { useEffect, useState, useCallback } from 'react';
import { Plus, GraduationCap, Search, BookOpen, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { TrainingProgram, TrainingEnrollment, Profile, Department } from '@/types/types';
import { notifyTrainingAssigned } from '@/lib/notifications';

interface TrainingForm { title:string; description:string; trainer:string; start_date:string; end_date:string; duration_hours:string; mode:string; max_participants:string; department_id:string; }

export default function TrainingManagement() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState<TrainingProgram[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const form = useForm<TrainingForm>({ defaultValues: { title:'',description:'',trainer:'',start_date:'',end_date:'',duration_hours:'',mode:'online',max_participants:'',department_id:'' } });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: prog }, { data: enr }] = await Promise.all([
      supabase.from('training_programs').select('*, department:departments(id,name)').order('created_at',{ascending:false}),
      supabase.from('training_enrollments').select('*, training:training_programs(id,title), employee:profiles(id,full_name)').order('created_at',{ascending:false}).limit(100),
    ]);
    setPrograms(prog||[]);
    setEnrollments(enr||[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    supabase.from('profiles').select('id,full_name').in('role',['employee','management']).eq('is_active',true).order('full_name').then(({data})=>setEmployees((data||[]) as unknown as Profile[]));
    supabase.from('departments').select('*').order('name').then(({data})=>setDepartments(data||[]));
  }, [fetchData]);

  const onSubmit = async (v: TrainingForm) => {
    setSaving(true);
    const { data: prog, error } = await supabase.from('training_programs').insert({ title:v.title, description:v.description||null, trainer:v.trainer||null, start_date:v.start_date||null, end_date:v.end_date||null, duration_hours:v.duration_hours?Number(v.duration_hours):null, mode:v.mode, max_participants:v.max_participants?Number(v.max_participants):null, department_id:v.department_id||null, created_by:profile!.id }).select('id').maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Training program created');
    if (prog?.id && v.department_id && v.department_id !== 'all') {
      notifyTrainingAssigned(prog.id, v.title, v.department_id);
    }
    setCreateOpen(false);
    form.reset();
    fetchData();
    setSaving(false);
  };

  const enrollEmployee = async () => {
    if (!selectedProgram||!selectedEmployee) { toast.error('Select program and employee'); return; }
    const { error } = await supabase.from('training_enrollments').insert({ training_id:selectedProgram, employee_id:selectedEmployee, status:'enrolled', progress:0 });
    if (error) { toast.error(error.message); return; }
    toast.success('Employee enrolled');
    setEnrollOpen(false);
    fetchData();
  };

  const STATUS_STYLES: Record<string,string> = {
    enrolled:'border-blue-500/30 text-blue-400 bg-blue-500/10',
    in_progress:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
    completed:'border-green-500/30 text-green-400 bg-green-500/10',
  };

  type ProgExtended = TrainingProgram & { department?:{name?:string} };
  type EnrExtended = TrainingEnrollment & { training?:{title?:string}; employee?:{full_name?:string} };
  const filteredPrograms = (programs as ProgExtended[]).filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  const filteredEnrollments = (enrollments as EnrExtended[]).filter(e => (e.employee?.full_name||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Training Management</h1><p className="text-sm text-muted-foreground">Training programs and enrollments</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm">Enroll Employee</Button></DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
              <DialogHeader><DialogTitle>Enroll in Training</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><label className="text-sm font-normal text-foreground block mb-1.5">Training Program</label><Select value={selectedProgram} onValueChange={setSelectedProgram}><SelectTrigger><SelectValue placeholder="Select program"/></SelectTrigger><SelectContent>{programs.map(p=><SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select></div>
                <div><label className="text-sm font-normal text-foreground block mb-1.5">Employee</label><Select value={selectedEmployee} onValueChange={setSelectedEmployee}><SelectTrigger><SelectValue placeholder="Select employee"/></SelectTrigger><SelectContent>{employees.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex flex-wrap gap-2"><Button variant="outline" className="flex-1 min-w-0" onClick={()=>setEnrollOpen(false)}>Cancel</Button><Button className="flex-1 min-w-0" onClick={enrollEmployee}>Enroll</Button></div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5"/>New Program</Button></DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
              <DialogHeader><DialogTitle>Create Training Program</DialogTitle></DialogHeader>
              <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
                <FormField control={form.control} name="title" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Title</FormLabel><FormControl><Input {...field} placeholder="React Fundamentals"/></FormControl><FormMessage/></FormItem>)}/>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField control={form.control} name="trainer" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Trainer</FormLabel><FormControl><Input {...field} placeholder="John Smith"/></FormControl><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="mode" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Mode</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="start_date" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Start Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="end_date" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">End Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="duration_hours" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Duration (hrs)</FormLabel><FormControl><Input {...field} type="number"/></FormControl><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="max_participants" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Max Participants</FormLabel><FormControl><Input {...field} type="number"/></FormControl><FormMessage/></FormItem>)}/>
                  <FormField control={form.control} name="department_id" render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Department (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="All departments"/></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
                </div>
                <FormField control={form.control} name="description" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Description</FormLabel><FormControl><Textarea {...field} rows={2}/></FormControl><FormMessage/></FormItem>)}/>
                <div className="flex flex-wrap gap-2 pt-1"><Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Creating...':'Create'}</Button></div>
              </form></Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="pl-9"/></div>
      <Tabs defaultValue="programs">
        <TabsList className="w-full md:w-auto"><TabsTrigger value="programs" className="flex-1 md:flex-none whitespace-nowrap">Programs ({programs.length})</TabsTrigger><TabsTrigger value="enrollments" className="flex-1 md:flex-none whitespace-nowrap">Enrollments ({enrollments.length})</TabsTrigger></TabsList>
        <TabsContent value="programs" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading?Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-28"/></CardContent></Card>)
            :filteredPrograms.length===0?<div className="col-span-full text-center py-12 text-muted-foreground">No programs found</div>
            :filteredPrograms.map(p=>(
              <Card key={p.id} className="h-full"><CardContent className="p-4">
                <div className="flex items-start gap-2 mb-2"><BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5"/><div className="flex-1 min-w-0"><h3 className="font-semibold text-foreground truncate">{p.title}</h3>{p.trainer&&<p className="text-xs text-muted-foreground">Trainer: {p.trainer}</p>}</div></div>
                <div className="flex gap-2 flex-wrap text-xs text-muted-foreground mt-2">
                  <Badge variant="outline" className="border-border text-muted-foreground capitalize text-xs">{p.mode}</Badge>
                  {p.duration_hours&&<span>{p.duration_hours}h</span>}
                  {p.start_date&&<span>{new Date(p.start_date).toLocaleDateString()}</span>}
                </div>
                {p.department?.name&&<p className="text-xs text-muted-foreground mt-1">Dept: {p.department.name}</p>}
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="enrollments" className="mt-4">
          <Card><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">{['Employee','Training','Status','Progress','Completed'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {loading?Array.from({length:4}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:5}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20"/></td>)}</tr>)
                :filteredEnrollments.length===0?<tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No enrollments found</td></tr>
                :filteredEnrollments.map(e=>(
                  <tr key={e.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{e.employee?.full_name||'—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{e.training?.title||'—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><Badge variant="outline" className={STATUS_STYLES[e.status]||''}>{e.status.replace('_',' ')}</Badge></td>
                    <td className="px-4 py-3 whitespace-nowrap"><div className="flex items-center flex-wrap gap-2"><div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${e.progress}%`}}/></div><span className="text-xs text-muted-foreground">{e.progress}%</span></div></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{e.completed_at?new Date(e.completed_at).toLocaleDateString():'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        </TabsContent>
      </Tabs>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Training Management Report"
        columns={[
          { header: 'Program',     key: 'title' },
          { header: 'Description', key: 'description' },
          { header: 'Status',      key: 'status' },
          { header: 'Start Date',  key: 'start_date' },
          { header: 'End Date',    key: 'end_date' },
          { header: 'Capacity',    key: 'max_participants', format: v => String(v ?? '—') },
        ] satisfies ReportColumn[]}
        rows={programs as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
