import { useEffect, useState, useCallback } from 'react';
import { Plus, Megaphone, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Announcement, Department } from '@/types/types';
import { notifyAnnouncement } from '@/lib/notifications';

interface AnnouncementForm { title:string; content:string; priority:string; is_global:boolean; department_id:string; expires_at:string; }

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<AnnouncementForm>({ defaultValues: { title:'',content:'',priority:'normal',is_global:true,department_id:'',expires_at:'' } });

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('announcements').select('*, poster:profiles(id,full_name), department:departments(id,name)').order('created_at',{ascending:false});
    setAnnouncements(data||[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
    supabase.from('departments').select('*').order('name').then(({data})=>setDepartments(data||[]));
  }, [fetchAnnouncements]);

  const onSubmit = async (v: AnnouncementForm) => {
    setSaving(true);
    const { data: newAnn, error } = await supabase.from('announcements').insert({ title:v.title, content:v.content, priority:v.priority, is_global:v.is_global, department_id:v.is_global||!v.department_id?null:v.department_id, expires_at:v.expires_at||null, posted_by:profile!.id }).select('id').maybeSingle();
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Announcement posted');
    if (newAnn?.id) notifyAnnouncement(newAnn.id, v.title);
    setCreateOpen(false);
    form.reset();
    fetchAnnouncements();
    setSaving(false);
  };

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id',id);
    toast.success('Announcement deleted');
    fetchAnnouncements();
  };

  const PRIORITY_STYLES: Record<string,string> = {
    low:'border-muted-foreground/30 text-muted-foreground',
    normal:'border-blue-500/30 text-blue-400 bg-blue-500/10',
    high:'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
    urgent:'border-red-500/30 text-red-400 bg-red-500/10',
  };

  type AnnExtended = Announcement & { poster?:{full_name?:string}; department?:{name?:string} };
  const filtered = (announcements as AnnExtended[]).filter(a => a.title.toLowerCase().includes(search.toLowerCase())||a.content.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground text-balance">Company Announcements</h1><p className="text-sm text-muted-foreground">Broadcast messages to employees</p></div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1.5"/>New Announcement</Button></DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
            <DialogHeader><DialogTitle>Create Announcement</DialogTitle></DialogHeader>
            <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
              <FormField control={form.control} name="title" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Title</FormLabel><FormControl><Input {...field} placeholder="Important Notice"/></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="content" rules={{required:'Required'}} render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Content</FormLabel><FormControl><Textarea {...field} rows={4} placeholder="Announcement details..."/></FormControl><FormMessage/></FormItem>)}/>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField control={form.control} name="priority" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Priority</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                <FormField control={form.control} name="expires_at" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Expires</FormLabel><FormControl><Input {...field} type="date"/></FormControl><FormMessage/></FormItem>)}/>
              </div>
              <FormField control={form.control} name="is_global" render={({field})=>(<FormItem className="flex items-center flex-wrap gap-2"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormLabel className="text-sm font-normal">Send to all employees</FormLabel></FormItem>)}/>
              {!form.watch('is_global')&&(
                <FormField control={form.control} name="department_id" render={({field})=>(<FormItem><FormLabel className="text-sm font-normal">Department</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select department"/></SelectTrigger></FormControl><SelectContent>{departments.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><FormMessage/></FormItem>)}/>
              )}
              <div className="flex flex-wrap gap-2 pt-1"><Button type="button" variant="outline" className="flex-1 min-w-0" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button type="submit" className="flex-1 min-w-0" disabled={saving}>{saving?'Posting...':'Post'}</Button></div>
            </form></Form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search announcements..." className="pl-9"/></div>
      <div className="space-y-3">
        {loading?Array.from({length:4}).map((_,i)=><Card key={i}><CardContent className="p-4"><Skeleton className="h-20"/></CardContent></Card>)
        :filtered.length===0?<div className="text-center py-12 text-muted-foreground">No announcements</div>
        :filtered.map(a=>(
          <Card key={a.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Megaphone className="w-4 h-4 text-primary"/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                      <Badge variant="outline" className={`text-xs ${PRIORITY_STYLES[a.priority]||''}`}>{a.priority}</Badge>
                      {a.is_global?<Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">All Staff</Badge>:<Badge variant="outline" className="text-xs border-border text-muted-foreground">{a.department?.name||'Dept'}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.content}</p>
                    <div className="flex items-center flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span>By: {a.poster?.full_name||'—'}</span>
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                      {a.expires_at&&<span>Expires: {new Date(a.expires_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="w-7 h-7 shrink-0"><Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive"/></Button></AlertDialogTrigger>
                  <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm"><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle><AlertDialogDescription>This announcement will be permanently removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={()=>deleteAnnouncement(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
