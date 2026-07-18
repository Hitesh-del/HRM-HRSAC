import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Trash2, Eye, FileDown, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
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

interface CreateMgmtForm { full_name: string; identifier: string; password: string; phone: string; department_id: string; designation: string; employee_id: string; }
type MgmtRow = Omit<Profile, 'department'> & { department?: { id: string; name: string } | null }

const PAGE_SIZE = 10;

export default function ManagementAccounts() {
  const [accounts, setAccounts] = useState<MgmtRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAcc, setEditAcc] = useState<MgmtRow | null>(null);
  const [viewAcc, setViewAcc] = useState<MgmtRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const form = useForm<CreateMgmtForm>({ defaultValues: { full_name:'',identifier:'',password:'',phone:'',department_id:'',designation:'',employee_id:'' } });
  const editForm = useForm<Partial<MgmtRow>>({});

  const fetchAccounts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    let q = supabase.from('profiles')
      .select('*, department:departments!profiles_department_id_fkey(id,name)', { count: 'exact' })
      .eq('role', 'management')
      .order('full_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (deptFilter !== 'all') q = q.eq('department_id', deptFilter);
    const { data, count } = await q;
    setAccounts((data || []) as MgmtRow[]);
    setTotal(count || 0);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [page, deptFilter]);

  useEffect(() => {
    fetchAccounts();
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
    const ch = supabase.channel('mgmt-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAccounts(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAccounts]);

  const filtered = accounts.filter(a =>
    a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.employee_id || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (v: CreateMgmtForm) => {
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token || sessionData?.access_token || null;
    const { data, error } = await supabase.functions.invoke('create-account', {
      body: { identifier: v.identifier, password: v.password, role: 'management', full_name: v.full_name, phone: v.phone || null, department_id: v.department_id || null, designation: v.designation || null, employee_id: v.employee_id || null },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setSaving(false);
    if (error || data?.error) {
      // Log full details for debugging and show the most useful message available
      // (serverless function may return a JSON `error` field, or the SDK may return an `error` object)
      // eslint-disable-next-line no-console
      console.error('create-account invoke error:', { error, data });
      const sdkMessage = data?.error || (error?.message || (typeof error === 'string' ? error : JSON.stringify(error))) || 'Failed to create account';

      // Try a direct fetch to the function endpoint to capture the raw status and response body
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-account`;
        const bodyObj = { identifier: v.identifier, password: v.password, role: 'management', full_name: v.full_name, phone: v.phone || null, department_id: v.department_id || null, designation: v.designation || null, employee_id: v.employee_id || null };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(bodyObj),
        });
        const text = await resp.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        // eslint-disable-next-line no-console
        console.error('create-account direct response:', { status: resp.status, body: parsed ?? text });
        const diagMsg = parsed?.error || parsed?.message || text || `Status ${resp.status}`;
        toast.error(`${sdkMessage}: ${diagMsg}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('create-account diagnostic fetch failed:', e);
        toast.error(sdkMessage);
      }
      return;
    }
    toast.success('Management account created');
    if (data?.user_id) { setHighlightId(data.user_id); setTimeout(() => setHighlightId(null), 2000); }
    setCreateOpen(false);
    form.reset();
    fetchAccounts(true);
  };

  const handleEdit = async (v: Partial<MgmtRow>) => {
    if (!editAcc) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: v.full_name, phone: v.phone, department_id: v.department_id || null, designation: v.designation }).eq('id', editAcc.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Account updated');
    setEditAcc(null);
    fetchAccounts(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Account deactivated');
    setDeleteId(null);
    fetchAccounts(true);
  };

  const exportColumns: ReportColumn[] = [
    { header: 'Management ID', key: 'employee_id' },
    { header: 'Name',          key: 'full_name' },
    { header: 'Email',         key: 'email' },
    { header: 'Mobile',        key: 'phone' },
    { header: 'Department',    key: 'department', format: v => (v as any)?.name || '—' },
    { header: 'Designation',   key: 'designation' },
    { header: 'Status',        key: 'is_active', format: v => v ? 'Active' : 'Inactive' },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Management Accounts</h1>
          <p className="text-sm text-muted-foreground">{total} management accounts</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          <Button variant="outline" size="sm" onClick={() => fetchAccounts(true)} disabled={refreshing}><RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing?'animate-spin':''}`}/>Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5"/>Add Management</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name, email, ID..." className="pl-9"/>
        </div>
        <Select value={deptFilter} onValueChange={v => { setDeptFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-44"><SelectValue placeholder="All Departments"/></SelectTrigger>
          <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['ID','Name','Department','Designation','Phone','Status','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({length:5}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:7}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 bg-muted"/></td>)}</tr>)
                : filtered.length === 0
                ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No management accounts found</td></tr>
                : filtered.map(a => (
                    <tr key={a.id} className={`border-b border-border transition-colors hover:bg-muted/20 ${highlightId===a.id?'bg-primary/10 animate-pulse':''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{a.employee_id||'—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-400"/>
                          </div>
                          <div>
                            <p className="font-medium text-foreground leading-tight">{a.full_name}</p>
                            <p className="text-[11px] text-muted-foreground">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{a.department?.name||'—'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{a.designation||'—'}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{a.phone||'—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={a.is_active?'border-green-500/30 text-green-400 bg-green-500/10':'border-muted-foreground/30 text-muted-foreground'}>{a.is_active?'Active':'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={()=>setViewAcc(a)}><Eye className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={()=>{setEditAcc(a);editForm.reset({full_name:a.full_name,phone:a.phone||'',department_id:a.department_id||'',designation:a.designation||''});}}><Edit2 className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={()=>setDeleteId(a.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Page {page+1} of {totalPages} · {total} records</p>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="w-4 h-4"/></Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Create Management Account</DialogTitle></DialogHeader>
          <Form {...form}><form onSubmit={form.handleSubmit(handleCreate)} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField control={form.control} name="full_name" rules={{required:'Required'}} render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Full Name</FormLabel><FormControl><Input {...field} placeholder="Jane Smith"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="identifier" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Email / Username</FormLabel><FormControl><Input {...field} placeholder="jane@company.com"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="password" rules={{required:'Required',minLength:{value:6,message:'Min 6 chars'}}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Password</FormLabel><FormControl><Input {...field} type="password" placeholder="••••••"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="employee_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Management ID</FormLabel><FormControl><Input {...field} placeholder="MGT-001"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="phone" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Phone</FormLabel><FormControl><Input {...field} placeholder="+1 234 567"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Assign dept"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="designation" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Designation</FormLabel><FormControl><Input {...field} placeholder="Department Manager"/></FormControl><FormMessage/></FormItem>)}/>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Creating...':'Create Account'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editAcc} onOpenChange={v=>!v&&setEditAcc(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Edit Management Account</DialogTitle></DialogHeader>
          <Form {...editForm}><form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-3 mt-2">
            <FormField control={editForm.control} name="full_name" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Full Name</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
            <FormField control={editForm.control} name="phone" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Phone</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
            <FormField control={editForm.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={field.onChange} value={field.value||''}><FormControl><SelectTrigger><SelectValue placeholder="Select dept"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
            <FormField control={editForm.control} name="designation" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Designation</FormLabel><FormControl><Input {...field} value={field.value||''}/></FormControl><FormMessage/></FormItem>)}/>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setEditAcc(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Saving...':'Save Changes'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={!!viewAcc} onOpenChange={v=>!v&&setViewAcc(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Account Details</DialogTitle></DialogHeader>
          {viewAcc && (
            <div className="space-y-3 mt-2">
              {[['Full Name',viewAcc.full_name],['Email',viewAcc.email],['Phone',viewAcc.phone||'—'],['Department',viewAcc.department?.name||'—'],['Designation',viewAcc.designation||'—'],['Employee ID',viewAcc.employee_id||'—'],['Status',viewAcc.is_active?'Active':'Inactive']].map(([k,v])=>(
                <div key={k as string} className="flex justify-between flex-wrap gap-2 text-sm border-b border-border pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={v=>!v&&setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the management account. The user will no longer be able to log in.</AlertDialogDescription>
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
        reportTitle="Management Accounts Report"
        columns={exportColumns}
        rows={accounts as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}
