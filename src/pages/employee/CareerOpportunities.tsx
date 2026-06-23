import { useEffect, useState, useCallback, useRef } from 'react';
import { Briefcase, MapPin, Calendar, Users, Send, Search, RefreshCw, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Upload, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { notifyJobApplication } from '@/lib/notifications';

const APP_STATUS_STYLES: Record<string,string> = {
  submitted: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  under_review: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  interview_scheduled: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
  offer_extended: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
  hired: 'border-green-500/30 text-green-400 bg-green-500/10',
  rejected: 'border-red-500/30 text-red-400 bg-red-500/10',
};

const APP_STATUS_ICON: Record<string, React.ReactNode> = {
  submitted: <Clock className="w-3 h-3" />,
  under_review: <Clock className="w-3 h-3" />,
  interview_scheduled: <Calendar className="w-3 h-3" />,
  offer_extended: <CheckCircle className="w-3 h-3" />,
  hired: <CheckCircle className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};

type JobRow = {
  id: string; title: string; status: string; vacancies: number;
  location?: string; salary_range?: string; description?: string;
  requirements?: string; experience_required?: string; skills_required?: string;
  closing_date?: string; created_at: string;
  department?: { id: string; name: string } | null;
};

type AppRow = {
  id: string; status: string; interview_date?: string; feedback?: string; created_at: string;
  job?: { id: string; title?: string; department?: { name?: string } | null } | null;
};

export default function CareerOpportunities() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [myApplications, setMyApplications] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [applyJob, setApplyJob] = useState<JobRow | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [applying, setApplying] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const resumeRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!profile) return;
    if (!silent) setLoading(true);

    const [{ data: jobsData }, { data: appsData }] = await Promise.all([
      supabase.from('job_openings')
        .select('id,title,status,vacancies,location,salary_range,description,requirements,experience_required,skills_required,closing_date,created_at,department:departments!job_openings_department_id_fkey(id,name)')
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('job_applications')
        .select('id,status,interview_date,feedback,created_at,job:job_openings!job_applications_job_id_fkey(id,title,department:departments!job_openings_department_id_fkey(name))')
        .eq('applicant_id', profile.id)
        .order('created_at', { ascending: false }),
    ]);

    setJobs((jobsData || []) as unknown as JobRow[]);
    const apps = (appsData || []) as unknown as AppRow[];
    setMyApplications(apps);
    setAppliedIds(new Set(apps.map(a => a.job?.id).filter(Boolean) as string[]));
    if (!silent) setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchData();
    if (!profile) return;
    const channel = supabase.channel(`career-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_openings' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_applications', filter: `applicant_id=eq.${profile.id}` }, () => fetchData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, profile]);

  const submitApplication = async () => {
    if (!applyJob || !profile) return;
    setApplying(true);

    let resumeUrl: string | null = null;

    // Upload resume PDF to Supabase Storage
    if (resumeFile) {
      if (resumeFile.size > 5 * 1024 * 1024) {
        toast.error('Resume must be under 5 MB');
        setApplying(false);
        return;
      }
      const path = `${profile.id}/${applyJob.id}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('resumes').upload(path, resumeFile, { upsert: true, contentType: 'application/pdf' });
      if (upErr) { toast.error('Failed to upload resume'); setApplying(false); return; }
      const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(path);
      resumeUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from('job_applications').insert({
      job_id: applyJob.id,
      applicant_id: profile.id,
      cover_letter: coverLetter.trim() || null,
      resume_url: resumeUrl,
      status: 'submitted',
    });
    if (error) {
      if (error.code === '23505') {
        toast.error('You have already applied for this position');
      } else {
        toast.error(error.message);
      }
      setApplying(false);
      return;
    }
    toast.success('Application submitted successfully!');
    // Notify dept manager + director about the application
    const deptId = (applyJob.department as any)?.id;
    if (deptId) {
      notifyJobApplication(
        profile.full_name || 'An applicant',
        deptId,
        applyJob.title,
        applyJob.id,
      );
    }
    setApplyJob(null);
    setCoverLetter('');
    setResumeFile(null);
    setApplying(false);
    fetchData(true);
  };

  const filteredJobs = jobs.filter(j =>
    !search ||
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    (j.department as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (j.skills_required || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-6 min-w-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Career Opportunities</h1>
          <p className="text-sm text-muted-foreground">Browse open positions and track your applications</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchData(true)} className="gap-1.5 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="openings">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="openings" className="flex-1 md:flex-none whitespace-nowrap">
            Open Positions
            {jobs.length > 0 && (
              <span className="ml-1.5 bg-primary/20 text-primary text-xs px-1.5 py-0.5 rounded-full">{jobs.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex-1 md:flex-none whitespace-nowrap">
            My Applications
            {myApplications.length > 0 && (
              <span className="ml-1.5 bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded-full">{myApplications.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Open Positions */}
        <TabsContent value="openings" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search positions, skills…" className="pl-9" />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-28" /></CardContent></Card>
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No open positions available at this time</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map(j => {
                const isExpanded = expandedJob === j.id;
                const alreadyApplied = appliedIds.has(j.id);
                return (
                  <Card key={j.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      {/* Header row */}
                      <div className="flex items-start gap-3 p-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Briefcase className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between flex-wrap gap-3">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground text-balance">{j.title}</h3>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {j.department && (
                                  <span className="text-xs text-muted-foreground">{(j.department as any)?.name}</span>
                                )}
                                {j.location && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <MapPin className="w-3 h-3" /> {j.location}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <Users className="w-3 h-3" /> {j.vacancies} vacancies
                                </span>
                                {j.closing_date && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                    <Calendar className="w-3 h-3" /> Closes {j.closing_date}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {alreadyApplied ? (
                                <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/10">Applied</Badge>
                              ) : (
                                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setApplyJob(j); setCoverLetter(''); }}>
                                  <Send className="w-3 h-3" /> Apply
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                                onClick={() => setExpandedJob(isExpanded ? null : j.id)}>
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-border space-y-3 text-sm">
                          {j.salary_range && (
                            <div>
                              <p className="text-xs text-muted-foreground">Salary Range</p>
                              <p className="text-foreground font-medium">{j.salary_range}</p>
                            </div>
                          )}
                          {j.experience_required && (
                            <div>
                              <p className="text-xs text-muted-foreground">Experience Required</p>
                              <p className="text-foreground">{j.experience_required}</p>
                            </div>
                          )}
                          {j.skills_required && (
                            <div>
                              <p className="text-xs text-muted-foreground">Required Skills</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {j.skills_required.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                                  <Badge key={skill} variant="outline" className="text-xs">{skill}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {j.description && (
                            <div>
                              <p className="text-xs text-muted-foreground">Description</p>
                              <p className="text-foreground text-pretty">{j.description}</p>
                            </div>
                          )}
                          {j.requirements && (
                            <div>
                              <p className="text-xs text-muted-foreground">Requirements</p>
                              <p className="text-foreground text-pretty">{j.requirements}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* My Applications */}
        <TabsContent value="applications" className="mt-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}</div>
          ) : myApplications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>You haven't applied for any positions yet</p>
              <p className="text-xs mt-1">Browse open positions and submit your application</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myApplications.map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3 flex-wrap">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Briefcase className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{a.job?.title || '—'}</p>
                          <p className="text-xs text-muted-foreground">{(a.job?.department as any)?.name || '—'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Applied {new Date(a.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={`text-xs flex items-center gap-1 ${APP_STATUS_STYLES[a.status] || ''}`}>
                          {APP_STATUS_ICON[a.status]}
                          {a.status.replace(/_/g, ' ')}
                        </Badge>
                        {a.interview_date && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {new Date(a.interview_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {a.feedback && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">Feedback</p>
                        <p className="text-sm text-foreground mt-0.5">{a.feedback}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Apply Dialog */}
      <Dialog open={!!applyJob} onOpenChange={open => { if (!open) { setApplyJob(null); setCoverLetter(''); setResumeFile(null); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply for {applyJob?.title}</DialogTitle>
          </DialogHeader>
          {applyJob && (
            <div className="space-y-4">
              {/* Job summary */}
              <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-foreground">{applyJob.title}</p>
                {applyJob.department && <p className="text-xs text-muted-foreground">{(applyJob.department as any)?.name}</p>}
                {applyJob.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {applyJob.location}</p>}
              </div>

              {/* Applicant info (read-only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Employee Name</p>
                  <p className="font-medium text-foreground">{profile?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Employee ID</p>
                  <p className="font-medium text-foreground">{profile?.employee_id || '—'}</p>
                </div>
              </div>

              {/* Resume upload */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Resume <span className="text-xs font-normal text-muted-foreground">(PDF only, max 5 MB)</span></p>
                {resumeFile ? (
                  <div className="flex items-center flex-wrap gap-2 p-3 bg-muted/30 rounded-md border border-border">
                    <FileText className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate">{resumeFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(resumeFile.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => setResumeFile(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => resumeRef.current?.click()}
                    className="w-full border-2 border-dashed border-border rounded-md p-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6" />
                    <span>Click to upload your resume (PDF)</span>
                  </button>
                )}
                <input ref={resumeRef} type="file" accept="application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setResumeFile(f); e.target.value = ''; }}
                />
              </div>

              {/* Cover letter */}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Cover Letter <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
                <Textarea
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  placeholder="Tell us why you're interested in this position and what makes you a great fit…"
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setApplyJob(null); setCoverLetter(''); setResumeFile(null); }}>Cancel</Button>
                <Button onClick={submitApplication} disabled={applying} className="gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  {applying ? 'Submitting…' : 'Submit Application'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
