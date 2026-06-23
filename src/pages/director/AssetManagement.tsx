import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Package, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import type { Asset, Profile } from '@/types/types';
import { notifyAssetAssigned } from '@/lib/notifications';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportColumn } from '@/lib/reportExport';

const STATUS_STYLES: Record<string,string> = {
  available:'border-green-500/30 text-green-400 bg-green-500/10',
  assigned:'border-blue-500/30 text-blue-400 bg-blue-500/10',
  maintenance:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  retired:'border-muted-foreground/30 text-muted-foreground bg-muted/10',
};

interface AssetForm { name:string; asset_code:string; category:string; purchase_date:string; purchase_price:string; notes:string; }

export default function AssetManagement() {
  const { companySettings } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<AssetForm>({ defaultValues: { name:'',asset_code:'',category:'',purchase_date:'',purchase_price:'',notes:'' } });

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('assets').select('*, assignee:profiles(id,full_name)').order('created_at',{ascending:false});
    if (statusFilter!=='all') q = q.eq('status',statusFilter);
    const { data } = await q;
    setAssets(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchAssets();
    supabase.from('profiles').select('id,full_name').in('role',['employee','management']).eq('is_active',true).order('full_name').then(({data})=>setEmployees((data||[]) as unknown as Profile[]));
  }, [fetchAssets]);

  const onSubmit = async (v: AssetForm) => {
    setSaving(true);
    const { error } = await supabase.from('assets').insert({ name:v.name, asset_code:v.asset_code, category:v.category, purchase_date:v.purchase_date||null, purchase_price:v.purchase_price?Number(v.purchase_price):null, notes:v.notes||null, status:'available' });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Asset registered');
    setCreateOpen(false);
    form.reset();
    fetchAssets();
    setSaving(false);
  };

  const assignAsset = async (assetId: string, employeeId: string) => {
    if (employeeId === 'unassign') {
      await supabase.from('assets').update({ status:'available', assigned_to:null, assigned_at:null }).eq('id',assetId);
    } else {
      await supabase.from('assets').update({ status:'assigned', assigned_to:employeeId, assigned_at:new Date().toISOString() }).eq('id',assetId);
      // Notify assigned user
      const asset = (assets as (Asset & { assignee?: { full_name?: string } })[]).find(a => a.id === assetId);
      if (asset) notifyAssetAssigned(employeeId, asset.name, asset.asset_code);
    }
    fetchAssets();
  };

  type AssetExtended = Asset & { assignee?:{full_name?:string} };
  const categories = [...new Set(assets.map(a=>a.category))].filter(Boolean);
  const filtered = (assets as AssetExtended[]).filter(a =>
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.asset_code.toLowerCase().includes(search.toLowerCase())) &&
    (categoryFilter==='all' || a.category===categoryFilter)
  );

  const exportCols: ReportColumn[] = [
    { header: 'Asset Code',    key: 'asset_code' },
    { header: 'Asset Name',    key: 'name' },
    { header: 'Category',      key: 'category' },
    { header: 'Status',        key: 'status' },
    { header: 'Assigned To',   key: 'assignee', format: v => (v as any)?.full_name ?? '—' },
    { header: 'Purchase Date', key: 'purchase_date' },
    { header: 'Price ($)',     key: 'purchase_price', format: v => v != null ? `$${Number(v).toLocaleString()}` : '—' },
    { header: 'Notes',         key: 'notes', format: v => String(v ?? '') },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Asset Management</h1><p className="text-sm text-muted-foreground">Track and manage company assets</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5"/>Add Asset</Button></DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
            <DialogHeader><DialogTitle>Register Asset</DialogTitle></DialogHeader>
            <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="name" rules={{required:'Required'}} render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Asset Name</FormLabel><FormControl><Input {...field} placeholder="Dell Laptop"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="asset_code" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Asset Code</FormLabel><FormControl><Input {...field} placeholder="AST-001"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="category" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Category</FormLabel><FormControl><Input {...field} placeholder="Laptop"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="purchase_date" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Purchase Date</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="purchase_price" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Price ($)</FormLabel><FormControl><Input {...field} type="number" placeholder="1200"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="notes" render={({field})=>(<FormItem className="col-span-2"><FormLabel className="text-sm font-normal">Notes</FormLabel><FormControl><Input {...field} placeholder="Optional notes..."/></FormControl><FormMessage/></FormItem>)}/>
              </div>
              <div className="flex flex-wrap gap-2 pt-1"><Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Saving...':'Register'}</Button></div>
            </form></Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[10rem]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search assets..." className="pl-9"/></div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-full md:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full md:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="available">Available</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">{['Asset','Code','Category','Purchase Date','Price','Assigned To','Status','Assign'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {loading?Array.from({length:5}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:8}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16"/></td>)}</tr>)
              :filtered.length===0?<tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No assets found</td></tr>
              :filtered.map(a=>(
                <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap"><div className="flex items-center flex-wrap gap-2"><Package className="w-4 h-4 text-muted-foreground"/><span className="font-medium text-foreground">{a.name}</span></div></td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{a.asset_code}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{a.category}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{a.purchase_date?new Date(a.purchase_date).toLocaleDateString():'—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{a.purchase_price?`$${a.purchase_price.toLocaleString()}`:'—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{a.assignee?.full_name||'—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Badge variant="outline" className={STATUS_STYLES[a.status]||''}>{a.status}</Badge></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Select onValueChange={v=>assignAsset(a.id,v)} value={a.assigned_to||'unassign'}>
                      <SelectTrigger className="h-7 w-full md:w-36 text-xs"><SelectValue placeholder="Assign to..."/></SelectTrigger>
                      <SelectContent><SelectItem value="unassign">Unassigned</SelectItem>{employees.map(e=><SelectItem key={e.id} value={e.id} className="text-xs">{e.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Asset Management Report"
        columns={exportCols}
        rows={(assets as unknown as Record<string, unknown>[])}
        dateKey="purchase_date"
      />
    </div>
  );
}
