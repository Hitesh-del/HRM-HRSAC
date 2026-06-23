import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Tag, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';

interface LeaveType {
  id: string;
  name: string;
  description: string | null;
  max_days_per_year: number;
  carry_forward: boolean;
  is_active: boolean;
  created_at: string;
}

interface LTForm {
  name: string;
  description: string;
  max_days_per_year: string;
  carry_forward: string;
}

const PAGE_SIZE = 10;

export default function LeaveTypeManagement() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<LTForm>({ defaultValues: { name: '', description: '', max_days_per_year: '10', carry_forward: 'false' } });
  const editForm = useForm<LTForm>({ defaultValues: { name: '', description: '', max_days_per_year: '10', carry_forward: 'false' } });

  const fetchTypes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const from = page * PAGE_SIZE;
    let q = supabase.from('leave_types').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (search) q = q.ilike('name', `%${search}%`);
    const { data, count } = await q;
    setTypes(data || []);
    setTotal(count || 0);
    if (!silent) setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  // Real-time sync
  useEffect(() => {
    const ch = supabase.channel('leave-types-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_types' }, () => fetchTypes(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchTypes]);

  const onCreate = async (v: LTForm) => {
    setSaving(true);
    const { error } = await supabase.from('leave_types').insert({
      name: v.name.trim(),
      description: v.description.trim() || null,
      max_days_per_year: Number(v.max_days_per_year) || 10,
      carry_forward: v.carry_forward === 'true',
      is_active: true,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Leave type created');
    setCreateOpen(false);
    form.reset();
    setSaving(false);
  };

  const onEdit = async (v: LTForm) => {
    if (!editTarget) return;
    setSaving(true);
    const { error } = await supabase.from('leave_types').update({
      name: v.name.trim(),
      description: v.description.trim() || null,
      max_days_per_year: Number(v.max_days_per_year) || 10,
      carry_forward: v.carry_forward === 'true',
    }).eq('id', editTarget.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Leave type updated');
    setEditTarget(null);
    setSaving(false);
  };

  const openEdit = (lt: LeaveType) => {
    setEditTarget(lt);
    editForm.reset({ name: lt.name, description: lt.description || '', max_days_per_year: String(lt.max_days_per_year), carry_forward: String(lt.carry_forward) });
  };

  const toggleActive = async (lt: LeaveType) => {
    const { error } = await supabase.from('leave_types').update({ is_active: !lt.is_active }).eq('id', lt.id);
    if (error) { toast.error(error.message); return; }
    toast.success(lt.is_active ? 'Leave type deactivated' : 'Leave type activated');
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // Check if used in existing leave requests
    const { count } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('leave_type_id', deleteTarget.id);
    if (count && count > 0) {
      toast.error('Cannot delete — this leave type is used in existing leave requests.');
      setDeleting(false);
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from('leave_types').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success('Leave type deleted');
    setDeleteTarget(null);
    setDeleting(false);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const LeaveTypeForm = ({ f, onSubmit, submitLabel }: { f: typeof form; onSubmit: (v: LTForm) => void; submitLabel: string }) => (
    <Form {...f}>
      <form onSubmit={f.handleSubmit(onSubmit)} className="space-y-3 mt-2">
        <FormField control={f.control} name="name" rules={{ required: 'Required' }} render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-normal">Leave Type Name</FormLabel>
            <FormControl><Input {...field} placeholder="e.g. Casual Leave" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={f.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-normal">Description</FormLabel>
            <FormControl><Textarea {...field} rows={2} placeholder="Brief description..." /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField control={f.control} name="max_days_per_year" rules={{ required: 'Required' }} render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-normal">Max Days / Year</FormLabel>
              <FormControl><Input {...field} type="number" min="0" max="365" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={f.control} name="carry_forward" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-normal">Carry Forward</FormLabel>
              <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Saving...' : submitLabel}</Button>
        </div>
      </form>
    </Form>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Leave Type Management</h1>
          <p className="text-sm text-muted-foreground">Define leave types available to employees</p>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => fetchTypes()} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1.5" />Add Leave Type</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
              <DialogHeader><DialogTitle>Add Leave Type</DialogTitle></DialogHeader>
              <LeaveTypeForm f={form} onSubmit={onCreate} submitLabel="Create" />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search leave types..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Leave Type', 'Description', 'Max Days/Year', 'Carry Forward', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                  : types.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No leave types found</td></tr>
                    : types.map(lt => (
                      <tr key={lt.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center flex-wrap gap-2">
                            <Tag className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-medium text-foreground">{lt.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px] whitespace-nowrap">
                          <p className="truncate text-muted-foreground text-xs">{lt.description || '—'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{lt.max_days_per_year}d</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${lt.carry_forward ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-muted-foreground/30 text-muted-foreground'}`}>
                            {lt.carry_forward ? 'Yes' : 'No'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${lt.is_active ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                            {lt.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(lt)} title="Edit">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => toggleActive(lt)} title={lt.is_active ? 'Deactivate' : 'Activate'}>
                              {lt.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(lt)} title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">{total} total</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs px-2">Prev</Button>
                <span className="text-xs text-muted-foreground px-1">{page + 1}/{totalPages}</span>
                <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs px-2">Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Edit Leave Type</DialogTitle></DialogHeader>
          <LeaveTypeForm f={editForm} onSubmit={onEdit} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Type</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone. Leave types in use by existing requests cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
