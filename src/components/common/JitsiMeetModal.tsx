// DailyMeetModal — replaces Jitsi/JaaS with Daily.co iframe embed
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Maximize2, Minimize2, Video, LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/db/supabase';
import type { UserRole } from '@/types/types';

interface JitsiMeetModalProps {
  roomId: string;
  meetingId: string;
  userId: string;
  displayName: string;
  userEmail: string;
  userRole: UserRole;
  isModerator: boolean;
  meetingTitle: string;
  onClose: () => void;
}

// ─── Component (exported with original name for zero-change import compatibility) ─
export function JitsiMeetModal({
  roomId,
  meetingId,
  userId,
  displayName,
  userRole,
  isModerator,
  meetingTitle,
  onClose,
}: JitsiMeetModalProps) {
  const navigate = useNavigate();

  const [roomUrl,      setRoomUrl]      = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [iframeReady,  setIframeReady]  = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const joinTimeRef     = useRef<Date | null>(null);
  const hasJoinedRef    = useRef(false);
  const isLeavingRef    = useRef(false);
  const onCloseRef      = useRef(onClose);
  const navigateRef     = useRef(navigate);
  const userRoleRef     = useRef(userRole);
  const meetingIdRef    = useRef(meetingId);
  const userIdRef       = useRef(userId);
  const roomIdRef       = useRef(roomId);

  useEffect(() => { onCloseRef.current  = onClose;    });
  useEffect(() => { navigateRef.current = navigate;   });
  useEffect(() => { userRoleRef.current = userRole;   });

  // ─── Create / fetch Daily.co room on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchRoom = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke<{ url: string; name: string }>(
        'create-daily-room',
        { body: { roomId: roomIdRef.current } },
      );

      if (cancelled) return;

      if (fnError || !data?.url) {
        const detail = fnError ? await fnError.context?.text?.() : 'No URL returned';
        console.error('[Daily Meeting] Room fetch failed:', detail);
        setError('Could not create meeting room. Please check your Daily.co API key and try again.');
        setLoading(false);
        return;
      }

      console.log('[Daily Meeting] Room URL ready:', data.url);
      setRoomUrl(data.url);
      setLoading(false);
    };

    fetchRoom();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Attendance helpers ──────────────────────────────────────────────────────
  const saveJoin = useCallback(() => {
    joinTimeRef.current = new Date();
    hasJoinedRef.current = true;
    supabase
      .from('meeting_participants')
      .update({ joined_at: joinTimeRef.current.toISOString(), attendance_status: 'joined' })
      .eq('meeting_id', meetingIdRef.current)
      .eq('profile_id', userIdRef.current)
      .then(() => console.log('[Daily Meeting] Join attendance recorded'));
  }, []);

  const saveLeave = useCallback(() => {
    const leaveTime = new Date();
    const durationMinutes = joinTimeRef.current
      ? Math.round((leaveTime.getTime() - joinTimeRef.current.getTime()) / 60000)
      : 0;
    supabase
      .from('meeting_participants')
      .update({
        left_at:           leaveTime.toISOString(),
        duration_minutes:  durationMinutes,
        attendance_status: 'attended',
      })
      .eq('meeting_id', meetingIdRef.current)
      .eq('profile_id', userIdRef.current)
      .then(() => console.log('[Daily Meeting] Leave attendance recorded, duration:', durationMinutes, 'min'));
  }, []);

  // ─── Navigate to role dashboard ─────────────────────────────────────────────
  const navigateToDashboard = useCallback(() => {
    const role = userRoleRef.current;
    if (role === 'director')   navigateRef.current('/director/dashboard');
    else if (role === 'management') navigateRef.current('/management/dashboard');
    else navigateRef.current('/employee/dashboard');
  }, []);

  // ─── Leave handler (runs exactly once) ──────────────────────────────────────
  const handleLeave = useCallback((source: string) => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    console.log('[Daily Meeting] Leave from:', source);
    if (hasJoinedRef.current) saveLeave();
    onCloseRef.current();
    navigateToDashboard();
  }, [saveLeave, navigateToDashboard]);

  // ─── Record join when iframe finishes loading ────────────────────────────────
  const handleIframeLoad = useCallback(() => {
    console.log('[Daily Meeting] Iframe loaded');
    setIframeReady(true);
    // Record join attendance when the iframe is ready (user enters the call)
    if (!hasJoinedRef.current) saveJoin();
  }, [saveJoin]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 md:p-4">
      <div
        className={`relative flex flex-col bg-[#0B0F17] overflow-hidden shadow-2xl transition-all duration-300 ${
          fullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-full md:max-w-5xl lg:max-w-6xl h-full md:h-[90vh] md:rounded-xl'
        }`}
      >
        {/* ── Header bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#080C12] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Video className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{meetingTitle}</p>
              <p className="text-[10px] text-white/40">
                {isModerator ? 'Host' : 'Participant'}
                {iframeReady && (
                  <span className="ml-1 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Live
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Leave button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-[11px] gap-1"
              onClick={() => handleLeave('leave-button')}
              title="Leave meeting"
            >
              <LogOut className="w-3 h-3" />
              <span className="sr-only md:not-sr-only">Leave</span>
            </Button>

            {/* Fullscreen toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-white/50 hover:text-white hover:bg-white/10"
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </Button>

            {/* Close (X) */}
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-white/50 hover:text-destructive hover:bg-white/10"
              onClick={() => handleLeave('close-button')}
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Content area ───────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 relative">

          {/* Loading state */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B0F17] z-10">
              <div className="relative">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
              <p className="text-sm text-white/70">Setting up meeting room…</p>
              <p className="text-xs text-white/30">Powered by Daily.co</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B0F17] p-6 text-center z-10">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7 text-destructive/70" />
              </div>
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-white/90 text-balance">Meeting failed to load</p>
                <p className="text-xs text-white/55 mt-2 text-pretty leading-relaxed">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleLeave('error-close')}
                className="border-white/20 text-white/70 hover:bg-white/10"
              >
                Close
              </Button>
            </div>
          )}

          {/* Daily.co iframe */}
          {roomUrl && !loading && !error && (
            <iframe
              src={`${roomUrl}?userName=${encodeURIComponent(displayName)}&skipMediaPermissionPrompt=true`}
              allow="camera; microphone; fullscreen; display-capture; autoplay; picture-in-picture"
              className="w-full h-full border-0"
              title={meetingTitle}
              onLoad={handleIframeLoad}
            />
          )}
        </div>
      </div>
    </div>
  );
}
