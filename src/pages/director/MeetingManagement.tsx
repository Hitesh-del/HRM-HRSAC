import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Video, Users, Calendar, Clock, Edit2, Trash2, Play, Search, Filter, FileDown } from 'lucide-react';
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
import type { Meeting, MeetingType, MeetingStatus, Department, Profile } from '@/types/types';

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

function getMeetingStatus(meeting: { start_time: string; end_time: string; status: MeetingStatus }): MeetingStatus {
  if (meeting.status === 'cancelled' || meeting.status === 'ended') return meeting.status;
  const now = Date.now();
  const start = new Date(meeting.start_time).getTime();
  const end = new Date(meeting.end_time).getTime();
  if (now >= start && now <= end) return 'in_progress';
  if (now > end) return 'ended';
  return 'scheduled';
}

function canJoin(meeting: { start_time: string; end_time: string; status: MeetingStatus }): boolean {
  const s = getMeetingStatus(meeting);
  if (s === 'cancelled' || s === 'ended') return false;
  const now = Date.now();
  const start = new Date(meeting.start_time).getTime();
  const end = new Date(meeting.end_time).getTime();
  return now >= start - 10 * 60 * 1000 && now <= end;
}

// ─── form types ──────────────────────────────────────────────────────────────

interface MeetingFormValues {
  title: string;
  description: string;
  meeting_type: MeetingType;
  department_id: string;
  start_time: string;
  end_time: string;
  agenda: string;
  participant_ids: string[];
}

// ─── ParticipantSelector — defined OUTSIDE parent to preserve focus ──────────

