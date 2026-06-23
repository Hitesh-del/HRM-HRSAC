import { useEffect, useState, useCallback } from 'react';
import { Plus, Briefcase, Users, Search, Calendar, CheckCircle, XCircle, Send, RefreshCw, Eye, Edit, Trash2, FileDown, FileText } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Department } from '@/types/types';
import { notifyNewJobOpening } from '@/lib/notifications';

const APP_STATUS_STYLES: Record<string, string> = {
  submitted: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  under_review: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  interview_scheduled: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
  offer_extended: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  hired: 'border-green-500/30 text-green-400 bg-green-500/10',
  rejected: 'border-red-500/30 text-red-400 bg-red-500/10',
};

type JobRow = { id: string; title: string; status: string; vacancies: number; location?: string; salary_range?: string; description?: string; requirements?: string; experience_required?: string; skills_required?: string; closing_date?: string; department?: { id: string; name: string } | null; created_at: string };
type AppRow = { id: string; status: string; interview_date?: string; cover_letter?: string; resume_url?: string; feedback?: string; created_at: string; applicant?: { id: string; full_name?: string; employee_id?: string; email?: string; department?: { name?: string } | null } | null; job?: { id: string; title?: string; department?: { name?: string } | null } | null };

interface JobForm {
  title: string; department_id: string; description: string; requirements: string;
  experience_required: string; skills_required: string;
  location: string; salary_range: string; vacancies: string; closing_date: string;
}

