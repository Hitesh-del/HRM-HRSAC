import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, ShieldCheck, ShieldOff, Smartphone, Monitor, Trash2, LogIn, AlertTriangle, Search, RefreshCw, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/db/supabase';
import { formatDistanceToNow, format } from 'date-fns';

interface SecurityLog {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  device_id: string | null;
  device_name: string | null;
  browser: string | null;
  ip_address: string | null;
  event_type: string;
  verification_status: string | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  new_device_login:           { label: 'New Device',        icon: <Smartphone className="w-3.5 h-3.5" />,    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  otp_verification_success:   { label: 'OTP Verified',      icon: <ShieldCheck className="w-3.5 h-3.5" />,   color: 'bg-green-500/15 text-green-400 border-green-500/20' },
  otp_verification_failed:    { label: 'OTP Failed',        icon: <ShieldOff className="w-3.5 h-3.5" />,     color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  multiple_failed_attempts:   { label: 'Multiple Failures', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  trusted_device_login:       { label: 'Trusted Login',     icon: <LogIn className="w-3.5 h-3.5" />,         color: 'bg-primary/15 text-primary border-primary/20' },
  device_removed:             { label: 'Device Removed',    icon: <Trash2 className="w-3.5 h-3.5" />,        color: 'bg-muted text-muted-foreground border-border' },
};

const EVENT_TYPES = ['all', 'new_device_login', 'otp_verification_success', 'otp_verification_failed', 'multiple_failed_attempts', 'trusted_device_login', 'device_removed'];

const PAGE_SIZE = 30;

function deviceIcon(name: string | null) {
  if (!name) return <Monitor className="w-4 h-4" />;
  const n = name.toLowerCase();
  if (n.includes('phone') || n.includes('iphone') || n.includes('android')) return <Smartphone className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

export default function SecurityLogsPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(async (pg = 0, evt = eventFilter, role = roleFilter, q = search) => {
    setLoading(true);
    let query = supabase
      .from('security_logs')
      .select('id,user_id,user_name,user_role,device_id,device_name,browser,ip_address,event_type,verification_status,created_at')
      .order('created_at', { ascending: false })
      .range(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);

    if (evt !== 'all') query = query.eq('event_type', evt);
    if (role !== 'all') query = query.eq('user_role', role);
    if (q.trim()) query = query.or(`user_name.ilike.%${q}%,device_name.ilike.%${q}%,browser.ilike.%${q}%`);

    const { data } = await query;
    const rows = (data as SecurityLog[]) || [];
    setHasMore(rows.length === PAGE_SIZE + 1);
    setLogs(pg === 0 ? rows.slice(0, PAGE_SIZE) : prev => [...prev, ...rows.slice(0, PAGE_SIZE)]);
    setLoading(false);
  }, [eventFilter, roleFilter, search]);

  useEffect(() => {
    setPage(0);
    fetchLogs(0, eventFilter, roleFilter, search);
  }, [eventFilter, roleFilter]);

  // debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); fetchLogs(0, eventFilter, roleFilter, search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchLogs(next, eventFilter, roleFilter, search);
  };

  const stats = {
    total: logs.length,
    newDevices: logs.filter(l => l.event_type === 'new_device_login').length,
    otpVerified: logs.filter(l => l.event_type === 'otp_verification_success').length,
    failures: logs.filter(l => l.event_type === 'otp_verification_failed' || l.event_type === 'multiple_failed_attempts').length,
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center flex-wrap gap-2 text-balance">
          <ShieldAlert className="w-6 h-6 text-primary shrink-0" />
          Security Logs
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
          Monitor device logins, OTP verifications, and security events across all users.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: stats.total, color: 'text-foreground', bg: 'bg-muted/40' },
          { label: 'New Devices', value: stats.newDevices, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'OTP Verified', value: stats.otpVerified, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Failures', value: stats.failures, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map(s => (
          <Card key={s.label} className="h-full">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl md:text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center flex-wrap gap-2">
            <Filter className="w-4 h-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by user, device, browser…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={eventFilter} onValueChange={v => { setEventFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full md:w-52">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t} value={t}>
                  {t === 'all' ? 'All Events' : (EVENT_META[t]?.label ?? t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(0); }}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="director">Director</SelectItem>
              <SelectItem value="management">Management</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="intern">Intern</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setPage(0); fetchLogs(0, eventFilter, roleFilter, search); }}
            className="shrink-0 gap-1.5 text-muted-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardContent className="p-0">
          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Device</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Browser</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">IP Address</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Event</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24 bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No security events found.</p>
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const meta = EVENT_META[log.event_type] ?? { label: log.event_type, icon: <ShieldAlert className="w-3.5 h-3.5" />, color: 'bg-muted text-muted-foreground border-border' };
                    return (
                      <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-foreground">{log.user_name || '—'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="capitalize text-muted-foreground text-xs">{log.user_role || '—'}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {deviceIcon(log.device_name)}
                            <span className="text-xs">{log.device_name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">{log.browser || '—'}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground font-mono">{log.ip_address || '—'}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className={`text-[10px] gap-1 px-1.5 ${meta.color}`}>
                            {meta.icon}
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <p className="text-xs text-foreground">{format(new Date(log.created_at), 'MMM d, yyyy')}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(log.created_at), 'HH:mm:ss')} · {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading} className="w-full text-muted-foreground">
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
