import { useEffect, useState, useCallback } from 'react';
import { Briefcase, Users, Calendar, Eye, MessageSquare, ThumbsUp, FileDown, FileText } from 'lucide-react';
import { ReportExportDialog } from '@/components/common/ReportExportDialog';
import type { ReportColumn } from '@/lib/reportExport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface JobRow {
  id: string; title: string; status: string; vacancies: number; location?: string;
  description?: string; requirements?: string; experience_required?: string; skills_required?: string;
  salary_range?: string; closing_date?: string; created_at: string;
  department?: { id: string; name: string } | null;
}
interface AppRow {
  id: string; status: string; cover_letter?: string; resume_url?: string; interview_date?: string; feedback?: string; created_at: string;
  applicant?: { id: string; full_name?: string; employee_id?: string; email?: string; department?: { name?: string } | null } | null;
  job?: { id: string; title?: string } | null;
}

const APP_STATUS_STYLES: Record<string, string> = {
  submitted:          'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  under_review:       'border-blue-500/30 text-blue-400 bg-blue-500/10',
  interview_scheduled:'border-purple-500/30 text-purple-400 bg-purple-500/10',
  offer_extended:     'border-orange-500/30 text-orange-400 bg-orange-500/10',
  hired:              'border-green-500/30 text-green-400 bg-green-500/10',
  rejected:           'border-red-500/30 text-red-400 bg-red-500/10',
};

const JOB_STATUS_STYLES: Record<string, string> = {
  open:   'border-green-500/30 text-green-400 bg-green-500/10',
  closed: 'border-muted-foreground/30 text-muted-foreground bg-muted/10',
  draft:  'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
};