function ParticipantSelector({ control, name, organizerId, profiles }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any; name: string; organizerId?: string; profiles: Profile[];
}) {
  const [profileSearch, setProfileSearch] = useState('');
  const filteredProfiles = profiles.filter(p =>
    p.id !== organizerId &&
    (profileSearch === '' || (p.full_name || '').toLowerCase().includes(profileSearch.toLowerCase()) ||
      (p.email || '').toLowerCase().includes(profileSearch.toLowerCase()))
  );
  return (
    <FormField control={control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel className="text-sm font-normal">Participants</FormLabel>
        <FormControl>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <Input
                placeholder="Search participants…"
                value={profileSearch}
                onChange={e => setProfileSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <ScrollArea className="h-40">
              <div className="p-2 space-y-0.5">
                {filteredProfiles.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">No profiles found</p>
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
  formInstance, onSubmit, organizerId, submitLabel,
  profiles, departments, saving, onCancel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formInstance: any;
  onSubmit: (v: MeetingFormValues) => void;
  organizerId?: string;
  submitLabel: string;
  profiles: Profile[];
  departments: Department[];
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
              <FormControl><Input {...field} placeholder="Q2 Planning Session" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={formInstance.control} name="meeting_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-normal">Meeting Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

          <FormField control={formInstance.control} name="department_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-normal">Department</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="All Departments" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

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
              <FormControl><Textarea {...field} placeholder="1. Topic…&#10;2. Topic…" rows={3} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

        <ParticipantSelector control={formInstance.control} name="participant_ids" organizerId={organizerId} profiles={profiles} />

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1 min-w-0" disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MeetingManagement() {
  const { profile } = useAuth();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [view, setView] = useState<'list' | 'upcoming'>('list');

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [deleteMeeting, setDeleteMeeting] = useState<Meeting | null>(null);
  const [viewMeeting, setViewMeeting] = useState<Meeting | null>(null);
  const [jitsiMeeting, setJitsiMeeting] = useState<Meeting | null>(null);

  const [saving, setSaving] = useState(false);

  const form = useForm<MeetingFormValues>({
    defaultValues: {
      title: '', description: '', meeting_type: 'team',
      department_id: 'all', start_time: '', end_time: '',
      agenda: '', participant_ids: [],
    },
  });
  const editForm = useForm<MeetingFormValues>();

  // ─── data loading ───────────────────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meetings')
      .select(`
        *,
        organizer:profiles!meetings_organizer_id_fkey(id,full_name,email,role),
        department:departments!meetings_department_id_fkey(id,name),
        participants:meeting_participants(id,profile_id,role,joined_at,profile:profiles!meeting_participants_profile_id_fkey(id,full_name,email,role))
      `)
      .order('start_time', { ascending: false });
    setMeetings(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMeetings();

    // realtime subscription
    const channel = supabase.channel('meetings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, loadMeetings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_participants' }, loadMeetings)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadMeetings]);

  useEffect(() => {
    supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
    supabase.from('profiles').select('*').eq('is_active', true).order('full_name')
      .then(({ data }) => setAllProfiles(data || []));
  }, []);

  // ─── filtered list ──────────────────────────────────────────────────────────

  const filtered = meetings.filter(m => {
    const s = search.toLowerCase();
    const matchSearch = !s
      || m.title.toLowerCase().includes(s)
      || (m.organizer?.full_name || '').toLowerCase().includes(s)
      || (m.department?.name || '').toLowerCase().includes(s);
    const liveStatus = getMeetingStatus(m);
    const matchStatus = statusFilter === 'all' || liveStatus === statusFilter;
    const matchType = typeFilter === 'all' || m.meeting_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  }).filter(m => {
    if (view === 'upcoming') return getMeetingStatus(m) === 'scheduled' || getMeetingStatus(m) === 'in_progress';
    return true;
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  const handleCreate = async (values: MeetingFormValues) => {
    if (!profile) return;
    setSaving(true);
    try {
      const roomId = `hrm-${crypto.randomUUID().replace(/-/g, '')}`;
      const { data: newMeeting, error } = await supabase.from('meetings').insert({
        title: values.title.trim(),
        description: values.description || null,
        room_id: roomId,
        organizer_id: profile.id,
        department_id: values.department_id === 'all' ? null : values.department_id,
        meeting_type: values.meeting_type,
        start_time: new Date(values.start_time).toISOString(),
        end_time: new Date(values.end_time).toISOString(),
        agenda: values.agenda || null,
        status: 'scheduled',
      }).select('id').maybeSingle();

      if (error) throw error;
      if (!newMeeting) throw new Error('Meeting not created');

      // add organizer as moderator
      const participantIds = Array.from(new Set([profile.id, ...values.participant_ids]));
      await supabase.from('meeting_participants').insert(
        participantIds.map(pid => ({
          meeting_id: newMeeting.id,
          profile_id: pid,
          role: pid === profile.id ? 'moderator' : 'participant',
        }))
      );

      // notify all participants (except organizer)
      const others = participantIds.filter(id => id !== profile.id);
      if (others.length > 0) {
        notifyMeetingCreated(newMeeting.id, values.title.trim(), values.start_time, others, profile.role);
      }

      toast.success('Meeting created successfully');
      setCreateOpen(false);
      form.reset();
      loadMeetings();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create meeting');
    } finally {
      setSaving(false);
    }
  };

  // ─── edit ────────────────────────────────────────────────────────────────────

  const openEdit = (meeting: Meeting) => {
    setEditMeeting(meeting);
    editForm.reset({
      title: meeting.title,
      description: meeting.description || '',
      meeting_type: meeting.meeting_type,
      department_id: meeting.department_id || 'all',
      start_time: new Date(meeting.start_time).toISOString().slice(0, 16),
      end_time: new Date(meeting.end_time).toISOString().slice(0, 16),
      agenda: meeting.agenda || '',
      participant_ids: (meeting.participants || []).map(p => p.profile_id).filter(id => id !== meeting.organizer_id),
    });
  };

  const handleEdit = async (values: MeetingFormValues) => {
    if (!editMeeting || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('meetings').update({
        title: values.title.trim(),
        description: values.description || null,
        department_id: values.department_id === 'all' ? null : values.department_id,
        meeting_type: values.meeting_type,
        start_time: new Date(values.start_time).toISOString(),
        end_time: new Date(values.end_time).toISOString(),
        agenda: values.agenda || null,
      }).eq('id', editMeeting.id);
      if (error) throw error;

      // sync participants
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

  // ─── delete / cancel ─────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteMeeting) return;
    const participantIds = (deleteMeeting.participants || []).map(p => p.profile_id);
    const others = participantIds.filter(id => id !== profile?.id);
    await supabase.from('meetings').update({ status: 'cancelled' }).eq('id', deleteMeeting.id);
    if (others.length > 0) notifyMeetingCancelled(deleteMeeting.id, deleteMeeting.title, others);
    await supabase.from('meetings').delete().eq('id', deleteMeeting.id);
    toast.success('Meeting deleted');
    setDeleteMeeting(null);
    loadMeetings();
  };

  // ─── export ─────────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const rows = [
      ['Title', 'Type', 'Status', 'Organizer', 'Department', 'Start Time', 'End Time', 'Participants'],
      ...filtered.map(m => [
        m.title,
        TYPE_LABELS[m.meeting_type],
        STATUS_LABELS[getMeetingStatus(m)],
        m.organizer?.full_name || '',
        m.department?.name || 'All',
        new Date(m.start_time).toLocaleString(),
        new Date(m.end_time).toLocaleString(),
        (m.participants?.length || 0).toString(),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'meetings.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  // ─── render ─────────────────────────────────────────────────────────────────

  const statsScheduled = meetings.filter(m => getMeetingStatus(m) === 'scheduled').length;
  const statsInProgress = meetings.filter(m => getMeetingStatus(m) === 'in_progress').length;
  const statsTotal = meetings.length;

  return (
    <div className="p-4 md:p-6 space-y-5 min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground text-balance">Meeting Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Schedule and manage video conferences</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4" /> Export CSV
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New Meeting
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Meetings', value: statsTotal, icon: Video, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Scheduled', value: statsScheduled, icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'In Progress', value: statsInProgress, icon: Play, color: 'text-green-400', bg: 'bg-green-500/10' },
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
        <Tabs value={view} onValueChange={v => setView(v as 'list' | 'upcoming')}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="list" className="flex-1 md:flex-none whitespace-nowrap">All Meetings</TabsTrigger>
            <TabsTrigger value="upcoming" className="flex-1 md:flex-none whitespace-nowrap">Upcoming</TabsTrigger>
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Meetings Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {['Meeting', 'Type', 'Department', 'Date & Time', 'Duration', 'Participants', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20 bg-muted" /></td>
                    ))}
                  </tr>
                ))
                : filtered.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No meetings found</td></tr>
                  : filtered.map(meeting => {
                    const liveStatus = getMeetingStatus(meeting);
                    const joinable = canJoin(meeting);
                    const startDt = new Date(meeting.start_time);
                    const endDt = new Date(meeting.end_time);
                    const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
                    const isOwner = meeting.organizer_id === profile?.id || profile?.role === 'director';
                    return (
                      <tr key={meeting.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Video className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate max-w-[160px]">{meeting.title}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{meeting.organizer?.full_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{TYPE_LABELS[meeting.meeting_type]}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{meeting.department?.name || 'All'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-foreground">{startDt.toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">{startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {durationMin >= 60 ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m` : `${durationMin}m`}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Users className="w-3.5 h-3.5" />
                            <span>{meeting.participants?.length || 0}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={STATUS_STYLES[liveStatus]}>
                            {liveStatus === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse inline-block" />}
                            {STATUS_LABELS[liveStatus]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {joinable && (
                              <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => setJitsiMeeting(meeting)}>
                                <Play className="w-3 h-3" /> Join
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                              onClick={() => setViewMeeting(meeting)}>
                              <Users className="w-3.5 h-3.5" />
                            </Button>
                            {isOwner && liveStatus === 'scheduled' && (
                              <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary"
                                onClick={() => openEdit(meeting)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {isOwner && (
                              <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteMeeting(meeting)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schedule New Meeting</DialogTitle>
          </DialogHeader>
          <MeetingForm formInstance={form} onSubmit={handleCreate} organizerId={profile?.id} submitLabel="Create Meeting" profiles={allProfiles} departments={departments} saving={saving} onCancel={() => { setCreateOpen(false); setEditMeeting(null); }} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMeeting} onOpenChange={v => !v && setEditMeeting(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
          </DialogHeader>
          <MeetingForm formInstance={editForm} onSubmit={handleEdit} organizerId={editMeeting?.organizer_id} submitLabel="Save Changes" profiles={allProfiles} departments={departments} saving={saving} onCancel={() => { setCreateOpen(false); setEditMeeting(null); }} />
        </DialogContent>
      </Dialog>

      {/* View Participants Dialog */}
      <Dialog open={!!viewMeeting} onOpenChange={v => !v && setViewMeeting(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>Meeting Details</DialogTitle>
          </DialogHeader>
          {viewMeeting && (
            <div className="space-y-4 mt-2">
              <div>
                <p className="font-semibold text-foreground text-balance">{viewMeeting.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{viewMeeting.description}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Start</p>
                  <p className="font-medium text-foreground">{new Date(viewMeeting.start_time).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">End</p>
                  <p className="font-medium text-foreground">{new Date(viewMeeting.end_time).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium text-foreground">{TYPE_LABELS[viewMeeting.meeting_type]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Room ID</p>
                  <p className="font-mono text-xs text-foreground break-all">{viewMeeting.room_id}</p>
                </div>
              </div>
              {viewMeeting.agenda && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Agenda</p>
                  <p className="text-sm text-foreground whitespace-pre-line bg-muted/30 rounded p-3">{viewMeeting.agenda}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Participants ({viewMeeting.participants?.length || 0})</p>
                <div className="space-y-1.5">
                  {(viewMeeting.participants || []).map(p => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-foreground">{p.profile?.full_name || p.profile?.email}</span>
                      <Badge variant="outline" className={p.role === 'moderator'
                        ? 'border-primary/30 text-primary bg-primary/10 text-xs'
                        : 'border-muted-foreground/30 text-muted-foreground text-xs'}>
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
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteMeeting?.title}" and notify participants. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Delete
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
            profile.role === 'director' ||
            (jitsiMeeting.participants || []).some(p => p.profile_id === profile.id && p.role === 'moderator')
          }
          meetingTitle={jitsiMeeting.title}
          onClose={() => setJitsiMeeting(null)}
        />
      )}

      {/* Upcoming summary cards (mobile-friendly compact view) */}
      <div className="hidden">
        <Filter className="w-4 h-4" />
        <Clock className="w-4 h-4" />
      </div>
    </div>
  );
}
