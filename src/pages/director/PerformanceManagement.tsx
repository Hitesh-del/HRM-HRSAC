import { useEffect, useState, useCallback } from 'react';
import { Plus, Star, Search, Target, FileDown } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { PerformanceReview, KpiGoal, Profile } from '@/types/types';

interface ReviewForm { employee_id:string; review_period_start:string; review_period_end:string; overall_rating:string; technical_skills:string; communication:string; teamwork:string; punctuality:string; comments:string; goals_next_period:string; }

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => <Star key={i} className={`w-3 h-3 ${i<=rating?'text-yellow-400 fill-yellow-400':'text-muted-foreground'}`}/>)}
      <span className="ml-1 text-xs text-muted-foreground">{rating}/5</span>
    </div>
  );
}

export default function PerformanceManagement() {
  const { profile } = useAuth();
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<ReviewForm>({ defaultValues: { employee_id:'',review_period_start:'',review_period_end:'',overall_rating:'',technical_skills:'',communication:'',teamwork:'',punctuality:'',comments:'',goals_next_period:'' } });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: rev }, { data: kpi }] = await Promise.all([
      supabase.from('performance_reviews').select('*, employee:profiles!employee_id(id,full_name), reviewer:profiles!reviewer_id(id,full_name)').order('created_at',{ascending:false}).limit(50),
      supabase.from('kpi_goals').select('*, employee:profiles(id,full_name)').order('created_at',{ascending:false}).limit(50),
    ]);
    setReviews(rev||[]);
    setGoals(kpi||[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    supabase.from('profiles').select('id,full_name').in('role',['employee','management']).eq('is_active',true).order('full_name').then(({data})=>setEmployees((data||[]) as unknown as Profile[]));
  }, [fetchData]);

  const onSubmit = async (v: ReviewForm) => {
    setSaving(true);
    const { error } = await supabase.from('performance_reviews').insert({ employee_id:v.employee_id, reviewer_id:profile!.id, review_period_start:v.review_period_start, review_period_end:v.review_period_end, overall_rating:v.overall_rating?Number(v.overall_rating):null, technical_skills:v.technical_skills?Number(v.technical_skills):null, communication:v.communication?Number(v.communication):null, teamwork:v.teamwork?Number(v.teamwork):null, punctuality:v.punctuality?Number(v.punctuality):null, comments:v.comments||null, goals_next_period:v.goals_next_period||null });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Performance review saved');
    setCreateOpen(false);
    form.reset();
    fetchData();
    setSaving(false);
  };

  type ReviewExtended = PerformanceReview & { employee?:{full_name?:string}; reviewer?:{full_name?:string} };
  type GoalExtended = KpiGoal & { employee?:{full_name?:string} };
  const filteredReviews = (reviews as ReviewExtended[]).filter(r => (r.employee?.full_name||'').toLowerCase().includes(search.toLowerCase()));
  const filteredGoals = (goals as GoalExtended[]).filter(g => (g.employee?.full_name||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Performance Management</h1><p className="text-sm text-muted-foreground">Reviews, KPIs and goal tracking</p></div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5"/>Add Review</Button></DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <DialogHeader><DialogTitle>Performance Review</DialogTitle></DialogHeader>
            <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2 max-h-[70vh] overflow-y-auto pr-1">
              <FormField control={form.control} name="employee_id" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Employee</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select employee"/></SelectTrigger></FormControl><SelectContent>{employees.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="review_period_start" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Period Start</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="review_period_end" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Period End</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
                {[['overall_rating','Overall Rating'],['technical_skills','Technical Skills'],['communication','Communication'],['teamwork','Teamwork'],['punctuality','Punctuality']].map(([name,label])=>(
                  <FormField key={name} control={form.control} name={name as keyof ReviewForm} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">{label} (1-5)</FormLabel><FormControl><Input {...field} type="number" min="1" max="5"/></FormControl><FormMessage/></FormItem>)}/>
                ))}
              </div>
              <FormField control={form.control} name="comments" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Comments</FormLabel><FormControl><Textarea {...field} rows={3}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="goals_next_period" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Goals (Next Period)</FormLabel><FormControl><Textarea {...field} rows={2}/></FormControl><FormMessage/></FormItem>)}/>
              <div className="flex flex-wrap gap-2 pt-1"><Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Saving...':'Save Review'}</Button></div>
            </form></Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee..." className="pl-9"/></div>
      <Tabs defaultValue="reviews">
        <TabsList className="w-full md:w-auto"><TabsTrigger value="reviews" className="flex-1 md:flex-none whitespace-nowrap">Reviews ({reviews.length})</TabsTrigger><TabsTrigger value="goals" className="flex-1 md:flex-none whitespace-nowrap">KPI Goals ({goals.length})</TabsTrigger></TabsList>
        <TabsContent value="reviews" className="mt-4">
          <Card><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">{['Employee','Period','Overall','Technical','Communication','Teamwork','Reviewer'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {loading?Array.from({length:4}).map((_,i)=><tr key={i} className="border-b border-border">{Array.from({length:7}).map((_,j)=><td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16"/></td>)}</tr>)
                :filteredReviews.length===0?<tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No reviews found</td></tr>
                :filteredReviews.map(r=>(
                  <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{r.employee?.full_name||'—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(r.review_period_start).toLocaleDateString()} – {new Date(r.review_period_end).toLocaleDateString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StarRating rating={r.overall_rating}/></td>
                    <td className="px-4 py-3 whitespace-nowrap"><StarRating rating={r.technical_skills}/></td>
                    <td className="px-4 py-3 whitespace-nowrap"><StarRating rating={r.communication}/></td>
                    <td className="px-4 py-3 whitespace-nowrap"><StarRating rating={r.teamwork}/></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{r.reviewer?.full_name||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        </TabsContent>
        <TabsContent value="goals" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading?Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-24"/></CardContent></Card>)
            :filteredGoals.length===0?<div className="col-span-full text-center py-12 text-muted-foreground">No goals found</div>
            :filteredGoals.map(g=>(
              <Card key={g.id} className="h-full">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2 mb-2"><Target className="w-4 h-4 text-primary shrink-0 mt-0.5"/><div className="flex-1 min-w-0"><h4 className="font-medium text-foreground truncate">{g.title}</h4><p className="text-xs text-muted-foreground">{g.employee?.full_name||'—'}</p></div><Badge variant="outline" className={g.is_completed?'border-green-500/30 text-green-400 bg-green-500/10':'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'}>{g.is_completed?'Done':'Active'}</Badge></div>
                  {g.target_value!=null&&<div className="mt-3"><div className="flex justify-between flex-wrap gap-2 text-xs mb-1"><span className="text-muted-foreground">Progress</span><span>{g.current_value}/{g.target_value} {g.unit||''}</span></div><div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${Math.min(100,(g.current_value/g.target_value)*100)}%`}}/></div></div>}
                  {g.due_date&&<p className="text-xs text-muted-foreground mt-2">Due: {new Date(g.due_date).toLocaleDateString()}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Performance Management Report"
        columns={[
          { header: 'Employee',          key: 'employee',            format: v => (v as any)?.full_name || '—' },
          { header: 'Period Start',      key: 'review_period_start' },
          { header: 'Period End',        key: 'review_period_end' },
          { header: 'Overall Rating',    key: 'overall_rating',      format: v => String(v ?? '—') },
          { header: 'Technical Skills',  key: 'technical_skills',    format: v => String(v ?? '—') },
          { header: 'Communication',     key: 'communication',       format: v => String(v ?? '—') },
          { header: 'Teamwork',          key: 'teamwork',            format: v => String(v ?? '—') },
          { header: 'Punctuality',       key: 'punctuality',         format: v => String(v ?? '—') },
        ] satisfies ReportColumn[]}
        rows={reviews as unknown as Record<string, unknown>[]}
        dateKey="review_period_start"
      />
    </div>
  );
}