export default function MgmtRecruitment() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewApp, setViewApp] = useState<AppRow | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [interviewDate, setInterviewDate] = useState('');

  const fetchData = useCallback(async () => {
    if (!profile?.department_id) { setLoading(false); return; }
    setLoading(true);
    const [jobsRes] = await Promise.all([
      supabase.from('job_openings')
        .select('id,title,status,vacancies,location,description,requirements,experience_required,skills_required,salary_range,closing_date,created_at,department:departments(id,name)')
        .eq('department_id', profile.department_id)
        .order('created_at', { ascending: false }),
    ]);
    const jobData = (jobsRes.data || []) as unknown as JobRow[];
    setJobs(jobData);

    const jobIds = jobData.map(j => j.id);

    // Dept members — for cross-job application visibility
    const { data: deptMembers } = await supabase
      .from('profiles').select('id').eq('department_id', profile.department_id).eq('is_active', true);
    const deptMemberIds = (deptMembers || []).map((m: any) => m.id);

    const appSelect = 'id,status,cover_letter,resume_url,interview_date,feedback,created_at,applicant:profiles!job_applications_applicant_id_fkey(id,full_name,employee_id,email,department:departments!profiles_department_id_fkey(name)),job:job_openings!job_applications_job_id_fkey(id,title)';
    const seen = new Set<string>();

    const queries: Promise<{ data: any[] | null }>[] = [];
    if (jobIds.length > 0)
      queries.push(supabase.from('job_applications').select(appSelect).in('job_id', jobIds).order('created_at', { ascending: false }) as any);
    if (deptMemberIds.length > 0)
      queries.push(supabase.from('job_applications').select(appSelect).in('applicant_id', deptMemberIds).order('created_at', { ascending: false }) as any);

    if (queries.length > 0) {
      const results = await Promise.all(queries);
      const allApps = results.flatMap(r => r.data || []);
      const uniqueApps = allApps.filter((a: any) => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
      setApplications(uniqueApps as unknown as AppRow[]);
    } else {
      setApplications([]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!profile?.department_id) return;
    const ch = supabase.channel('mgmt-recruit-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_openings' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_applications' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, fetchData]);

  const updateStatus = async (appId: string, newStatus: string, extra?: { feedback?: string; interview_date?: string }) => {
    setProcessing(appId);
    const payload: Record<string, string | null> = { status: newStatus };
    if (extra?.feedback) payload.feedback = extra.feedback;
    if (extra?.interview_date) payload.interview_date = new Date(extra.interview_date).toISOString();
    const { error } = await supabase.from('job_applications').update(payload).eq('id', appId);
    if (error) { toast.error(error.message); }
    else {
      toast.success(`Candidate status updated to "${newStatus.replace(/_/g, ' ')}"`);
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus, ...extra } : a));
      if (viewApp?.id === appId) setViewApp(prev => prev ? { ...prev, status: newStatus, ...extra } : null);
    }
    setProcessing(null);
  };

  const filteredApps = statusFilter === 'all' ? applications : applications.filter(a => a.status === statusFilter);

  const stats = {
    openJobs: jobs.filter(j => j.status === 'open').length,
    totalApps: applications.length,
    interviews: applications.filter(a => a.status === 'interview_scheduled').length,
    offers: applications.filter(a => ['offer_extended','hired'].includes(a.status)).length,
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Recruitment</h1>
          <p className="text-sm text-muted-foreground">Department recruitment pipeline</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 shrink-0">
          <FileDown className="w-3.5 h-3.5" /> Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', value: stats.openJobs, icon: Briefcase, cls: 'text-primary' },
          { label: 'Applications', value: stats.totalApps, icon: Users, cls: 'text-blue-400' },
          { label: 'Interviews', value: stats.interviews, icon: Calendar, cls: 'text-purple-400' },
          { label: 'Offers/Hired', value: stats.offers, icon: ThumbsUp, cls: 'text-green-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label}><CardContent className="p-4 flex items-center flex-wrap gap-3">
            <Icon className={`w-7 h-7 ${cls} shrink-0`} />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold text-foreground">{value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="positions">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="positions" className="flex-1 min-w-0 md:flex-none gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Open Positions</TabsTrigger>
          <TabsTrigger value="applications" className="flex-1 min-w-0 md:flex-none gap-1.5"><Users className="w-3.5 h-3.5" /> Applications ({applications.length})</TabsTrigger>
        </TabsList>

        {/* ── POSITIONS TAB ── */}
        <TabsContent value="positions" className="mt-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24" /></CardContent></Card>)}</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Briefcase className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No job openings for your department</p>
              <p className="text-sm text-muted-foreground">Job openings created by the Director will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {jobs.map(j => {
                const appCount = applications.filter(a => (a.job as any)?.id === j.id).length;
                return (
                  <Card key={j.id} className="h-full">
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between flex-wrap gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{j.title}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <Badge variant="outline" className={`text-xs ${JOB_STATUS_STYLES[j.status] || ''}`}>{j.status}</Badge>
                            {j.location && <span className="text-xs text-muted-foreground">{j.location}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Vacancies</p>
                          <p className="text-lg font-bold text-primary">{j.vacancies}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {j.salary_range && <span>💰 {j.salary_range}</span>}
                        {j.experience_required && <span>🎓 {j.experience_required}</span>}
                        {j.closing_date && <span>📅 Closes {new Date(j.closing_date).toLocaleDateString()}</span>}
                      </div>
                      {j.skills_required && (
                        <div className="flex flex-wrap gap-1">
                          {j.skills_required.split(',').slice(0,4).map(s => (
                            <Badge key={s} variant="secondary" className="text-xs">{s.trim()}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-border">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{appCount} applicant{appCount !== 1 ? 's' : ''}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── APPLICATIONS TAB ── */}
        <TabsContent value="applications" className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="interview_scheduled">Interview Scheduled</SelectItem>
                <SelectItem value="offer_extended">Offer Extended</SelectItem>
                <SelectItem value="hired">Hired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filteredApps.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Users className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No applications found</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {['Candidate', 'Department', 'Position', 'Applied', 'Interview Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApps.map(a => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{(a.applicant as any)?.full_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{(a.applicant as any)?.employee_id || ''}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{(a.applicant as any)?.department?.name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{(a.job as any)?.title || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {a.interview_date ? new Date(a.interview_date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-xs ${APP_STATUS_STYLES[a.status] || ''}`}>{a.status.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => { setViewApp(a); setFeedback(a.feedback || ''); setInterviewDate(a.interview_date ? new Date(a.interview_date).toISOString().split('T')[0] : ''); }}>
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Application Detail Dialog */}
      <Dialog open={!!viewApp} onOpenChange={v => !v && setViewApp(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application – {(viewApp?.applicant as any)?.full_name || '—'}</DialogTitle>
          </DialogHeader>
          {viewApp && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={`text-xs ${APP_STATUS_STYLES[viewApp.status] || ''}`}>{viewApp.status.replace(/_/g, ' ')}</Badge>
                <span className="text-xs text-muted-foreground">Applied: {new Date(viewApp.created_at).toLocaleDateString()}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-muted-foreground">Applicant</p><p className="font-medium text-foreground">{(viewApp.applicant as any)?.full_name || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Employee ID</p><p className="font-medium text-foreground">{(viewApp.applicant as any)?.employee_id || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Department</p><p className="font-medium text-foreground">{(viewApp.applicant as any)?.department?.name || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Position</p><p className="font-medium text-foreground">{(viewApp.job as any)?.title || '—'}</p></div>
              </div>

              {/* Resume */}
              {viewApp.resume_url ? (
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
              ) : (
                <p className="text-xs text-muted-foreground italic">No resume uploaded</p>
              )}
              {viewApp.cover_letter && (
                <div><p className="text-xs font-medium text-muted-foreground mb-1">Cover Letter</p><p className="text-sm text-foreground bg-muted/30 rounded-md p-3 text-pretty">{viewApp.cover_letter}</p></div>
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Interview Date</p>
                <Input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Feedback / Notes</p>
                <Textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Add interview notes or feedback..." />
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {viewApp.status === 'submitted' && (
                  <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" disabled={processing === viewApp.id}
                    onClick={() => updateStatus(viewApp.id, 'under_review', { feedback })}>
                    Move to Review
                  </Button>
                )}
                {['submitted','under_review'].includes(viewApp.status) && (
                  <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700" disabled={processing === viewApp.id || !interviewDate}
                    onClick={() => updateStatus(viewApp.id, 'interview_scheduled', { feedback, interview_date: interviewDate })}>
                    <Calendar className="w-3.5 h-3.5" /> Schedule Interview
                  </Button>
                )}
                {viewApp.status === 'interview_scheduled' && (
                  <Button size="sm" className="gap-1.5 bg-orange-600 hover:bg-orange-700" disabled={processing === viewApp.id}
                    onClick={() => updateStatus(viewApp.id, 'offer_extended', { feedback })}>
                    <ThumbsUp className="w-3.5 h-3.5" /> Recommend for Offer
                  </Button>
                )}
                {!['hired','rejected'].includes(viewApp.status) && (
                  <Button size="sm" variant="destructive" disabled={processing === viewApp.id}
                    onClick={() => updateStatus(viewApp.id, 'rejected', { feedback })}>
                    Reject
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setViewApp(null)} className="ml-auto">Close</Button>
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
          { header: 'Position',   key: 'title' },
          { header: 'Vacancies',  key: 'vacancies',    format: v => String(v ?? '—') },
          { header: 'Status',     key: 'status' },
          { header: 'Deadline',   key: 'closing_date' },
          { header: 'Location',   key: 'location' },
        ] satisfies ReportColumn[]}
        rows={jobs as unknown as Record<string, unknown>[]}
        dateKey="created_at"
      />
    </div>
  );
}
