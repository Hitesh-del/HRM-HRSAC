import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, Video, Users, Calendar, Clock, Edit2, Trash2, Play,
  Search, Filter, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JitsiMeetModal } from '@/components/common/JitsiMeetModal';
import { notifyMeetingCreated, notifyMeetingUpdated, notifyMeetingCancelled } from '@/lib/notifications';
import type { Meeting, MeetingType, MeetingStatus, Profile } from '@/types/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MeetingType, string> = {
  department: 'Department',
  team:       'Team',
  one_on_one: 'One-on-One',
  all_hands:  'All Hands',
};

const STATUS_STYLES: Record<MeetingStatus, string> = {
  scheduled:   'border-blue-500/30 text-blue-400 bg-blue-500/10',
  in_progress: 'border-green-500/30 text-green-400 bg-green-500/10',
  ended:       'border-muted-foreground/30 text-muted-foreground bg-muted/30',
  cancelled:   'border-destructive/30 text-destructive bg-destructive/10',
};

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled:   'Scheduled',
  in_progress: 'In Progress',
  ended:       'Ended',
  cancelled:   'Cancelled',
};

function getLiveStatus(m: { start_time: string; end_time: string; status: MeetingStatus }): MeetingStatus {
  if (m.status === 'cancelled' || m.status === 'ended') return m.status;
  const now = Date.now();
  const start = new Date(m.start_time).getTime();
  const end   = new Date(m.end_time).getTime();
  if (now >= start && now <= end) return 'in_progress';
  if (now > end) return 'ended';
  return 'scheduled';
}

function canJoin(m: { start_time: string; end_time: string; status: MeetingStatus }): boolean {
  const s = getLiveStatus(m);
  if (s === 'cancelled' || s === 'ended') return false;
  const now   = Date.now();
  const start = new Date(m.start_time).getTime();
  const end   = new Date(m.end_time).getTime();
  return now >= start - 10 * 60 * 1000 && now <= end;
}

