import { useEffect, useState, useCallback } from 'react';
import { Plus, Star, Edit, TrendingUp, Target, Clock, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/types';

interface Review {
  id: string; employee_id: string; reviewer_id: string;
  review_period_start: string; review_period_end: string;
  overall_rating?: number; kpi_score?: number; attendance_score?: number; task_completion_score?: number;
  technical_skills?: number; communication?: number; teamwork?: number;
  comments?: string; goals_next_period?: string; review_status: string; created_at: string;
  employee?: { full_name?: string; employee_id?: string; department?: { name?: string } | null } | null;
  reviewer?: { full_name?: string } | null;
}
interface ReviewForm {
  employee_id: string; review_period_start: string; review_period_end: string;
  kpi_score: string; attendance_score: string; task_completion_score: string;
  technical_skills: string; communication: string; teamwork: string;
  overall_rating: string; comments: string; goals_next_period: string; review_status: string;
}

const REVIEW_STATUS_STYLES: Record<string, string> = {
  draft:     'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  submitted: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  approved:  'border-green-500/30 text-green-400 bg-green-500/10',
};

function StarRating({ value, max = 5 }: { value?: number | null; max?: number }) {
  const v = value || 0;
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < v ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{v > 0 ? v.toFixed(1) : '—'}</span>
    </div>
  );
}