export default function RecruitmentPage() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewApp, setViewApp] = useState<AppRow | null>(null);
  const [interviewDate, setInterviewDate] = useState('');
  const [feedback, setFeedback] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [activeJobFilter, setActiveJobFilter] = useState<string>('all');

  const form = useForm<JobForm>({ defaultValues: { title: '', department_id: '', description: '', requirements: '', experience_required: '', skills_required: '', location: '', salary_range: '', vacancies: '1', closing_date: '' } });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: jobsData }, { data: appsData }, { data: depts }] = await Promise.all([
      supabase.from('job_openings').select('id,title,status,vacancies,location,salary_range,description,requirements,experience_required,skills_required,closing_date,created_at,department:departments!job_openings_department_id_fkey(id,name)').order('created_at', { ascending: false }),
      supabase.from('job_applications').select('id,status,interview_date,cover_letter,resume_url,feedback,created_at,applicant:profiles!job_applications_applicant_id_fkey(id,full_name,employee_id,email,department:departments!profiles_department_id_fkey(name)),job:job_openings!job_applications_job_id_fkey(id,title,department:departments!job_openings_department_id_fkey(name))').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('name'),
    ]);
    setJobs((jobsData || []) as unknown as JobRow[]);
    setApplications((appsData || []) as unknown as AppRow[]);
    setDepartments(depts || []);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('director-recruitment')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_openings' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_applications' }, () => fetchData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const openCreate = () => {
    setEditingJob(null);
    form.reset({ title: '', department_id: '', description: '', requirements: '', experience_required: '', skills_required: '', location: '', salary_range: '', vacancies: '1', closing_date: '' });
    setJobDialogOpen(true);
  };

  const openEdit = (j: JobRow) => {
    setEditingJob(j);
    form.reset({
      title: j.title, department_id: (j.department as any)?.id || '',
      description: j.description || '', requirements: j.requirements || '',
      experience_required: j.experience_required || '', skills_required: j.skills_required || '',
      location: j.location || '', salary_range: j.salary_range || '',
      vacancies: String(j.vacancies), closing_date: j.closing_date || '',
    });
    setJobDialogOpen(true);
  };

  const onSubmit = async (v: JobForm) => {
    setSaving(true);
    const payload = {
      title: v.title, department_id: v.department_id || null,
      description: v.description || null, requirements: v.requirements || null,
      experience_required: v.experience_required || null, skills_required: v.skills_required || null,
      location: v.location || null, salary_range: v.salary_range || null,
      vacancies: Number(v.vacancies), closing_date: v.closing_date || null,
    };
    if (editingJob) {
      const { error } = await supabase.from('job_openings').update(payload).eq('id', editingJob.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Job opening updated');
    } else {
      const { data: newJob, error } = await supabase.from('job_openings').insert({ ...payload, status: 'open', posted_by: profile?.id }).select('id').maybeSingle();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Job opening created');
      if (newJob?.id && payload.department_id) {
        notifyNewJobOpening(newJob.id, v.title, payload.department_id);
      }
    }
    setSaving(false);
    setJobDialogOpen(false);
    fetchData(true);
  };

  const toggleJobStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';
    const { error } = await supabase.from('job_openings').update({ status: newStatus }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Job ${newStatus === 'open' ? 'reopened' : 'closed'}`);
    fetchData(true);
  };

  const deleteJob = async (id: string) => {
    const { error } = await supabase.from('job_openings').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Job opening deleted');
    fetchData(true);
  };

  const updateApplication = async (id: string, status: string) => {
    setProcessing(id);
    const payload: Record<string, unknown> = { status };
    if (interviewDate && status === 'interview_scheduled') payload.interview_date = new Date(interviewDate).toISOString();
    if (feedback) payload.feedback = feedback;
    const { error } = await supabase.from('job_applications').update(payload).eq('id', id);
    if (error) { toast.error(error.message); setProcessing(null); return; }
    toast.success('Application updated');
    setViewApp(null);
    setFeedback('');
    setInterviewDate('');
    setProcessing(null);
    fetchData(true);
  };

  const filteredJobs = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !search || j.title.toLowerCase().includes(q) || ((j.department as any)?.name || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredApps = applications.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !search || (a.applicant?.full_name || '').toLowerCase().includes(q) || (a.job?.title || '').toLowerCase().includes(q);
    const matchJob = activeJobFilter === 'all' || a.job?.id === activeJobFilter;
    return matchSearch && matchJob;
  });

  const openCount = jobs.filter(j => j.status === 'open').length;
  const totalVacancies = jobs.filter(j => j.status === 'open').reduce((s, j) => s + j.vacancies, 0);
  const pendingReview = applications.filter(a => ['submitted', 'under_review'].includes(a.status)).length;
  const interviews = applications.filter(a => a.status === 'interview_scheduled').length;

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Recruitment</h1>
          <p className="text-sm text-muted-foreground">Manage job openings and hiring workflow</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchData(true)} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Create Job Opening
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: openCount, color: 'text-green-400' },
          { label: 'Total Vacancies', value: totalVacancies, color: 'text-primary' },
          { label: 'Pending Review', value: pendingReview, color: 'text-yellow-400' },
          { label: 'Interviews', value: interviews, color: 'text-purple-400' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className={`text-xl md:text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="jobs">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="jobs" className="flex-1 md:flex-none whitespace-nowrap">Job Openings</TabsTrigger>
          <TabsTrigger value="applications" className="flex-1 md:flex-none whitespace-nowrap">
            Applications
            {pendingReview > 0 && (
              <span className="ml-1.5 bg-yellow-500/20 text-yellow-400 text-xs px-1.5 py-0.5 rounded-full">{pendingReview}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Job Openings */}
        <TabsContent value="jobs" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs…" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Title', 'Department', 'Vacancies', 'Location', 'Closing', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : filteredJobs.length === 0
                      ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No job openings found</td></tr>
                      : filteredJobs.map(j => (
                          <tr key={j.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">{j.title}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{(j.department as any)?.name || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">{j.vacancies}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{j.location || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-xs">{j.closing_date || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={j.status === 'open' ? 'border-green-500/30 text-green-400 bg-green-500/10 text-xs' : 'border-muted-foreground/30 text-muted-foreground text-xs'}>{j.status}</Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex flex-wrap gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(j)}><Edit className="w-3.5 h-3.5" /></Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleJobStatus(j.id, j.status)}>
                                  {j.status === 'open' ? 'Close' : 'Reopen'}
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Job Opening?</AlertDialogTitle>
                                      <AlertDialogDescription>This will delete "{j.title}" and all its applications.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteJob(j.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Applications */}
        <TabsContent value="applications" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicants…" className="pl-9" />
            </div>
            <Select value={activeJobFilter} onValueChange={setActiveJobFilter}>
              <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Positions</SelectItem>
                {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Applicant', 'Position', 'Applied', 'Status', 'Interview', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <tr key={i} className="border-b border-border">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : filteredApps.length === 0
                      ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No applications found</td></tr>
                      : filteredApps.map(a => (
                          <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-medium text-foreground">{a.applicant?.full_name || '—'}</div>
                              <div className="text-xs text-muted-foreground">{a.applicant?.employee_id || a.applicant?.email || ''}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{a.job?.title || '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Badge variant="outline" className={`text-xs ${APP_STATUS_STYLES[a.status] || ''}`}>
                                {a.status.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                              {a.interview_date ? new Date(a.interview_date).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                                onClick={() => { setViewApp(a); setFeedback(a.feedback || ''); setInterviewDate(''); }}>
                                <Eye className="w-3.5 h-3.5" /> Review
                              </Button>
                            </td>
                          </tr>
                        ))
                  }
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Job Dialog */}
      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingJob ? 'Edit Job Opening' : 'Create Job Opening'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="title" rules={{ required: 'Title is required' }} render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Job Title</FormLabel>
                    <FormControl><Input placeholder="e.g. Senior Software Engineer" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="department_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                          {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vacancies" rules={{ required: true, min: { value: 1, message: 'Min 1' } }} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vacancies</FormLabel>
                    <FormControl><Input type="number" min="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl><Input placeholder="e.g. Remote / New York" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="salary_range" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Range</FormLabel>
                    <FormControl><Input placeholder="e.g. $80k – $120k" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="experience_required" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Experience Required</FormLabel>
                    <FormControl><Input placeholder="e.g. 3+ years" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="closing_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Closing Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="skills_required" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Required Skills (comma separated)</FormLabel>
                    <FormControl><Input placeholder="e.g. React, Node.js, PostgreSQL" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Job Description</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Describe the role and responsibilities…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="requirements" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Requirements</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="List qualification requirements…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setJobDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editingJob ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Application Review Dialog */}
      <Dialog open={!!viewApp} onOpenChange={open => { if (!open) { setViewApp(null); setFeedback(''); setInterviewDate(''); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Application Review</DialogTitle></DialogHeader>
          {viewApp && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ['Applicant', viewApp.applicant?.full_name || '—'],
                  ['Employee ID', viewApp.applicant?.employee_id || '—'],
                  ['Department', (viewApp.applicant?.department as any)?.name || '—'],
                  ['Position', viewApp.job?.title || '—'],
                  ['Applied Dept', (viewApp.job?.department as any)?.name || '—'],
                  ['Status', viewApp.status.replace(/_/g, ' ')],
                  ['Applied', new Date(viewApp.created_at).toLocaleDateString()],
                  ['Interview', viewApp.interview_date ? new Date(viewApp.interview_date).toLocaleDateString() : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-medium text-foreground capitalize">{v}</p>
                  </div>
                ))}
              </div>

              {/* Resume */}
              {viewApp.resume_url && (
                <div className="flex items-center flex-wrap gap-2 p-3 bg-muted/30 rounded-md border border-border">
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <span className="flex-1 min-w-0 text-sm text-foreground">Resume Attached</span>
                  <a href={viewApp.resume_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs">
                      <Eye className="w-3 h-3" /> View
                    </Button>
                  </a>
                  <a href={viewApp.resume_url} download>
                    <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs">
                      <FileDown className="w-3 h-3" /> Download
                    </Button>
                  </a>
                </div>
              )}

              {viewApp.cover_letter && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cover Letter</p>
                  <p className="text-sm bg-muted/30 rounded p-3 text-pretty">{viewApp.cover_letter}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <p className="font-medium flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Schedule Interview</p>
                <Input type="datetime-local" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">Feedback / Notes</p>
                <Textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="Add feedback…" />
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => { setViewApp(null); setFeedback(''); setInterviewDate(''); }}>Close</Button>
                {viewApp.status === 'submitted' && (
                  <Button variant="outline" className="gap-1" disabled={processing === viewApp.id} onClick={() => updateApplication(viewApp.id, 'under_review')}>
                    Move to Review
                  </Button>
                )}
                {['submitted','under_review'].includes(viewApp.status) && (
                  <Button className="gap-1 bg-purple-600 hover:bg-purple-700" disabled={processing === viewApp.id} onClick={() => updateApplication(viewApp.id, 'interview_scheduled')}>
                    <Calendar className="w-3.5 h-3.5" /> Schedule Interview
                  </Button>
                )}
                {viewApp.status === 'interview_scheduled' && (
                  <Button className="gap-1 bg-orange-500 hover:bg-orange-600" disabled={processing === viewApp.id} onClick={() => updateApplication(viewApp.id, 'offer_extended')}>
                    <Send className="w-3.5 h-3.5" /> Extend Offer
                  </Button>
                )}
                {viewApp.status === 'offer_extended' && (
                  <Button className="gap-1 bg-green-600 hover:bg-green-700" disabled={processing === viewApp.id} onClick={() => updateApplication(viewApp.id, 'hired')}>
                    <CheckCircle className="w-3.5 h-3.5" /> Mark Hired
                  </Button>
                )}
                <Button variant="destructive" className="gap-1" disabled={processing === viewApp.id} onClick={() => updateApplication(viewApp.id, 'rejected')}>
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReportExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Recruitment Report"
        columns={[
          { header: 'Position',    key: 'title' },
          { header: 'Department',  key: 'department', format: v => (v as any)?.name || '—' },
          { header: 'Vacancies',   key: 'vacancies',  format: v => String(v ?? '—') },
          { header: 'Status',      key: 'status' },
          { header: 'Deadline',    key: 'closing_date' },
          { header: 'Location',    key: 'location' },
        ] satisfies ReportColumn[]}
        rows={jobs as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}


const CANDIDATE_STATUS_STYLES: Record<string,string> = {
  applied:'border-blue-500/30 text-blue-400 bg-blue-500/10',
  screening:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  interview:'border-orange-500/30 text-orange-400 bg-orange-500/10',
  offer:'border-purple-500/30 text-purple-400 bg-purple-500/10',
  hired:'border-green-500/30 text-green-400 bg-green-500/10',
  rejected:'border-red-500/30 text-red-400 bg-red-500/10',
};

interface JobForm { title:string; description:string; requirements:string; location:string; salary_range:string; vacancies:string; department_id:string; closing_date:string; }