function formatDuration(start: string, end: string): string {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

interface MeetingFormValues {
  title:          string;
  description:    string;
  meeting_type:   MeetingType;
  start_time:     string;
  end_time:       string;
  agenda:         string;
  participant_ids: string[];
}

// ─── ParticipantSelector — defined OUTSIDE parent to preserve focus ──────────

function MgmtParticipantSelector({ control, name, organizerId, profiles }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any; name: string; organizerId?: string; profiles: Profile[];
}) {
  const [profileSearch, setProfileSearch] = useState('');
  const filteredProfiles = profiles.filter(p =>
    p.id !== organizerId &&
    (profileSearch === '' ||
      (p.full_name || '').toLowerCase().includes(profileSearch.toLowerCase()) ||
      (p.email || '').toLowerCase().includes(profileSearch.toLowerCase()))
  );
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel className="text-sm font-normal">
          Department Participants
          <span className="text-muted-foreground text-xs ml-1">(your team only)</span>
        </FormLabel>
        <FormControl>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <Input
                placeholder="Search team members…"
                value={profileSearch}
                onChange={e => setProfileSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <ScrollArea className="h-36">
              <div className="p-2 space-y-0.5">
                {filteredProfiles.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">No team members found</p>
                )}
                {filteredProfiles.map(p => (
                  <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer">
                    <Checkbox
                      checked={(field.value as string[]).includes(p.id)}
                      onCheckedChange={checked => {
                        const cur = field.value as string[];
                        field.onChange(checked ? [...cur, p.id] : cur.filter(id => id !== p.id));
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{p.full_name || p.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
            <div className="px-3 py-1.5 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">{(field.value as string[]).length} selected</p>
            </div>
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    )} />
  );
}

// ─── MeetingForm — defined OUTSIDE parent to preserve focus ──────────────────

function MeetingForm({
  formInstance, onSubmit, organizerId, submitLabel, profiles, saving, onCancel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formInstance: any;
  onSubmit: (v: MeetingFormValues) => void;
  organizerId?: string;
  submitLabel: string;
  profiles: Profile[];
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <Form {...formInstance}>
      <form onSubmit={formInstance.handleSubmit(onSubmit)} className="space-y-4 mt-2">
        <FormField control={formInstance.control} name="title" rules={{ required: 'Required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-normal">Meeting Title</FormLabel>
              <FormControl><Input {...field} placeholder="Team Sync — Q3" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={formInstance.control} name="meeting_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-normal">Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

          <FormItem>
            <FormLabel className="text-sm font-normal">Department</FormLabel>
            <div className="flex h-10 w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground items-center gap-1">
              <Filter className="w-3.5 h-3.5 shrink-0" />
              Your Department (auto)
            </div>
          </FormItem>

          <FormField control={formInstance.control} name="start_time" rules={{ required: 'Required' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-normal">Start Time</FormLabel>
                <FormControl><Input {...field} type="datetime-local" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={formInstance.control} name="end_time" rules={{ required: 'Required' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-normal">End Time</FormLabel>
                <FormControl><Input {...field} type="datetime-local" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
        </div>

        <FormField control={formInstance.control} name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-normal">Description</FormLabel>
              <FormControl><Textarea {...field} placeholder="Brief meeting summary…" rows={2} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

        <FormField control={formInstance.control} name="agenda"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-normal">Agenda</FormLabel>
              <FormControl><Textarea {...field} placeholder="Topics to cover…" rows={2} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

        <MgmtParticipantSelector control={formInstance.control} name="participant_ids" organizerId={organizerId} profiles={profiles} />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MgmtMeetings() {
  const { profile } = useAuth();

  const [meetings,      setMeetings]      = useState<Meeting[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [deptProfiles,  setDeptProfiles]  = useState<Profile[]>([]);

  // filters
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [tab,           setTab]           = useState<'all' | 'upcoming' | 'ended'>('upcoming');

  // dialogs
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editMeeting,   setEditMeeting]   = useState<Meeting | null>(null);
  const [deleteMeeting, setDeleteMeeting] = useState<Meeting | null>(null);
  const [viewMeeting,   setViewMeeting]   = useState<Meeting | null>(null);
  const [jitsiMeeting,  setJitsiMeeting]  = useState<Meeting | null>(null);

  const [saving, setSaving] = useState(false);

  const form     = useForm<MeetingFormValues>({
    defaultValues: { title: '', description: '', meeting_type: 'team', start_time: '', end_time: '', agenda: '', participant_ids: [] },
  });
  const editForm = useForm<MeetingFormValues>();

  // ─── load dept-scoped meetings ────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('meetings')
      .select(`
        *,
        organizer:profiles!meetings_organizer_id_fkey(id,full_name,email,role),
        participants:meeting_participants(id,profile_id,role,joined_at,profile:profiles!meeting_participants_profile_id_fkey(id,full_name,email,role))
      `)
      .or(`department_id.eq.${profile.department_id},organizer_id.eq.${profile.id}`)
      .order('start_time', { ascending: false });
    setMeetings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadMeetings();
    const channel = supabase.channel('mgmt-meetings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, loadMeetings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants' }, loadMeetings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMeetings]);

  // Load department-scoped profiles (employees + interns in same dept)
  useEffect(() => {
    if (!profile?.department_id) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('department_id', profile.department_id)
      .in('role', ['employee', 'intern'])
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setDeptProfiles(data || []));
  }, [profile]);

  // ─── filtered list ────────────────────────────────────────────────────────

  const filtered = meetings.filter(m => {
    const liveStatus = getLiveStatus(m);
    const s = search.toLowerCase();
    const matchSearch = !s || m.title.toLowerCase().includes(s) ||
      (m.organizer?.full_name || '').toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' || liveStatus === statusFilter;
    const matchTab = tab === 'all'
      ? true
      : tab === 'upcoming'
        ? liveStatus === 'scheduled' || liveStatus === 'in_progress'
        : liveStatus === 'ended' || liveStatus === 'cancelled';
    return matchSearch && matchStatus && matchTab;
  });

  // ─── create ───────────────────────────────────────────────────────────────

  const handleCreate = async (values: MeetingFormValues) => {
    if (!profile?.department_id) return;
    setSaving(true);
    try {
      const roomId = `hrm-${crypto.randomUUID().replace(/-/g, '')}`;
      const { data: newMeeting, error } = await supabase.from('meetings').insert({
        title:         values.title.trim(),
        description:   values.description || null,
        room_id:       roomId,
        organizer_id:  profile.id,
        department_id: profile.department_id,
        meeting_type:  values.meeting_type,
        start_time:    new Date(values.start_time).toISOString(),
        end_time:      new Date(values.end_time).toISOString(),
        agenda:        values.agenda || null,
        status:        'scheduled',
      }).select('id').maybeSingle();

      if (error) throw error;
      if (!newMeeting) throw new Error('Meeting not created');

      const participantIds = Array.from(new Set([profile.id, ...values.participant_ids]));
      await supabase.from('meeting_participants').insert(
        participantIds.map(pid => ({
          meeting_id: newMeeting.id,
          profile_id: pid,
          role: pid === profile.id ? 'moderator' : 'participant',
        }))
      );

      const others = participantIds.filter(id => id !== profile.id);
      if (others.length > 0) {
        notifyMeetingCreated(newMeeting.id, values.title.trim(), values.start_time, others, profile.role);
      }

      toast.success('Meeting created');
      setCreateOpen(false);
      form.reset();
      loadMeetings();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create meeting');
    } finally {
      setSaving(false);
    }
  };

  // ─── edit ─────────────────────────────────────────────────────────────────

  const openEdit = (meeting: Meeting) => {
    setEditMeeting(meeting);
    editForm.reset({
      title:          meeting.title,
      description:    meeting.description || '',
      meeting_type:   meeting.meeting_type,
      start_time:     new Date(meeting.start_time).toISOString().slice(0, 16),
      end_time:       new Date(meeting.end_time).toISOString().slice(0, 16),
      agenda:         meeting.agenda || '',
      participant_ids: (meeting.participants || [])
        .map(p => p.profile_id)
        .filter(id => id !== meeting.organizer_id),
    });
  };

  const handleEdit = async (values: MeetingFormValues) => {
    if (!editMeeting || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('meetings').update({
        title:         values.title.trim(),
        description:   values.description || null,
        meeting_type:  values.meeting_type,
        start_time:    new Date(values.start_time).toISOString(),
        end_time:      new Date(values.end_time).toISOString(),
        agenda:        values.agenda || null,
      }).eq('id', editMeeting.id);
      if (error) throw error;

      const newIds = Array.from(new Set([editMeeting.organizer_id, ...values.participant_ids]));
      await supabase.from('meeting_participants').delete().eq('meeting_id', editMeeting.id);
      await supabase.from('meeting_participants').insert(
        newIds.map(pid => ({
          meeting_id: editMeeting.id,
          profile_id: pid,
          role: pid === editMeeting.organizer_id ? 'moderator' : 'participant',
        }))
      );

      const others = newIds.filter(id => id !== profile.id);
      if (others.length > 0) {
        notifyMeetingUpdated(editMeeting.id, values.title.trim(), values.start_time, others);
      }

      toast.success('Meeting updated');
      setEditMeeting(null);
      loadMeetings();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update meeting');
    } finally {
      setSaving(false);
    }
  };

  // ─── delete / cancel ──────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteMeeting) return;
    const others = (deleteMeeting.participants || [])
      .map(p => p.profile_id)
      .filter(id => id !== profile?.id);
    await supabase.from('meetings').update({ status: 'cancelled' }).eq('id', deleteMeeting.id);
    if (others.length > 0) notifyMeetingCancelled(deleteMeeting.id, deleteMeeting.title, others);
    await supabase.from('meetings').delete().eq('id', deleteMeeting.id);
    toast.success('Meeting cancelled');
    setDeleteMeeting(null);
    loadMeetings();
  };

  // ─── stats ────────────────────────────────────────────────────────────────

  const stats = [
    { label: 'Total Meetings',    value: meetings.length,                                                           icon: Video,    color: 'text-primary',            bg: 'bg-primary/10'    },
    { label: 'Upcoming / Active', value: meetings.filter(m => { const s = getLiveStatus(m); return s === 'scheduled' || s === 'in_progress'; }).length, icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Completed',         value: meetings.filter(m => getLiveStatus(m) === 'ended').length,                  icon: Clock,    color: 'text-muted-foreground',   bg: 'bg-muted/30'      },
    { label: 'Team Members',      value: deptProfiles.length,                                                        icon: Users,    color: 'text-green-400',          bg: 'bg-green-500/10'  },
  ];

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5 min-w-0">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground text-balance">Department Meetings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage and join meetings for your department team
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => { form.reset(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4" /> New Meeting
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="h-full">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground truncate">{label}</p>
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
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings…" className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full md:w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Meeting cards */}
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
            <p className="text-muted-foreground">No department meetings found</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {tab === 'upcoming' ? 'No upcoming meetings for your department.' : 'No meetings match your filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(meeting => {
            const liveStatus = getLiveStatus(meeting);
            const joinable   = canJoin(meeting);
            const isOrganizer = meeting.organizer_id === profile?.id;
            const startDt    = new Date(meeting.start_time);

            return (
              <Card key={meeting.id} className={`h-full flex flex-col transition-colors ${
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
                        <p className="text-xs text-muted-foreground truncate">
                          {isOrganizer ? 'You (organizer)' : meeting.organizer?.full_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[liveStatus]}`}>
                        {liveStatus === 'in_progress' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 inline-block animate-pulse" />
                        )}
                        {STATUS_LABELS[liveStatus]}
                      </Badge>
                      {isOrganizer && liveStatus !== 'cancelled' && liveStatus !== 'ended' && (
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">Host</Badge>
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
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
                    <div className="text-muted-foreground text-xs">
                      {TYPE_LABELS[meeting.meeting_type]}
                      {' · '}{formatDuration(meeting.start_time, meeting.end_time)}
                    </div>
                  </div>

                  {meeting.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 text-pretty">{meeting.description}</p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-auto pt-1">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setViewMeeting(meeting)}>
                      <ChevronDown className="w-3.5 h-3.5" /> Details
                    </Button>
                    {isOrganizer && liveStatus !== 'cancelled' && liveStatus !== 'ended' && (
                      <>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => openEdit(meeting)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteMeeting(meeting)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {joinable ? (
                      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white ml-auto"
                        onClick={() => setJitsiMeeting(meeting)}>
                        <Play className="w-3.5 h-3.5" /> Join
                      </Button>
                    ) : liveStatus === 'scheduled' ? (
                      <Button size="sm" variant="secondary" className="gap-1.5 ml-auto" disabled onClick={() => {}}>
                        <Clock className="w-3.5 h-3.5" /> Scheduled
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Department Meeting</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="pr-2">
              <MeetingForm formInstance={form} onSubmit={handleCreate} organizerId={profile?.id} submitLabel="Create Meeting" profiles={deptProfiles} saving={saving} onCancel={() => { setCreateOpen(false); setEditMeeting(null); }} />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMeeting} onOpenChange={v => !v && setEditMeeting(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="pr-2">
              <MeetingForm formInstance={editForm} onSubmit={handleEdit} organizerId={editMeeting?.organizer_id} submitLabel="Save Changes" profiles={deptProfiles} saving={saving} onCancel={() => { setCreateOpen(false); setEditMeeting(null); }} />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!viewMeeting} onOpenChange={v => !v && setViewMeeting(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Meeting Details</DialogTitle></DialogHeader>
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground text-xs">Start</p><p className="font-medium">{new Date(viewMeeting.start_time).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">End</p><p className="font-medium">{new Date(viewMeeting.end_time).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground text-xs">Organizer</p><p className="font-medium">{viewMeeting.organizer?.full_name}</p></div>
                <div><p className="text-muted-foreground text-xs">Type</p><p className="font-medium">{TYPE_LABELS[viewMeeting.meeting_type]}</p></div>
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

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteMeeting} onOpenChange={v => !v && setDeleteMeeting(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel <strong>{deleteMeeting?.title}</strong> and notify all participants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Cancel Meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            profile.role === 'management' ||
            (jitsiMeeting.participants || []).some(p => p.profile_id === profile.id && p.role === 'moderator')
          }
          meetingTitle={jitsiMeeting.title}
          onClose={() => setJitsiMeeting(null)}
        />
      )}

      {/* Hidden icon refs to prevent tree-shaking */}
      <span className="hidden"><Filter className="w-4 h-4" /><ChevronDown className="w-4 h-4" /></span>
    </div>
  );
}

