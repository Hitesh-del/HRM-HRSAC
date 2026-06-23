import { useEffect, useState } from 'react';
import { Gift, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Holiday } from '@/types/types';

const TYPE_STYLES: Record<string, string> = {
  public:    'border-blue-500/30 text-blue-400 bg-blue-500/10',
  festival:  'border-purple-500/30 text-purple-400 bg-purple-500/10',
  company:   'border-green-500/30 text-green-400 bg-green-500/10',
  annual:    'border-orange-500/30 text-orange-400 bg-orange-500/10',
  emergency: 'border-red-500/30 text-red-400 bg-red-500/10',
};

const TYPE_LABELS: Record<string, string> = {
  public: 'Public', festival: 'Festival', company: 'Company Event',
  annual: 'Annual Day', emergency: 'Emergency',
};

export default function UpcomingHolidaysWidget() {
  const { companySettings } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companySettings) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('holidays')
      .select('*')
      .eq('company_settings_id', companySettings.id)
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        setHolidays((data || []) as Holiday[]);
        setLoading(false);
      });

    const ch = supabase.channel('upcoming-holidays-widget')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holidays' }, async () => {
        const { data } = await supabase
          .from('holidays')
          .select('*')
          .eq('company_settings_id', companySettings.id)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(5);
        setHolidays((data || []) as Holiday[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companySettings]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary" />
          Upcoming Holidays
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 bg-muted" />)}</div>
        ) : holidays.length === 0 ? (
          <div className="flex flex-col items-center py-4 gap-1 text-center">
            <CalendarDays className="w-7 h-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No upcoming holidays</p>
          </div>
        ) : (
          <div className="space-y-2">
            {holidays.map(h => {
              const d = new Date(h.date + 'T12:00:00');
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
              return (
                <div key={h.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary leading-none">
                      {d.toLocaleDateString('en', { day: '2-digit' })}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {d.toLocaleDateString('en', { month: 'short' })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${TYPE_STYLES[h.type] || ''}`}>
                    {TYPE_LABELS[h.type] || h.type}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
