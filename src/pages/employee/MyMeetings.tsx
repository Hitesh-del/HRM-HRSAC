import { useState, useEffect, useCallback } from 'react';
import { Video, Play, Clock, Calendar, Users, Search } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JitsiMeetModal } from '@/components/common/JitsiMeetModal';
import type { Meeting, MeetingStatus, MeetingType } from '@/types/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MeetingType, string> = {
  department: 'Department',
  team: 'Team',
  one_on_one: 'One-on-One',
  all_hands: 'All Hands',
};

const STATUS_STYLES: Record<MeetingStatus, string> = {
  scheduled: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  in_progress: 'border-green-500/30 text-green-400 bg-green-500/10',
  ended: 'border-muted-foreground/30 text-muted-foreground bg-muted/30',
  cancelled: 'border-destructive/30 text-destructive bg-destructive/10',
};

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

function getLiveStatus(meeting: { start_time: string; end_time: string; status: MeetingStatus }): MeetingStatus {
  if (meeting.status === 'cancelled' || meeting.status === 'ended') return meeting.status;
  const now = Date.now();
  const start = new Date(meeting.start_time).getTime();
  const end = new Date(meeting.end_time).getTime();
  if (now >= start && now <= end) return 'in_progress';
  if (now > end) return 'ended';
  return 'scheduled';
}

function canJoin(meeting: { start_time: string; end_time: string; status: MeetingStatus }): boolean {
  const s = getLiveStatus(meeting);
  if (s === 'cancelled' || s === 'ended') return false;
  const now = Date.now();
  const start = new Date(meeting.start_time).getTime();
  const end = new Date(meeting.end_time).getTime();
  return now >= start - 10 * 60 * 1000 && now <= end;
}

