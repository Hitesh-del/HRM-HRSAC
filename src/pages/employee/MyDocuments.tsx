import { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function MyDocuments() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<{ id: string; title: string; document_type: string; file_url?: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase.from('documents').select('id,title,document_type,file_url,created_at').eq('employee_id', profile.id).order('created_at', { ascending: false }).then(({ data }) => { setDocuments(data || []); setLoading(false); });
  }, [profile]);

  const TYPE_LABELS: Record<string, string> = { offer_letter: 'Offer Letter', contract: 'Contract', policy: 'Policy', certificate: 'Certificate', other: 'Other' };

  return (
    <div className="p-4 md:p-6 space-y-4 min-w-0">
      <div><h1 className="text-xl font-bold text-foreground text-balance">Documents</h1><p className="text-sm text-muted-foreground">Your employment documents</p></div>
      {loading ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16" /></CardContent></Card>)}</div>
        : documents.length === 0 ? <div className="text-center py-12 text-muted-foreground">No documents available</div>
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {documents.map(d => (
                <Card key={d.id}><CardContent className="p-4 flex items-center flex-wrap gap-3">
                  <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{d.title}</h3>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs border-border text-muted-foreground">{TYPE_LABELS[d.document_type] || d.document_type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {d.file_url && <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 text-muted-foreground hover:text-primary" asChild><a href={d.file_url} target="_blank" rel="noopener noreferrer" download><Download className="w-4 h-4" /></a></Button>}
                </CardContent></Card>
              ))}
            </div>
          )}
    </div>
  );
}