function ScoreBar({ label, score, icon: Icon }: { label: string; score?: number | null; icon: React.ElementType }) {
  const pct = Math.min(100, ((score || 0) / 5) * 100);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap justify-between items-center gap-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="w-3 h-3" />{label}</div>
        <span className="text-xs font-medium text-foreground">{score ? score.toFixed(1) : '—'}/5</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MgmtPerformance() {
  const { profile } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [viewReview, setViewReview] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<ReviewForm>({
    defaultValues: {
      employee_id: '', review_period_start: '', review_period_end: '',
      kpi_score: '', attendance_score: '', task_completion_score: '',
      technical_skills: '', communication: '', teamwork: '',
      overall_rating: '', comments: '', goals_next_period: '', review_status: 'draft',
    },
  });

  const fetchReviews = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase.from('profiles').select('id').eq('department_id', profile.department_id).in('role', ['employee', 'management']);
    const ids = (members || []).map(m => m.id);
    if (!ids.length) { setReviews([]); setLoading(false); return; }
    const { data } = await supabase
      .from('performance_reviews')
      .select('id,employee_id,reviewer_id,review_period_start,review_period_end,overall_rating,kpi_score,attendance_score,task_completion_score,technical_skills,communication,teamwork,comments,goals_next_period,review_status,created_at,employee:profiles!employee_id(full_name,employee_id,department:departments(name)),reviewer:profiles!reviewer_id(full_name)')
      .in('employee_id', ids)
      .order('created_at', { ascending: false });
    setReviews((data || []) as unknown as Review[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchReviews();
    if (profile?.department_id) {
      supabase.from('profiles').select('id,full_name,employee_id').eq('department_id', profile.department_id).in('role', ['employee', 'management']).eq('is_active', true).order('full_name')
        .then(({ data }) => setTeamMembers((data || []) as unknown as Profile[]));
    }
  }, [fetchReviews, profile]);

  useEffect(() => {
    if (!profile?.department_id) return;
    const ch = supabase.channel('perf-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'performance_reviews' }, () => fetchReviews()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, fetchReviews]);

  const openCreate = () => {
    setEditingReview(null);
    form.reset({ employee_id:'', review_period_start:'', review_period_end:'', kpi_score:'', attendance_score:'', task_completion_score:'', technical_skills:'', communication:'', teamwork:'', overall_rating:'', comments:'', goals_next_period:'', review_status:'draft' });
    setDialogOpen(true);
  };
  const openEdit = (r: Review) => {
    setEditingReview(r);
    form.reset({
      employee_id: r.employee_id, review_period_start: r.review_period_start, review_period_end: r.review_period_end,
      kpi_score: String(r.kpi_score ?? ''), attendance_score: String(r.attendance_score ?? ''),
      task_completion_score: String(r.task_completion_score ?? ''), technical_skills: String(r.technical_skills ?? ''),
      communication: String(r.communication ?? ''), teamwork: String(r.teamwork ?? ''),
      overall_rating: String(r.overall_rating ?? ''), comments: r.comments || '', goals_next_period: r.goals_next_period || '',
      review_status: r.review_status,
    });
    setDialogOpen(true);
  };

  const num = (v: string) => v ? Number(v) : null;

  const onSubmit = async (v: ReviewForm) => {
    setSaving(true);
    const payload = {
      employee_id: v.employee_id, reviewer_id: profile!.id,
      review_period_start: v.review_period_start, review_period_end: v.review_period_end,
      kpi_score: num(v.kpi_score), attendance_score: num(v.attendance_score),
      task_completion_score: num(v.task_completion_score), technical_skills: num(v.technical_skills),
      communication: num(v.communication), teamwork: num(v.teamwork),
      overall_rating: num(v.overall_rating), comments: v.comments || null,
      goals_next_period: v.goals_next_period || null, review_status: v.review_status,
    };
    const { error } = editingReview
      ? await supabase.from('performance_reviews').update(payload).eq('id', editingReview.id)
      : await supabase.from('performance_reviews').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editingReview ? 'Review updated' : 'Review saved');
    setDialogOpen(false);
    fetchReviews();
    setSaving(false);
  };

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / reviews.length) : 0;
  const submitted = reviews.filter(r => r.review_status === 'submitted').length;
  const approved  = reviews.filter(r => r.review_status === 'approved').length;

  const SCORE_FIELDS: [string, string, React.ElementType][] = [
    ['kpi_score', 'KPI Score', Target],
    ['attendance_score', 'Attendance Score', Clock],
    ['task_completion_score', 'Task Completion', CheckSquare],
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Performance Tracking</h1>
          <p className="text-sm text-muted-foreground">Review and track department performance</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5 shrink-0"><Plus className="w-4 h-4" /> New Review</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Reviews', value: reviews.length, icon: TrendingUp, cls: 'text-primary' },
          { label: 'Avg Rating', value: avgRating.toFixed(1), icon: Star, cls: 'text-yellow-400' },
          { label: 'Submitted', value: submitted, icon: CheckSquare, cls: 'text-blue-400' },
          { label: 'Approved', value: approved, icon: Target, cls: 'text-green-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center flex-wrap gap-3">
              <Icon className={`w-7 h-7 ${cls} shrink-0`} />
              <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold text-foreground">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
            <TrendingUp className="w-4 h-4" /> Performance Reviews ({reviews.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Employee', 'Department', 'Period', 'KPI Score', 'Attendance', 'Task Completion', 'Overall Rating', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                : reviews.length === 0
                  ? <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No performance reviews yet. Click "New Review" to get started.</td></tr>
                  : reviews.map(r => (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewReview(r)}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{(r.employee as any)?.full_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{(r.employee as any)?.employee_id || ''}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{(r.employee?.department as any)?.name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.review_period_start).toLocaleDateString()} –<br />{new Date(r.review_period_end).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap"><StarRating value={r.kpi_score} /></td>
                        <td className="px-4 py-3 whitespace-nowrap"><StarRating value={r.attendance_score} /></td>
                        <td className="px-4 py-3 whitespace-nowrap"><StarRating value={r.task_completion_score} /></td>
                        <td className="px-4 py-3 whitespace-nowrap"><StarRating value={r.overall_rating} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${REVIEW_STATUS_STYLES[r.review_status] || ''}`}>{r.review_status}</Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(r)}><Edit className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingReview ? 'Edit Review' : 'New Performance Review'}</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="employee_id" rules={{ required: 'Employee is required' }} render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>Employee</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={!!editingReview}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>{teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.employee_id})</SelectItem>)}</SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="review_period_start" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>Period Start</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="review_period_end" rules={{ required: 'Required' }} render={({ field }) => (
                  <FormItem><FormLabel>Period End</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <p className="text-sm font-medium text-foreground">Performance Scores (1–5)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SCORE_FIELDS.map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name as keyof ReviewForm} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{label}</FormLabel>
                      <FormControl><Input type="number" min="1" max="5" step="0.1" placeholder="1-5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
                {[['technical_skills','Technical Skills'],['communication','Communication'],['teamwork','Teamwork']].map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name as keyof ReviewForm} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{label}</FormLabel>
                      <FormControl><Input type="number" min="1" max="5" step="0.1" placeholder="1-5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
                <FormField control={form.control} name="overall_rating" rules={{ required: 'Required', min: { value: 1, message: 'Min 1' }, max: { value: 5, message: 'Max 5' } }} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Overall Rating *</FormLabel>
                    <FormControl><Input type="number" min="1" max="5" step="0.1" placeholder="1-5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="review_status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="comments" render={({ field }) => (
                <FormItem><FormLabel>Comments</FormLabel><FormControl><Textarea rows={3} placeholder="Add performance comments..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="goals_next_period" render={({ field }) => (
                <FormItem><FormLabel>Goals for Next Period</FormLabel><FormControl><Textarea rows={2} placeholder="Outline goals..." {...field} /></FormControl><FormMessage /></FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingReview ? 'Update' : 'Submit Review'}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!viewReview} onOpenChange={v => !v && setViewReview(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Detail – {(viewReview?.employee as any)?.full_name || ''}</DialogTitle>
          </DialogHeader>
          {viewReview && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`text-xs ${REVIEW_STATUS_STYLES[viewReview.review_status] || ''}`}>{viewReview.review_status}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(viewReview.review_period_start).toLocaleDateString()} – {new Date(viewReview.review_period_end).toLocaleDateString()}</span>
              </div>
              <div className="space-y-2.5">
                {SCORE_FIELDS.map(([key, label, Icon]) => (
                  <ScoreBar key={key} label={label} score={(viewReview as any)[key]} icon={Icon} />
                ))}
                {[['technical_skills','Technical Skills',Target],['communication','Communication',CheckSquare],['teamwork','Teamwork',TrendingUp]].map(([key, label, Icon]) => (
                  <ScoreBar key={key as string} label={label as string} score={(viewReview as any)[key as string]} icon={Icon as React.ElementType} />
                ))}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-border">
                <span className="text-sm font-medium text-foreground">Overall Rating</span>
                <StarRating value={viewReview.overall_rating} />
              </div>
              {viewReview.comments && <div><p className="text-xs font-medium text-muted-foreground mb-1">Comments</p><p className="text-sm text-foreground text-pretty">{viewReview.comments}</p></div>}
              {viewReview.goals_next_period && <div><p className="text-xs font-medium text-muted-foreground mb-1">Goals Next Period</p><p className="text-sm text-foreground text-pretty">{viewReview.goals_next_period}</p></div>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewReview(null)}>Close</Button>
                <Button onClick={() => { setViewReview(null); openEdit(viewReview); }}>Edit Review</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
