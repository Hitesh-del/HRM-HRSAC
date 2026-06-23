import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Trash2, Eye, FileDown, RefreshCw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import type { Profile, Department } from '@/types/types';

interface CreateEmployeeForm {
  identifier: string; password: string; full_name: string; phone: string;
  department_id: string; designation: string; employee_id: string; date_of_joining: string;
}
type EmpRow = Omit<Profile, 'department'> & { department?: { id: string; name: string } | null }

const PAGE_SIZE = 10;
type SortKey = 'full_name' | 'employee_id' | 'designation' | 'date_of_joining';

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('full_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<EmpRow | null>(null);
  const [viewEmp, setViewEmp] = useState<EmpRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const newRowId = useRef<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const form = useForm<CreateEmployeeForm>({ defaultValues: { identifier:'',password:'',full_name:'',phone:'',department_id:'',designation:'',employee_id:'',date_of_joining:'' } });
  const editForm = useForm<Partial<EmpRow>>({});

  const fetchEmployees = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    let q = supabase.from('profiles')
      .select('*, department:departments!profiles_department_id_fkey(id,name)', { count: 'exact' })
      .eq('role', 'employee')
      .order(sortKey, { ascending: sortAsc })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (deptFilter !== 'all') q = q.eq('department_id', deptFilter);
    if (statusFilter === 'active') q = q.eq('is_active', true);
    if (statusFilter === 'inactive') q = q.eq('is_active', false);
    const { data, count } = await q;
    setEmployees((data || []) as EmpRow[]);
    setTotal(count || 0);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [page, deptFilter, statusFilter, sortKey, sortAsc]);

  useEffect(() => {
    fetchEmployees();
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
    const ch = supabase.channel('emp-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchEmployees(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchEmployees]);

  const filtered = employees.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (e.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (v: CreateEmployeeForm) => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('create-account', {
      body: { identifier: v.identifier, password: v.password, role: 'employee', full_name: v.full_name, phone: v.phone || null, department_id: v.department_id || null, designation: v.designation || null, employee_id: v.employee_id || null, date_of_joining: v.date_of_joining || null }
    });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error || 'Failed to create employee'); return; }
    toast.success('Employee created successfully');
    newRowId.current = data?.user_id || null;
    setCreateOpen(false);
    form.reset();
    await fetchEmployees(true);
    if (newRowId.current) {
      setHighlightId(newRowId.current);
      setTimeout(() => setHighlightId(null), 2000);
    }
  };

  const handleEdit = async (v: Partial<EmpRow>) => {
    if (!editEmp) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: v.full_name, phone: v.phone, department_id: v.department_id || null, designation: v.designation, employee_id: v.employee_id, date_of_joining: v.date_of_joining || null }).eq('id', editEmp.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Employee updated');
    setEditEmp(null);
    fetchEmployees(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Employee deactivated');
    setDeleteId(null);
    fetchEmployees(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
    setPage(0);
  };

  const exportColumns: ReportColumn[] = [
    { header: 'Employee ID', key: 'employee_id' },
    { header: 'Full Name',   key: 'full_name' },
    { header: 'Department',  key: 'department', format: v => (v as any)?.name || '—' },
    { header: 'Designation', key: 'designation' },
    { header: 'Email',       key: 'email' },
    { header: 'Mobile',      key: 'phone' },
    { header: 'Joining Date',key: 'date_of_joining', format: v => v ? new Date(v as string).toLocaleDateString() : '—' },
    { header: 'Status',      key: 'is_active', format: v => v ? 'Active' : 'Inactive' },
  ];

  const exportRows = employees.map(e => ({ ...e, department: e.department }));

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3 inline ml-1"/> : <ChevronDown className="w-3 h-3 inline ml-1"/>) : <ChevronDown className="w-3 h-3 inline ml-1 opacity-30"/>;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Employee Management</h1>
          <p className="text-sm text-muted-foreground">{total} employees total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          <Button variant="outline" size="sm" onClick={() => fetchEmployees(true)} disabled={refreshing}><RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing?'animate-spin':''}`}/>Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5"/>Add Employee</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name, email, ID..." className="pl-9"/>
        </div>
        <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Departments"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-32"><SelectValue placeholder="Status"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {([['Employee ID','employee_id'],['Full Name','full_name'],['Department',null],['Designation','designation'],['Date Joined','date_of_joining'],['Status',null],['Actions',null]] as [string, SortKey | null][]).map(([h, k]) => (
                  <th key={h} className={`text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap ${k ? 'cursor-pointer hover:text-foreground select-none' : ''}`} onClick={() => k && toggleSort(k)}>
                    {h}{k && <SortIcon k={k}/>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 bg-muted"/></td>)}
                    </tr>
                  ))
                : filtered.length === 0
                ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No employees found</td></tr>
                : filtered.map(e => (
                    <tr key={e.id} className={`border-b border-border transition-colors hover:bg-muted/20 ${highlightId === e.id ? 'bg-primary/10 animate-pulse' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{e.employee_id || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-medium text-primary">
                            {(e.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground leading-tight">{e.full_name}</p>
                            <p className="text-[11px] text-muted-foreground">{e.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.department?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.designation || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.date_of_joining ? new Date(e.date_of_joining).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={e.is_active ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-muted-foreground/30 text-muted-foreground'}>
                          {e.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => setViewEmp(e)}><Eye className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => { setEditEmp(e); editForm.reset({ full_name: e.full_name, phone: e.phone || '', department_id: e.department_id || '', designation: e.designation || '', employee_id: e.employee_id || '', date_of_joining: e.date_of_joining || '' }); }}><Edit2 className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} · {total} records</p>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4"/></Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Add New Employee</DialogTitle></DialogHeader>
          <Form {...form}><form onSubmit={form.handleSubmit(handleCreate)} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField control={form.control} name="full_name" rules={{required:'Required'}} render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Full Name</FormLabel><FormControl><Input {...field} placeholder="John Doe"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="identifier" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Email / Username</FormLabel><FormControl><Input {...field} placeholder="john@company.com"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="password" rules={{required:'Required',minLength:{value:6,message:'Min 6 chars'}}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Password</FormLabel><FormControl><Input {...field} type="password" placeholder="••••••"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="employee_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Employee ID</FormLabel><FormControl><Input {...field} placeholder="EMP-001"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="phone" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Phone</FormLabel><FormControl><Input {...field} placeholder="+1 234 567"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select dept"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="designation" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Designation</FormLabel><FormControl><Input {...field} placeholder="Software Engineer"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="date_of_joining" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Date of Joining</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Creating...' : 'Create Employee'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editEmp} onOpenChange={v => !v && setEditEmp(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <Form {...editForm}><form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField control={editForm.control} name="full_name" rules={{required:'Required'}} render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Full Name</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={editForm.control} name="employee_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Employee ID</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={editForm.control} name="phone" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Phone</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={editForm.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={field.onChange} value={field.value||''}><FormControl><SelectTrigger><SelectValue placeholder="Select dept"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={editForm.control} name="designation" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Designation</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={editForm.control} name="date_of_joining" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Date of Joining</FormLabel><FormControl><Input {...field} type="date" value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={() => setEditEmp(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewEmp} onOpenChange={v => !v && setViewEmp(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Employee Details</DialogTitle></DialogHeader>
          {viewEmp && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center flex-wrap gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {(viewEmp.full_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div><p className="font-semibold text-foreground">{viewEmp.full_name}</p><p className="text-sm text-muted-foreground">{viewEmp.email}</p></div>
              </div>
              {[['Employee ID', viewEmp.employee_id],['Department', viewEmp.department?.name],['Designation', viewEmp.designation],['Phone', viewEmp.phone],['Date of Joining', viewEmp.date_of_joining ? new Date(viewEmp.date_of_joining).toLocaleDateString() : null],['Status', viewEmp.is_active ? 'Active' : 'Inactive']].map(([k,v]) => v && (
                <div key={k as string} className="flex justify-between flex-wrap gap-2 text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
              <div className="flex items-center flex-wrap gap-2 pt-1">
                <UserCircle className="w-4 h-4 text-muted-foreground"/>
                <span className="text-xs text-muted-foreground">ID: {viewEmp.id}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Employee?</AlertDialogTitle>
            <AlertDialogDescription>This will mark the employee as inactive. Their data will be preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Employee Management Report"
        columns={exportColumns}
        rows={exportRows as Record<string, unknown>[]}
        dateKey="date_of_joining"
      />
    </div>
  );
}
