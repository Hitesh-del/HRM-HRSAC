/**
 * TrustedDevicesPanel — shared component used in Settings → Security tab
 * for Director, Management, and Employee panels.
 */
import { useEffect, useState, useCallback } from 'react';
import { Monitor, Smartphone, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { notifyDeviceRemoved } from '@/lib/notifications';

interface TrustedDevice {
  id: string;
  device_id: string;
  device_name: string;
  browser: string;
  ip_address: string | null;
  verified_at: string;
  last_login_at: string;
  is_active: boolean;
}

function deviceIcon(deviceName: string) {
  const name = deviceName.toLowerCase();
  if (name.includes('phone') || name.includes('iphone') || name.includes('android')) {
    return <Smartphone className="w-4 h-4" />;
  }
  return <Monitor className="w-4 h-4" />;
}

// Current device fingerprint (same algorithm as LoginPage)
function getCurrentDeviceId(): string {
  const raw = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    navigator.platform,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function TrustedDevicesPanel() {
  const { profile } = useAuth();
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const currentDeviceId = getCurrentDeviceId();

  const fetchDevices = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('trusted_devices')
      .select('id,device_id,device_name,browser,ip_address,verified_at,last_login_at,is_active')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .order('last_login_at', { ascending: false });
    setDevices((data as TrustedDevice[]) || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRemove = async (device: TrustedDevice) => {
    if (!profile) return;
    setRemoving(device.id);
    try {
      const { error } = await supabase
        .from('trusted_devices')
        .delete()
        .eq('id', device.id);

      if (error) { toast.error(error.message); return; }

      // Log device removal in security_logs
      await supabase.from('security_logs').insert({
        user_id: profile.id,
        user_name: profile.full_name || '',
        user_role: profile.role || '',
        device_id: device.device_id,
        device_name: device.device_name,
        browser: device.browser,
        ip_address: device.ip_address || null,
        event_type: 'device_removed',
        verification_status: 'direct',
      });

      notifyDeviceRemoved(profile.id, device.device_name);
      toast.success(`Device "${device.device_name}" removed.`);
      setDevices(prev => prev.filter(d => d.id !== device.id));
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Trusted Devices
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full bg-muted" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Trusted Devices
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchDevices} className="h-7 px-2 text-xs gap-1.5 text-muted-foreground">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">No trusted devices found.</p>
            <p className="text-xs text-muted-foreground mt-1">Devices are added after OTP verification on a new device.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map(device => {
              const isCurrent = device.device_id === currentDeviceId;
              return (
                <div key={device.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isCurrent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {deviceIcon(device.device_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground truncate">{device.device_name}</p>
                      {isCurrent && <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary shrink-0">Current</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{device.browser}</p>
                    <p className="text-xs text-muted-foreground">
                      Last login {formatDistanceToNow(new Date(device.last_login_at), { addSuffix: true })}
                      {device.ip_address && <span className="ml-2 opacity-60">· {device.ip_address}</span>}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removing === device.id}
                        className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Trusted Device</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove <strong>{device.device_name}</strong>? The next login from this device will require OTP verification.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemove(device)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove Device
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
