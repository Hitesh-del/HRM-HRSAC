import { useEffect, useState, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Megaphone, CalendarOff, Briefcase, BookOpen, Package, FolderKanban, GraduationCap, Settings, X, ShieldAlert, Video, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

// Synthesize a soft two-tone chime using Web Audio API — no files, no deps
function playNotifChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.18, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    // Two-note chime: high note then slightly lower note
    playTone(1046, 0,    0.18);   // C6
    playTone(880,  0.12, 0.22);   // A5

    // Auto-close context after chime finishes
    setTimeout(() => ctx.close(), 600);
  } catch {
    // Silently ignore if Web Audio API is unavailable
  }
}

type NotifCategory =
  | 'announcement' | 'leave' | 'recruitment' | 'training'
  | 'asset' | 'project' | 'internship' | 'system' | string;

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  category: NotifCategory;
  link_url: string | null;
  created_at: string;
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  announcement: <Megaphone className="w-3.5 h-3.5" />,
  leave:        <CalendarOff className="w-3.5 h-3.5" />,
  recruitment:  <Briefcase className="w-3.5 h-3.5" />,
  training:     <BookOpen className="w-3.5 h-3.5" />,
  asset:        <Package className="w-3.5 h-3.5" />,
  project:      <FolderKanban className="w-3.5 h-3.5" />,
  internship:   <GraduationCap className="w-3.5 h-3.5" />,
  system:       <Settings className="w-3.5 h-3.5" />,
  security:     <ShieldAlert className="w-3.5 h-3.5" />,
  meeting:      <Video className="w-3.5 h-3.5" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  announcement: 'bg-yellow-500/15 text-yellow-400',
  leave:        'bg-orange-500/15 text-orange-400',
  recruitment:  'bg-blue-500/15 text-blue-400',
  training:     'bg-purple-500/15 text-purple-400',
  asset:        'bg-teal-500/15 text-teal-400',
  project:      'bg-indigo-500/15 text-indigo-400',
  internship:   'bg-primary/15 text-primary',
  system:       'bg-muted text-muted-foreground',
  security:     'bg-rose-500/15 text-rose-400',
  meeting:      'bg-cyan-500/15 text-cyan-400',
};

export function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Prevents chime firing on the initial data load
  const isInitialLoad = useRef(true);

  const getRolePath = useCallback(() => {
    if (!profile) return '/employee';
    if (profile.role === 'director') return '/director';
    if (profile.role === 'management') return '/management';
    return '/employee';
  }, [profile]);

  const fetchNotifications = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id,title,message,is_read,category,link_url,created_at')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    const list = (data || []) as Notification[];
    setNotifications(list);
    setUnreadCount(list.filter(n => !n.is_read).length);
    setLoading(false);
  }, [profile]);

  // Initial load + realtime subscription
  useEffect(() => {
    if (!profile) return;
    // Mark initial load complete after first fetch
    fetchNotifications().then(() => { isInitialLoad.current = false; });
    const channel = supabase
      .channel(`notif-bell-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`,
      }, () => {
        // Play chime only for genuinely new notifications, not the initial load
        if (!isInitialLoad.current) playNotifChime();
        fetchNotifications();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', profile.id)
      .eq('is_read', false);
    fetchNotifications();
  };

  const clearAll = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .delete()
      .eq('recipient_id', profile.id);
    setNotifications([]);
    setUnreadCount(0);
  };

  const markOneRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.is_read) await markOneRead(notif.id);
    if (notif.link_url) {
      navigate(notif.link_url);
      setOpen(false);
    }
  };

  const openHistory = () => {
    navigate(`${getRolePath()}/notifications`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative w-8 h-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(prev => !prev)}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-10 w-80 md:w-96 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <Badge className="h-5 px-1.5 text-[10px]">{unreadCount} new</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={markAllRead}
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
                  onClick={clearAll}
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3 h-3" /> Clear all
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[420px]">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map(n => (
                  <button
                    key={n.id}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex gap-3 items-start ${!n.is_read ? 'bg-primary/5' : ''}`}
                    onClick={() => handleNotifClick(n)}
                  >
                    {/* Category icon pill */}
                    <span className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${CATEGORY_COLOR[n.category] || 'bg-muted text-muted-foreground'}`}>
                      {CATEGORY_ICON[n.category] || <Bell className="w-3.5 h-3.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs font-semibold truncate ${!n.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {n.title}
                        </span>
                        {!n.is_read && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 text-pretty">{n.message}</p>
                      <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {!n.is_read && (
                      <button
                        className="shrink-0 mt-1 text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); markOneRead(n.id); }}
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-primary hover:text-primary h-7"
              onClick={openHistory}
            >
              View all notifications
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
