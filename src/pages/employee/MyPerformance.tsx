import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground text-xs">—</span>;
  return <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} className={`w-3.5 h-3.5 ${i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />)}</div>;
}

export default function MyPerformance() {
  const { profile } = useAuth();
  const [reviews, setReviews] = useState<{ id: string; review_period_start: string; review_period_end: string; overall_rating?: number; comments?: string; reviewer?: { full_name?: string } }[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string; status: string; progress: number; target_date?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      supabase.from('performance_reviews').select('id,review_period_start,review_period_end,overall_rating,comments,reviewer:profiles!reviewer_id(full_name)').eq('employee_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('kpi_goals').select('id,title,status,progress,target_date').eq('employee_id', profile.id).order('created_at', { ascending: false }),
    ]).then(([{ data: rev }, { data: g }]) => {
      setReviews((rev || []) as any);
      setGoals((g || []) as any);
      setLoading(false);
    });
  }, [profile]);

  const avgRating = reviews.filter(r => r.overall_rating).reduce((s, r, _, a) => s + (r.overall_rating || 0) / a.length, 0);
  const STATUS_STYLES: Record<string, string> = { not_started: 'border-muted-foreground/30 text-muted-foreground', in_progress: 'border-blue-500/30 text-blue-400 bg-blue-500/10', completed: 'border-green-500/30 text-green-400 bg-green-500/10', cancelled: 'border-red-500/30 text-red-400 bg-red-500/10' };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">My Performance</h1><p className="text-sm text-muted-foreground">Reviews and goal tracking</p></div>
      {!loading && reviews.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4 text-center"><p className="text-xl md:text-2xl font-bold text-primary">{avgRating.toFixed(1)}</p><div className="flex justify-center mt-1"><StarRating rating={Math.round(avgRating)} /></div><p className="text-xs text-muted-foreground mt-1">Avg Rating</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xl md:text-2xl font-bold text-foreground">{reviews.length}</p><p className="text-xs text-muted-foreground mt-1">Total Reviews</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-xl md:text-2xl font-bold text-green-400">{goals.filter(g => g.status === 'completed').length}</p><p className="text-xs text-muted-foreground mt-1">Goals Completed</p></CardContent></Card>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Performance Reviews</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : reviews.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No reviews yet</p> : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="py-2 border-b border-border last:border-0">
                    <div className="flex justify-between flex-wrap gap-2 items-start gap-2">
                      <div><p className="text-xs font-medium text-foreground">{new Date(r.review_period_start).toLocaleDateString()} – {new Date(r.review_period_end).toLocaleDateString()}</p><p className="text-xs text-muted-foreground">By {r.reviewer?.full_name || '—'}</p></div>
                      <StarRating rating={r.overall_rating || null} />
                    </div>
                    {r.comments && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.comments}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">My Goals</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : goals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No goals set</p> : (
              <div className="space-y-3">
                {goals.map(g => (
                  <div key={g.id} className="py-2 border-b border-border last:border-0">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-foreground truncate">{g.title}</h4>
                      <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_STYLES[g.status] || ''}`}>{g.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="flex items-center flex-wrap gap-2"><div className="h-1.5 flex-1 min-w-0 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${g.progress}%` }} /></div><span className="text-xs text-muted-foreground shrink-0">{g.progress}%</span></div>
                    {g.target_date && <p className="text-xs text-muted-foreground mt-1">Target: {new Date(g.target_date).toLocaleDateString()}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