function formatDuration(startTime: string, endTime: string): string {
  const mins = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MyMeetings() {
  const { profile } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tab, setTab] = useState<'all' | 'upcoming' | 'ended'>('upcoming');
  const [viewMeeting, setViewMeeting] = useState<Meeting | null>(null);
  const [jitsiMeeting, setJitsiMeeting] = useState<Meeting | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('meeting_participants')
      .select(`
        meeting_id,
        role,
        meeting:meetings!meeting_participants_meeting_id_fkey(
          *,
          organizer:profiles!meetings_organizer_id_fkey(id,full_name,email),
          department:departments!meetings_department_id_fkey(id,name),
          participants:meeting_participants(id,profile_id,role,profile:profiles!meeting_participants_profile_id_fkey(id,full_name,email))
        )
      `)
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false });

    const all = (Array.isArray(data) ? data : [])
      .map(row => row.meeting as unknown as Meeting)
      .filter(Boolean);

    // Sort by start_time desc
    all.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    setMeetings(all);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
    const channel = supabase.channel('my-meetings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = meetings.filter(m => {
    const liveStatus = getLiveStatus(m);
    const s = search.toLowerCase();
    const matchSearch = !s || m.title.toLowerCase().includes(s) ||
      (m.organizer?.full_name || '').toLowerCase().includes(s) ||
      (m.department?.name || '').toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' || liveStatus === statusFilter;
    const matchTab = tab === 'all'
      ? true
      : tab === 'upcoming'
        ? liveStatus === 'scheduled' || liveStatus === 'in_progress'
        : liveStatus === 'ended' || liveStatus === 'cancelled';
    return matchSearch && matchStatus && matchTab;
  });

  const countUpcoming = meetings.filter(m => {
    const s = getLiveStatus(m);
    return s === 'scheduled' || s === 'in_progress';
  }).length;

  return (
    <div className="p-4 md:p-6 space-y-5 min-w-0">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground text-balance">My Meetings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View and join your scheduled video conferences
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Meetings', value: meetings.length, icon: Video, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Upcoming / Active', value: countUpcoming, icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Completed', value: meetings.filter(m => getLiveStatus(m) === 'ended').length, icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="h-full">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Tabs value={tab} onValueChange={v => setTab(v as 'all' | 'upcoming' | 'ended')}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="upcoming" className="flex-1 md:flex-none whitespace-nowrap">Upcoming</TabsTrigger>
            <TabsTrigger value="all" className="flex-1 md:flex-none whitespace-nowrap">All</TabsTrigger>
            <TabsTrigger value="ended" className="flex-1 md:flex-none whitespace-nowrap">Past</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Meeting Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-2/3 bg-muted" />
              <Skeleton className="h-4 w-1/3 bg-muted" />
              <Skeleton className="h-8 w-24 bg-muted" />
            </CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Video className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No meetings found</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {tab === 'upcoming' ? 'You have no upcoming meetings scheduled.' : 'No meetings match your filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(meeting => {
            const liveStatus = getLiveStatus(meeting);
            const joinable = canJoin(meeting);
            const startDt = new Date(meeting.start_time);

            return (
              <Card key={meeting.id} className={`h-full transition-colors ${
                liveStatus === 'in_progress' ? 'border-green-500/30 bg-green-500/5' : ''
              }`}>
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  {/* Title row */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        liveStatus === 'in_progress' ? 'bg-green-500/20' : 'bg-primary/10'
                      }`}>
                        <Video className={`w-4 h-4 ${liveStatus === 'in_progress' ? 'text-green-400' : 'text-primary'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate text-balance">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{meeting.organizer?.full_name}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_STYLES[liveStatus]}`}>
                      {liveStatus === 'in_progress' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 inline-block animate-pulse" />
                      )}
                      {STATUS_LABELS[liveStatus]}
                    </Badge>
                  </div>

                  {/* Meta */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{startDt.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{meeting.participants?.length || 0} participants</span>
                    </div>
                    <div className="text-muted-foreground text-xs truncate">
                      {TYPE_LABELS[meeting.meeting_type]}
                      {meeting.department && ` · ${meeting.department.name}`}
                    </div>
                  </div>

                  {meeting.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 text-pretty">{meeting.description}</p>
                  )}

                  {/* Duration */}
                  <p className="text-xs text-muted-foreground">
                    Duration: {formatDuration(meeting.start_time, meeting.end_time)}
                  </p>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-auto pt-1">
                    <Button variant="outline" size="sm" className="flex-1 min-w-0 gap-1.5"
                      onClick={() => setViewMeeting(meeting)}>
                      <Users className="w-3.5 h-3.5" /> Details
                    </Button>
                    {joinable ? (
                      <Button size="sm" className="flex-1 min-w-0 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setJitsiMeeting(meeting)}>
                        <Play className="w-3.5 h-3.5" /> Join Meeting
                      </Button>
                    ) : liveStatus === 'scheduled' ? (
                      <Button size="sm" variant="secondary" className="flex-1 min-w-0 gap-1.5" disabled onClick={() => {}}>
                        <Clock className="w-3.5 h-3.5" /> Not Started
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!viewMeeting} onOpenChange={v => !v && setViewMeeting(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>Meeting Details</DialogTitle>
          </DialogHeader>
          {viewMeeting && (
            <div className="space-y-4 mt-2">
              <div className="flex flex-wrap items-start gap-2 justify-between">
                <p className="font-semibold text-foreground text-balance flex-1">{viewMeeting.title}</p>
                <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_STYLES[getLiveStatus(viewMeeting)]}`}>
                  {STATUS_LABELS[getLiveStatus(viewMeeting)]}
                </Badge>
              </div>
              {viewMeeting.description && (
                <p className="text-sm text-muted-foreground text-pretty">{viewMeeting.description}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Start</p>
                  <p className="font-medium text-foreground">{new Date(viewMeeting.start_time).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">End</p>
                  <p className="font-medium text-foreground">{new Date(viewMeeting.end_time).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Organizer</p>
                  <p className="font-medium text-foreground">{viewMeeting.organizer?.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Type</p>
                  <p className="font-medium text-foreground">{TYPE_LABELS[viewMeeting.meeting_type]}</p>
                </div>
              </div>
              {viewMeeting.agenda && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Agenda</p>
                  <p className="text-sm text-foreground whitespace-pre-line bg-muted/30 rounded p-3">{viewMeeting.agenda}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Participants ({viewMeeting.participants?.length || 0})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(viewMeeting.participants || []).map(p => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">{p.profile?.full_name || p.profile?.email}</span>
                      <Badge variant="outline" className={p.role === 'moderator'
                        ? 'text-xs border-primary/30 text-primary bg-primary/10'
                        : 'text-xs border-muted-foreground/30 text-muted-foreground'}>
                        {p.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              {canJoin(viewMeeting) && (
                <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => { setViewMeeting(null); setJitsiMeeting(viewMeeting); }}>
                  <Play className="w-4 h-4" /> Join Meeting Now
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Jitsi Meet Modal */}
      {jitsiMeeting && profile && (
        <JitsiMeetModal
          roomId={jitsiMeeting.room_id}
          meetingId={jitsiMeeting.id}
          userId={profile.id}
          displayName={profile.full_name || profile.email || 'User'}
          userEmail={profile.email || ''}
          userRole={profile.role as import('@/types/types').UserRole}
          isModerator={
            (jitsiMeeting.participants || []).some(p => p.profile_id === profile.id && p.role === 'moderator')
          }
          meetingTitle={jitsiMeeting.title}
          onClose={() => setJitsiMeeting(null)}
        />
      )}
    </div>
  );
}
