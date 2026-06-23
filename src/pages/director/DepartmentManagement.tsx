import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Search, Edit2, Trash2, Eye, FileDown, RefreshCw, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
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
import type { Department } from '@/types/types';

interface DeptForm { name: string; head_id: string; }
type DeptRow = Omit<Department, 'head'> & { head?: { id: string; full_name: string } | null; member_count?: number }
type HeadProfile = { id: string; full_name: string };

const PAGE_SIZE = 10;

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [heads, setHeads] = useState<HeadProfile[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDept, setEditDept] = useState<DeptRow | null>(null);
  const [viewDept, setViewDept] = useState<DeptRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const form = useForm<DeptForm>({ defaultValues: { name: '', head_id: '' } });
  const editForm = useForm<DeptForm>({ defaultValues: { name: '', head_id: '' } });

  const fetchDepts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const { data, count } = await supabase.from('departments')
      .select('*, head:profiles!departments_head_id_fkey(id,full_name)', { count: 'exact' })
      .order('name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    // Get member counts
    const rows = (data || []) as DeptRow[];
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const { data: counts } = await supabase.from('profiles').select('department_id').in('department_id', ids).eq('is_active', true);
      const countMap: Record<string, number> = {};
      (counts || []).forEach((c: { department_id: string }) => { countMap[c.department_id] = (countMap[c.department_id] || 0) + 1; });
      rows.forEach(r => { r.member_count = countMap[r.id] || 0; });
    }
    setDepartments(rows);
    setTotal(count || 0);
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [page]);

  useEffect(() => {
    fetchDepts();
    supabase.from('profiles').select('id,full_name').in('role', ['employee','management']).eq('is_active', true).order('full_name').then(({ data }) => setHeads((data || []) as HeadProfile[]));
    const ch = supabase.channel('dept-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, () => fetchDepts(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchDepts]);

  const filtered = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async (v: DeptForm) => {
    setSaving(true);
    const { data, error } = await supabase.from('departments').insert({ name: v.name, head_id: v.head_id || null }).select('*, head:profiles!departments_head_id_fkey(id,full_name)').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Department created');
    if (data) { setHighlightId(data.id); setTimeout(() => setHighlightId(null), 2000); }
    setCreateOpen(false);
    form.reset();
    fetchDepts(true);
  };

  const handleEdit = async (v: DeptForm) => {
    if (!editDept) return;
    setSaving(true);
    const { error } = await supabase.from('departments').update({ name: v.name, head_id: v.head_id || null }).eq('id', editDept.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Department updated');
    setEditDept(null);
    fetchDepts(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('departments').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Department deleted');
    setDeleteId(null);
    fetchDepts(true);
  };

  const exportColumns: ReportColumn[] = [
    { header: 'Department Name', key: 'name' },
    { header: 'Department Head', key: 'head', format: v => (v as any)?.full_name || '—' },
    { header: 'Total Members',   key: 'member_count', format: v => String(v ?? 0) },
    { header: 'Status',          key: 'is_active', format: v => v === false ? 'Inactive' : 'Active' },
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Department Management</h1>
          <p className="text-sm text-muted-foreground">{total} departments total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}><FileDown className="w-4 h-4 mr-1.5"/>Export</Button>
          <Button variant="outline" size="sm" onClick={() => fetchDepts(true)} disabled={refreshing}><RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`}/>Refresh</Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5"/>Add Department</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search departments..." className="pl-9"/>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['Department Name','Department Head','Members','Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 4 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24 bg-muted"/></td>)}
                    </tr>
                  ))
                : filtered.length === 0
                ? <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No departments found. Create your first one.</td></tr>
                : filtered.map(d => (
                    <tr key={d.id} className={`border-b border-border transition-colors hover:bg-muted/20 ${highlightId === d.id ? 'bg-primary/10 animate-pulse' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center flex-wrap gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-primary"/>
                          </div>
                          <span className="font-medium text-foreground">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{d.head?.full_name || <span className="italic text-muted-foreground/60">No head assigned</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">{d.member_count ?? 0} members</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => setViewDept(d)}><Eye className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => { setEditDept(d); editForm.reset({ name: d.name, head_id: d.head_id || '' }); }}><Edit2 className="w-3.5 h-3.5"/></Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4"/></Button>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4"/></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
          <Form {...form}><form onSubmit={form.handleSubmit(handleCreate)} className="space-y-3 mt-2">
            <FormField control={form.control} name="name" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department Name</FormLabel><FormControl><Input {...field} placeholder="e.g. Engineering"/></FormControl><FormMessage/></FormItem>)}/>
            <FormField control={form.control} name="head_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department Head (optional)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select head"/></SelectTrigger></FormControl><SelectContent>{heads.map(h=><SelectItem key={h.id} value={h.id}>{h.full_name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editDept} onOpenChange={v => !v && setEditDept(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Edit Department</DialogTitle></DialogHeader>
          <Form {...editForm}><form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-3 mt-2">
            <FormField control={editForm.control} name="name" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department Name</FormLabel><FormControl><Input {...field}/></FormControl><FormMessage/></FormItem>)}/>
            <FormField control={editForm.control} name="head_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department Head</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select head"/></SelectTrigger></FormControl><SelectContent><SelectItem value="none">None</SelectItem>{heads.map(h=><SelectItem key={h.id} value={h.id}>{h.full_name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={() => setEditDept(null)}>Cancel</Button>
              <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form></Form>
        </DialogContent>
      </Dialog>

      {/* View */}
      <Dialog open={!!viewDept} onOpenChange={v => !v && setViewDept(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Department Details</DialogTitle></DialogHeader>
          {viewDept && (
            <div className="space-y-3 mt-2">
              {[['Name', viewDept.name], ['Department Head', viewDept.head?.full_name || 'Unassigned'], ['Total Members', viewDept.member_count ?? 0]].map(([k, v]) => (
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
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. Employees in this department will lose their department assignment.</AlertDialogDescription>
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
        reportTitle="Department Management Report"
        columns={exportColumns}
        rows={departments as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}
