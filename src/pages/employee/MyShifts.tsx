import { useEffect, useState, useCallback } from 'react';
import { Clock, Sun, Moon, Sunset, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Assignment {
  id: string; effective_from: string; effective_to: string | null;
  shift?: { name: string; shift_type: string; start_time: string; end_time: string; description?: string | null } | null;
}

const SHIFT_COLORS: Record<string, string> = {
  morning: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  evening: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  night:   'border-blue-500/30 text-blue-400 bg-blue-500/10',
  general: 'border-green-500/30 text-green-400 bg-green-500/10',
};

const SHIFT_LABELS: Record<string, string> = {
  morning: 'Morning Shift', evening: 'Evening Shift', night: 'Night Shift', general: 'General Shift',
};

function ShiftIcon({ type }: { type: string }) {
  if (type === 'morning') return <Sun className="w-5 h-5 text-yellow-400" />;
  if (type === 'evening') return <Sunset className="w-5 h-5 text-orange-400" />;
  if (type === 'night')   return <Moon className="w-5 h-5 text-blue-400" />;
  return <Clock className="w-5 h-5 text-green-400" />;
}

function formatTime(t: string) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12).toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} ${ampm}`;
}

export default function MyShifts() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShifts = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('shift_assignments')
      .select('id,effective_from,effective_to,shift:shifts(name,shift_type,start_time,end_time,description)')
      .eq('employee_id', profile.id)
      .order('effective_from', { ascending: false });
    setAssignments((data || []) as unknown as Assignment[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('my-shifts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_assignments', filter: `employee_id=eq.${profile.id}` }, () => fetchShifts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, fetchShifts]);

  const today = new Date().toISOString().split('T')[0];
  const activeShifts = assignments.filter(a => {
    const from = a.effective_from <= today;
    const to = !a.effective_to || a.effective_to >= today;
    return from && to;
  });

  const currentShift = activeShifts[0] || null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground text-balance">My Shifts</h1>
        <p className="text-sm text-muted-foreground">View your assigned work shifts</p>
      </div>

      {/* Current Shift Highlight */}
      {loading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : currentShift?.shift ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium mb-3">CURRENT ACTIVE SHIFT</p>
            <div className="flex items-center gap-4 flex-wrap">
              <ShiftIcon type={(currentShift.shift as any).shift_type} />
              <div className="min-w-0">
                <p className="text-xl font-bold text-foreground">{(currentShift.shift as any).name}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <Badge variant="outline" className={`text-xs ${SHIFT_COLORS[(currentShift.shift as any).shift_type] || ''}`}>
                    {SHIFT_LABELS[(currentShift.shift as any).shift_type] || (currentShift.shift as any).shift_type}
                  </Badge>
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime((currentShift.shift as any).start_time)} – {formatTime((currentShift.shift as any).end_time)}
                  </span>
                </div>
                {(currentShift.shift as any).description && (
                  <p className="text-xs text-muted-foreground mt-1.5">{(currentShift.shift as any).description}</p>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              Effective from {new Date(currentShift.effective_from).toLocaleDateString()}
              {currentShift.effective_to && ` to ${new Date(currentShift.effective_to).toLocaleDateString()}`}
              {!currentShift.effective_to && ' — Ongoing'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-4 md:p-6 text-center space-y-2">
            <Clock className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No active shift assigned</p>
            <p className="text-sm text-muted-foreground">Your department manager will assign a shift to you.</p>
          </CardContent>
        </Card>
      )}

      {/* All Assignments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center flex-wrap gap-2">
            <Calendar className="w-4 h-4" /> All Shift Assignments ({assignments.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Shift Name', 'Type', 'Time', 'From', 'To', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}
                    </tr>
                  ))
                : assignments.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No shift assignments found</td></tr>
                  : assignments.map(a => {
                      const isActive = a.effective_from <= today && (!a.effective_to || a.effective_to >= today);
                      const shift = a.shift as any;
                      return (
                        <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{shift?.name || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {shift ? (
                              <div className="flex items-center gap-1.5">
                                <ShiftIcon type={shift.shift_type} />
                                <Badge variant="outline" className={`text-xs ${SHIFT_COLORS[shift.shift_type] || ''}`}>
                                  {SHIFT_LABELS[shift.shift_type] || shift.shift_type}
                                </Badge>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">
                            {shift ? `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}` : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{new Date(a.effective_from).toLocaleDateString()}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{a.effective_to ? new Date(a.effective_to).toLocaleDateString() : 'Ongoing'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isActive
                              ? <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/10">Active</Badge>
                              : <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground bg-muted/10">Ended</Badge>}
                          </td>
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
