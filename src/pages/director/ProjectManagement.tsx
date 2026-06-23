import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Eye, FileDown, RefreshCw, ChevronLeft, ChevronRight, Users2, FolderKanban } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Project, Department, Profile } from '@/types/types';
import { notifyProjectAssigned } from '@/lib/notifications';

const STATUS_STYLES: Record<string,string> = {
  planning: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  active:   'border-green-500/30 text-green-400 bg-green-500/10',
  on_hold:  'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  completed:'border-primary/30 text-primary bg-primary/10',
  cancelled:'border-red-500/30 text-red-400 bg-red-500/10',
};

const PRIORITY_STYLES: Record<string,string> = {
  low:    'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-yellow-500/30 text-yellow-400',
  high:   'border-red-500/30 text-red-400',
};

interface ProjectForm { title:string; description:string; department_id:string; manager_id:string; start_date:string; end_date:string; status:string; priority:string; member_ids:string[]; }
type ProjectRow = Omit<Project, 'department' | 'manager'> & { department?:{name:string}|null; manager?:{full_name:string}|null; project_members?:{profile_id:string}[] }

type EmployeeOption = { id:string; full_name:string; department_id:string|null };
const PAGE_SIZE = 10;

export default function ProjectManagement() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allEmployees, setAllEmployees] = useState<EmployeeOption[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProj, setEditProj] = useState<ProjectRow | null>(null);
  const [viewProj, setViewProj] = useState<ProjectRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const form = useForm<ProjectForm>({ defaultValues: { title:'',description:'',department_id:'',manager_id:'',start_date:'',end_date:'',status:'planning',priority:'medium',member_ids:[] } });
  const selectedDept = form.watch('department_id');

  // Filter employees by selected department in form
  useEffect(() => {
    if (!selectedDept) {
      setFilteredEmployees([]);
      setSelectedMembers([]);
    } else {
      const emp = allEmployees.filter(e => e.department_id === selectedDept);
      setFilteredEmployees(emp);
      // Clear selected members that don't belong to new dept
      setSelectedMembers(prev => prev.filter(id => emp.some(e => e.id === id)));
    }
  }, [selectedDept, allEmployees]);

  const fetchProjects = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    let q = supabase.from('projects')
      .select('*, department:departments(id,name), manager:profiles!projects_manager_id_fkey(id,full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (deptFilter !== 'all') q = q.eq('department_id', deptFilter);
    const { data, count } = await q;
    setProjects((data || []) as ProjectRow[]);
    setTotal(count || 0);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [statusFilter, deptFilter, page]);

  useEffect(() => {
    fetchProjects();
    supabase.from('departments').select('*').order('name').then(({data})=>setDepartments(data||[]));
    supabase.from('profiles').select('id,full_name,department_id').in('role',['employee','management']).eq('is_active',true).order('full_name')
      .then(({data})=>setAllEmployees((data||[]) as EmployeeOption[]));
    const ch = supabase.channel('proj-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchProjects]);

  const filtered = projects.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (v: ProjectForm) => {
    setSaving(true);
    const { data, error } = await supabase.from('projects')
      .insert({ title:v.title, description:v.description||null, department_id:v.department_id||null, manager_id:v.manager_id||null, start_date:v.start_date||null, end_date:v.end_date||null, status:v.status, priority:v.priority, progress:0, created_by:profile!.id })
      .select('id').maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }
    // Add project members
    if (data?.id && selectedMembers.length > 0) {
      await supabase.from('project_members').insert(selectedMembers.map(mid => ({ project_id: data.id, employee_id: mid })));
      // Notify each assigned member
      selectedMembers.forEach(mid => notifyProjectAssigned(mid, v.title, data.id));
    }
    toast.success('Project created');
    if (data?.id) { setHighlightId(data.id); setTimeout(() => setHighlightId(null), 2000); }
    setCreateOpen(false);
    form.reset();
    setSelectedMembers([]);
    fetchProjects(true);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('project_members').delete().eq('project_id', deleteId);
    const { error } = await supabase.from('projects').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Project deleted');
    setDeleteId(null);
    fetchProjects(true);
  };

  const exportColumns: ReportColumn[] = [
    { header: 'Project Name', key: 'title' },
    { header: 'Department',   key: 'department', format: v => (v as any)?.name || '—' },
    { header: 'Manager',      key: 'manager',    format: v => (v as any)?.full_name || '—' },
    { header: 'Priority',     key: 'priority' },
    { header: 'Status',       key: 'status',     format: v => String(v||'').replace(/_/g,' ') },
    { header: 'Start Date',   key: 'start_date' },
    { header: 'End Date',     key: 'end_date' },
    { header: 'Progress',     key: 'progress',   format: v => `${v ?? 0}%` },
  ];

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(i=>i!==id) : [...prev, id]);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Project Management</h1>
          <p className="text-sm text-muted-foreground">{total} projects total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          <Button variant="outline" size="sm" onClick={() => fetchProjects(true)} disabled={refreshing}><RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing?'animate-spin':''}`}/>Refresh</Button>
          <Button size="sm" onClick={() => { setCreateOpen(true); form.reset(); setSelectedMembers([]); }}><Plus className="w-4 h-4 mr-1.5"/>New Project</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..." className="pl-9"/>
        </div>
        <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Departments"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Status"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem>{['planning','active','on_hold','completed','cancelled'].map(s=><SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['Project','Department','Manager','Priority','Progress','Status','Actions'].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({length:5}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:7}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 bg-muted"/></td>)}</tr>)
                : filtered.length === 0
                ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No projects found</td></tr>
                : filtered.map(p => (
                    <tr key={p.id} className={`border-b border-border transition-colors hover:bg-muted/20 ${highlightId===p.id?'bg-primary/10 animate-pulse':''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <FolderKanban className="w-3.5 h-3.5 text-primary"/>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{p.title}</p>
                            {p.end_date && <p className="text-[10px] text-muted-foreground">Due: {new Date(p.end_date).toLocaleDateString()}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{p.department?.name||'—'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{p.manager?.full_name||'—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.priority && <Badge variant="outline" className={PRIORITY_STYLES[p.priority]||''}>{p.priority}</Badge>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{width:`${p.progress||0}%`}}/>
                          </div>
                          <span className="text-xs text-muted-foreground w-8 shrink-0">{p.progress||0}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={STATUS_STYLES[p.status]||''}>{p.status.replace('_',' ')}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={()=>setViewProj(p)}><Eye className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={()=>setDeleteId(p.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Page {page+1} of {totalPages} · {total} projects</p>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-4 h-4"/></Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create New Project</DialogTitle></DialogHeader>
          <Form {...form}><form onSubmit={form.handleSubmit(handleCreate)} className="space-y-3 mt-2">
            <FormField control={form.control} name="title" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Project Title</FormLabel><FormControl><Input {...field} placeholder="e.g. Website Redesign"/></FormControl><FormMessage/></FormItem>)}/>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Department — drives employee filter */}
              <FormField control={form.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={(v)=>{field.onChange(v);}} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select department"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="manager_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Project Manager</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!selectedDept}><FormControl><SelectTrigger><SelectValue placeholder={selectedDept?"Select manager":"Select dept first"}/></SelectTrigger></FormControl><SelectContent>{filteredEmployees.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="start_date" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Start Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="end_date" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">End Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="status" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Status</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent>{['planning','active','on_hold'].map(s=><SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="priority" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Priority</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
            </div>
            <FormField control={form.control} name="description" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Description</FormLabel><FormControl><Textarea {...field} rows={2} placeholder="Project objectives and scope..."/></FormControl><FormMessage/></FormItem>)}/>

            {/* Employee multi-select (filtered by dept) */}
            <div>
              <label className="text-sm font-normal block mb-2 text-foreground">
                <span className="flex items-center gap-1.5"><Users2 className="w-3.5 h-3.5"/>Assign Team Members {selectedDept ? `(${filteredEmployees.length} available from dept)` : '— select department first'}</span>
              </label>
              {!selectedDept
                ? <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed border-border">Select a department to load its employees</div>
                : filteredEmployees.length === 0
                ? <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed border-border">No employees found in this department</div>
                : (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                    {filteredEmployees.map(e => (
                      <label key={e.id} className="flex items-center flex-wrap gap-2 p-1.5 rounded hover:bg-muted/30 cursor-pointer">
                        <Checkbox checked={selectedMembers.includes(e.id)} onCheckedChange={() => toggleMember(e.id)}/>
                        <span className="text-sm text-foreground">{e.full_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              {selectedMembers.length > 0 && (
                <p className="text-xs text-primary mt-1">{selectedMembers.length} member(s) selected</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>{setCreateOpen(false);form.reset();setSelectedMembers([]);}}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Creating...':'Create Project'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewProj} onOpenChange={v=>!v&&setViewProj(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Project Details</DialogTitle></DialogHeader>
          {viewProj && (
            <div className="space-y-3 mt-2">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <h3 className="font-semibold text-foreground">{viewProj.title}</h3>
                <Badge variant="outline" className={STATUS_STYLES[viewProj.status]||''}>{viewProj.status.replace('_',' ')}</Badge>
              </div>
              {viewProj.description && <p className="text-sm text-muted-foreground text-pretty">{viewProj.description}</p>}
              {[
                ['Department', viewProj.department?.name||'—'],
                ['Manager', viewProj.manager?.full_name||'—'],
                ['Priority', viewProj.priority||'—'],
                ['Start Date', viewProj.start_date ? new Date(viewProj.start_date).toLocaleDateString() : '—'],
                ['End Date', viewProj.end_date ? new Date(viewProj.end_date).toLocaleDateString() : '—'],
                ['Progress', `${viewProj.progress||0}%`],
              ].map(([k,v])=>(
                <div key={k as string} className="flex justify-between flex-wrap gap-2 text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
              <div className="mt-2">
                <div className="flex justify-between flex-wrap gap-2 text-xs mb-1"><span className="text-muted-foreground">Progress</span><span className="text-foreground">{viewProj.progress||0}%</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${viewProj.progress||0}%`}}/></div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={v=>!v&&setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the project and all member assignments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Project Management Report"
        columns={exportColumns}
        rows={projects as unknown as Record<string, unknown>[]}
        dateKey="start_date"
      />
    </div>
  );
}
