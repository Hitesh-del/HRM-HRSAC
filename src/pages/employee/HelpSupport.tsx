import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, HelpCircle, Paperclip, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_STYLES: Record<string, string> = {
  open:        'border-blue-500/30 text-blue-400 bg-blue-500/10',
  in_progress: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  resolved:    'border-green-500/30 text-green-400 bg-green-500/10',
  closed:      'border-muted-foreground/30 text-muted-foreground',
};

const PRIORITY_STYLES: Record<string, string> = {
  low:    'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  high:   'border-red-500/30 text-red-400 bg-red-500/10',
};

const CATEGORIES = [
  { value: 'technical_issue',  label: 'Technical Issue' },
  { value: 'hr_issue',         label: 'HR Issue' },
  { value: 'payroll_issue',    label: 'Payroll Issue' },
  { value: 'attendance_issue', label: 'Attendance Issue' },
  { value: 'leave_issue',      label: 'Leave Issue' },
  { value: 'recruitment_issue',label: 'Recruitment Issue' },
  { value: 'asset_issue',      label: 'Asset Issue' },
  { value: 'other',            label: 'Other' },
];

interface TicketForm { subject: string; category: string; priority: string; description: string; }
interface Ticket { id: string; subject: string; category: string; status: string; priority: string; attachment_url?: string; created_at: string; }

export default function HelpSupport() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<TicketForm>({
    defaultValues: { subject: '', category: 'technical_issue', priority: 'medium', description: '' },
  });

  const fetchTickets = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('support_tickets')
      .select('id,subject,category,status,priority,attachment_url,created_at')
      .eq('employee_id', profile.id)
      .order('created_at', { ascending: false });
    setTickets((data || []) as Ticket[]);
  }, [profile]);

  useEffect(() => {
    fetchTickets();
    if (!profile) return;
    const ch = supabase.channel('help-support-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets',
        filter: `employee_id=eq.${profile.id}` }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchTickets, profile]);

  const onSubmit = async (v: TicketForm) => {
    if (!profile) return;
    setSaving(true);

    let attachmentUrl: string | null = null;

    // Upload attachment if provided
    if (attachFile) {
      if (attachFile.size > 5 * 1024 * 1024) {
        toast.error('Attachment must be under 5 MB');
        setSaving(false);
        return;
      }
      const ext = attachFile.name.split('.').pop();
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('resumes').upload(path, attachFile, { upsert: true });
      if (upErr) { toast.error('Failed to upload attachment'); setSaving(false); return; }
      const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from('support_tickets').insert({
      employee_id: profile.id,
      subject: v.subject,
      category: v.category,
      description: v.description,
      priority: v.priority,
      status: 'open',
      attachment_url: attachmentUrl,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Support ticket created successfully');
      setCreateOpen(false);
      form.reset();
      setAttachFile(null);
      fetchTickets();
    }
    setSaving(false);
  };

  const catLabel = (val: string) =>
    CATEGORIES.find(c => c.value === val)?.label || val.replace(/_/g, ' ');

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance">Help & Support</h1>
          <p className="text-sm text-muted-foreground">Submit and track support requests</p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { if (!o) { setAttachFile(null); } setCreateOpen(o); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" />New Ticket</Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Support Ticket</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
                <FormField control={form.control} name="subject" rules={{ required: 'Subject is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Subject</FormLabel>
                      <FormControl><Input {...field} placeholder="Brief description of your issue" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <FormField control={form.control} name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField control={form.control} name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-normal">Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField control={form.control} name="description" rules={{ required: 'Description is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} placeholder="Describe your issue in detail…" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Attachment */}
                <div className="space-y-1.5">
                  <p className="text-sm font-normal text-muted-foreground">Attachment <span className="text-xs">(optional, max 5 MB)</span></p>
                  {attachFile ? (
                    <div className="flex items-center flex-wrap gap-2 p-2 bg-muted/30 rounded-md border border-border">
                      <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1 min-w-0 truncate">{attachFile.name}</span>
                      <button type="button" onClick={() => setAttachFile(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full border border-dashed border-border rounded-md p-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
                      <Paperclip className="w-4 h-4" /> Click to attach a file
                    </button>
                  )}
                  <input ref={fileRef} type="file" className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setAttachFile(f); e.target.value = ''; }}
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1 min-w-0" onClick={() => { setCreateOpen(false); setAttachFile(null); }}>Cancel</Button>
                  <Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving ? 'Submitting…' : 'Submit Ticket'}</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No support tickets yet</p>
          <p className="text-sm mt-1">Create a ticket for any HR, payroll, or technical issue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{t.subject}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground capitalize">{catLabel(t.category)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                      {t.attachment_url && (
                        <a href={t.attachment_url} target="_blank" rel="noreferrer"
                          className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                          <ExternalLink className="w-3 h-3" /> Attachment
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs ${PRIORITY_STYLES[t.priority] || ''}`}>{t.priority}</Badge>
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[t.status] || ''}`}>{t.status.replace('_', ' ')}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


