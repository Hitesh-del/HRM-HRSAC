import { useEffect, useState, useCallback } from 'react';
import {
  Bell, Megaphone, CalendarOff, Briefcase, BookOpen, Package,
  FolderKanban, GraduationCap, Settings, CheckCheck, Check, Filter, ShieldAlert, Video, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  category: string;
  link_url: string | null;
  created_at: string;
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  announcement: <Megaphone className="w-4 h-4" />,
  leave:        <CalendarOff className="w-4 h-4" />,
  recruitment:  <Briefcase className="w-4 h-4" />,
  training:     <BookOpen className="w-4 h-4" />,
  asset:        <Package className="w-4 h-4" />,
  project:      <FolderKanban className="w-4 h-4" />,
  internship:   <GraduationCap className="w-4 h-4" />,
  system:       <Settings className="w-4 h-4" />,
  security:     <ShieldAlert className="w-4 h-4" />,
  meeting:      <Video className="w-4 h-4" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  announcement: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  leave:        'bg-orange-500/15 text-orange-400 border-orange-500/20',
  recruitment:  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  training:     'bg-purple-500/15 text-purple-400 border-purple-500/20',
  asset:        'bg-teal-500/15 text-teal-400 border-teal-500/20',
  project:      'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  internship:   'bg-primary/15 text-primary border-primary/20',
  system:       'bg-muted text-muted-foreground border-border',
  security:     'bg-rose-500/15 text-rose-400 border-rose-500/20',
  meeting:      'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
};

const CATEGORIES = ['all','announcement','leave','recruitment','training','asset','project','internship','system','security','meeting'];

const PAGE_SIZE = 25;

export default function NotificationsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async (pg = 0, cat = categoryFilter, read = readFilter) => {
    if (!profile) return;
    setLoading(true);
    let q = supabase
      .from('notifications')
      .select('id,title,message,is_read,category,link_url,created_at')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .range(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);

    if (cat !== 'all') q = q.eq('category', cat);
    if (read === 'unread') q = q.eq('is_read', false);
    if (read === 'read') q = q.eq('is_read', true);

    const { data } = await q;
    const list = (data || []) as Notification[];
    if (pg === 0) {
      setNotifications(list);
    } else {
      setNotifications(prev => [...prev, ...list]);
    }
    setHasMore(list.length === PAGE_SIZE + 1);
    setLoading(false);
  }, [profile, categoryFilter, readFilter]);

  const fetchUnread = useCallback(async () => {
    if (!profile) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  }, [profile]);

  useEffect(() => {
    setPage(0);
    fetchNotifications(0, categoryFilter, readFilter);
    fetchUnread();
  }, [profile, categoryFilter, readFilter]);

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`notif-page-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, () => {
        fetchNotifications(0, categoryFilter, readFilter);
        fetchUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, categoryFilter, readFilter, fetchNotifications, fetchUnread]);

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', profile.id).eq('is_read', false);
    fetchNotifications(0, categoryFilter, readFilter);
    fetchUnread();
  };

  const clearAll = async () => {
    if (!profile) return;
    await supabase.from('notifications').delete().eq('recipient_id', profile.id);
    setNotifications([]);
    setUnreadCount(0);
  };

  const markOneRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) await markOneRead(notif.id);
    if (notif.link_url) navigate(notif.link_url);
  };

  const filtered = notifications.filter(n => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground text-balance flex items-center flex-wrap gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All your notifications — real-time and role-based
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={markAllRead}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
              <Badge className="ml-1 h-5 px-1.5 text-[10px]">{unreadCount}</Badge>
            </Button>
          )}
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={clearAll}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-0 min-w-[180px] max-w-xs">
          <Input
            placeholder="Search notifications…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-3 h-9 text-sm"
          />
        </div>
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-full md:w-40 text-sm gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c === 'all' ? 'All Categories' : c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={v => { setReadFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-full md:w-32 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.filter(c => c !== 'all').map(cat => {
          const count = notifications.filter(n => n.category === cat && !n.is_read).length;
          if (!count) return null;
          return (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setPage(0); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${CATEGORY_COLOR[cat] || 'bg-muted text-muted-foreground border-border'}`}
            >
              {CATEGORY_ICON[cat]}
              <span className="capitalize">{cat}</span>
              <span className="bg-black/20 rounded-full px-1">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Notification list */}
      {loading && page === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No notifications found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {categoryFilter !== 'all' || readFilter !== 'all' || search
                ? 'Try adjusting your filters'
                : 'You\'re all caught up!'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left rounded-lg border transition-all hover:border-primary/30 hover:bg-muted/30 flex gap-4 px-4 py-3.5 items-start ${!n.is_read ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
            >
              {/* Icon */}
              <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center border ${CATEGORY_COLOR[n.category] || 'bg-muted text-muted-foreground border-border'}`}>
                {CATEGORY_ICON[n.category] || <Bell className="w-4 h-4" />}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                  <span className={`text-sm font-semibold truncate ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {n.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 shrink-0">
                    {format(new Date(n.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground text-pretty leading-relaxed">{n.message}</p>
                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium capitalize px-1.5 py-0.5 rounded border ${CATEGORY_COLOR[n.category] || ''}`}>
                    {CATEGORY_ICON[n.category]}
                    {n.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Read indicator / action */}
              <div className="shrink-0 mt-1 flex items-center gap-1.5">
                {!n.is_read ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      onClick={e => { e.stopPropagation(); markOneRead(n.id); }}
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
              </div>
            </button>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                const next = page + 1;
                setPage(next);
                fetchNotifications(next, categoryFilter, readFilter);
              }}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
