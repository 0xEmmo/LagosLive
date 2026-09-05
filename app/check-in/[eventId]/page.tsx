'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, notFound } from 'next/navigation';
import {
  Loader2,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ScanLine,
  CameraOff,
  Keyboard,
  Clock,
  Ticket as TicketIcon,
  Users,
  ChevronDown,
  ChevronUp,
  Upload as UploadIcon,
} from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParty } from '@/lib/hooks/useParty';
import { useLagosLiveStore } from '@/lib/store';
import { fetchCheckInStats, fetchCheckInActivity, type CheckInStats, type CheckInActivityItem } from '@/lib/queries';
import { performCheckIn, normalizeOrderRef, type CheckInResult } from '@/lib/check-in/sync';
import { ci, buzz, chime, guestNameFromEmail, formatClock } from '@/lib/check-in/ui';
import jsQR from 'jsqr';

const STAFF_ROLES = ['finance', 'admin', 'super_admin'];
const GATE_STORAGE = 'll_checkin_gate';
const GATES = ['Main', 'VIP', 'Staff'] as const;
const RESUME_OK_MS = 2600;
const RESUME_ERROR_MS = 1400;
const DEDUPE_WINDOW_MS = 3500;

type CameraErrorKind = 'permission-denied' | 'no-camera' | 'in-use' | 'unsupported' | 'security' | 'unknown';

const CAMERA_ERROR_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  'permission-denied': {
    title: 'Camera access blocked',
    body: 'Camera access is blocked. Allow camera access in your browser settings, then try again.',
  },
  'no-camera': {
    title: 'No camera detected',
    body: 'No camera was detected on this device. Enter the ticket code instead.',
  },
  'in-use': {
    title: 'Camera is in use',
    body: 'Your camera is currently being used by another application. Close it and try again.',
  },
  unsupported: {
    title: 'Camera not supported',
    body: "Camera scanning isn't supported on this browser. Enter the ticket code instead.",
  },
  security: {
    title: 'Secure connection needed',
    body: 'Camera scanning requires a secure connection (HTTPS).',
  },
  unknown: {
    title: 'Camera could not be started',
    body: 'Your camera could not be started. Please allow camera access in your browser settings, then try again.',
  },
};

// Map a raw browser / html5-qrcode failure to a staff-facing reason. Never
// expose the raw message — only log it for debugging.
function mapCameraError(err: unknown): CameraErrorKind {
  const name = err && typeof err === 'object' ? String((err as { name?: unknown })?.name ?? '') : '';
  const raw = err && typeof err === 'object' ? String((err as { message?: unknown })?.message ?? err) : String(err ?? '');
  const hay = `${name} ${raw}`;
  if (/NotAllowed|Permission denied|permission denied/i.test(hay)) return 'permission-denied';
  if (/NotFound|DevicesNotFound|No camera|no camera|could not access/i.test(hay)) return 'no-camera';
  if (/NotReadable|TrackStartError|in use|already in use|source busy|cannot access the video/i.test(hay)) return 'in-use';
  if (/Overconstrained|ConstraintNotSatisfied/i.test(hay)) return 'no-camera';
  if (/not supported|unsupported|mediaDevices not supported|streaming not supported/i.test(hay)) return 'unsupported';
  if (/insecure|secure context|SecurityError/i.test(hay)) return 'security';
  return 'unknown';
}

type ScannerState = 'starting' | 'scanning' | 'denied';

interface Feedback {
  result: CheckInResult;
  raw?: string;
}

function canOperateEvent(userRole: string | undefined, ownerId: string | null | undefined, userId: string | null | undefined): boolean {
  return ownerId === userId || (!!userRole && STAFF_ROLES.includes(userRole));
}

function FeedbackView({ feedback, eventTitle, onNext }: { feedback: Feedback; eventTitle: string; onNext: () => void }) {
  const code = feedback.result.code;
  const kind: 'ok' | 'warn' | 'danger' =
    code === 'ok' ? 'ok' : code === 'network' ? 'warn' : code === 'invalid' ? 'danger' : code === 'refunded' ? 'danger' : code === 'cancelled_event' ? 'danger' : 'warn';

  const palette =
    kind === 'ok'
      ? { bg: ci.okSoft, ring: 'rgba(52,199,123,0.4)', color: ci.ok, line: 'rgba(52,199,123,0.25)' }
      : kind === 'warn'
      ? { bg: ci.warnSoft, ring: 'rgba(255,179,71,0.45)', color: ci.gold, line: 'rgba(255,179,71,0.25)' }
      : { bg: ci.dangerSoft, ring: 'rgba(255,90,54,0.4)', color: ci.danger, line: 'rgba(255,90,54,0.25)' };

  const Icon = code === 'ok' ? CheckCircle2 : code === 'already_checked_in' ? AlertTriangle : XCircle;

  const headline =
    code === 'ok'
      ? 'Valid ticket'
      : code === 'already_checked_in'
      ? 'Already checked in'
      : code === 'network'
      ? 'Connection problem'
      : code === 'invalid'
      ? 'Invalid ticket'
      : code === 'wrong_event'
      ? 'Wrong event'
      : code === 'refunded'
      ? 'Refunded ticket'
      : code === 'not_confirmed'
      ? 'Payment not confirmed'
      : code === 'cancelled_event'
      ? 'Event cancelled'
      : code === 'event_not_live'
      ? 'Event not live'
      : code === 'unauthorized'
      ? 'Not authorized'
      : 'Ticket problem';

  return (
    <div className="flex flex-col items-center rounded-3xl px-5 pb-6 pt-7 text-center animate-[scanPop_0.28s_cubic-bezier(0.16,1,0.3,1)]" style={{ background: palette.bg, border: `1px solid ${palette.line}`, boxShadow: `0 0 0 1px ${palette.ring} inset` }}>
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full" style={{ background: palette.ring, boxShadow: `0 0 40px ${palette.ring}` }}>
        <Icon size={38} strokeWidth={2.2} color={palette.color} />
      </div>
      <div className="font-display mt-4 text-[30px] leading-none uppercase tracking-[1px]" style={{ color: code === 'ok' ? ci.ok : palette.color }}>
        {headline}
      </div>

      {code === 'ok' ? (
        <div className="mt-4 w-full">
          <div className="font-heading text-[20px] font-bold" style={{ color: ci.text }}>{eventTitle}</div>
          <div className="mx-auto mt-3 flex w-full max-w-[330px] flex-col gap-2 text-left">
            {feedback.result.guestEmail && (
              <InfoRow label="Guest" value={guestNameFromEmail(feedback.result.guestEmail)} />
            )}
            <InfoRow label="Ticket" value={`${feedback.result.ticketType}${feedback.result.quantity > 1 ? ` × ${feedback.result.quantity}` : ''}`} />
            <InfoRow label="Ticket ID" value={`#${feedback.result.orderRef}`} />
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: palette.ring }}>
            <CheckCircle2 size={13} strokeWidth={2.5} color="#FFFFFF" />
            <span className="text-[11px] font-bold uppercase tracking-[0.8px]" style={{ color: '#FFFFFF' }}>
              Checked in
            </span>
          </div>
        </div>
      ) : code === 'already_checked_in' ? (
        <div className="mt-4 w-full">
          <div className="font-heading text-[17px] font-bold" style={{ color: ci.text }}>{eventTitle}</div>
          <div className="mx-auto mt-3 flex w-full max-w-[330px] flex-col gap-2 text-left">
            {feedback.raw && <InfoRow label="Ticket ID" value={`#${feedback.raw}`} />}
            <InfoRow label="Checked in" value={formatClock(feedback.result.checkedInAt)} />
            {feedback.result.gate && <InfoRow label="Gate" value={feedback.result.gate} />}
          </div>
          <div className="mt-4 text-[12px]" style={{ color: ci.muted }}>
            Not admitted again — duplicate entry blocked.
          </div>
        </div>
      ) : (
        <div className="mt-3 max-w-[300px] text-[13px] leading-relaxed" style={{ color: ci.muted }}>
          {code === 'invalid' && 'This code could not be verified as a Lagos Live ticket.'}
          {code === 'network' && (feedback.result.message ?? 'Could not reach the server. Check your connection and try this ticket again.')}
          {code === 'wrong_event' && 'This ticket belongs to a different event. Do not admit.'}
          {code === 'refunded' && 'This ticket was refunded or cancelled. Do not admit.'}
          {code === 'not_confirmed' && `Payment isn't confirmed${feedback.result.payment ? ` (${feedback.result.payment})` : ''}. Do not admit.`}
          {code === 'cancelled_event' && 'This event was cancelled. Do not admit.'}
          {code === 'event_not_live' && 'This event is not approved/live for check-in.'}
          {code === 'unauthorized' && 'Your account is not authorized to check in at this event.'}
          {!['invalid', 'network', 'wrong_event', 'refunded', 'not_confirmed', 'cancelled_event', 'event_not_live', 'unauthorized'].includes(code) &&
            'This ticket could not be verified.'}
        </div>
      )}

      <button
        onClick={onNext}
        className="mt-5 w-full max-w-[330px] rounded-[14px] py-4 text-[14px] font-bold uppercase tracking-[1px] active:scale-[0.98]"
        style={{ background: palette.color, color: '#0B0B0D', boxShadow: `0 10px 26px ${palette.ring}` }}
      >
        Scan next
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2" style={{ background: 'rgba(11,11,13,0.35)', border: `1px solid ${ci.line}` }}>
      <span className="text-[11px] uppercase tracking-[0.6px]" style={{ color: ci.dim }}>{label}</span>
      <span className="truncate text-[13px] font-semibold" style={{ color: ci.text }}>{value}</span>
    </div>
  );
}

export default function CheckInScannerPage({ params }: { params: { eventId: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const { party, loading } = useParty(Number(params.eventId));

  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [activity, setActivity] = useState<CheckInActivityItem[]>([]);
  const [feed, setFeed] = useState<Feedback | null>(null);
  const [scanner, setScanner] = useState<ScannerState>('starting');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [activityOpen, setActivityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  const [uploading, setUploading] = useState(false);

  const [gate, setGate] = useState<string>('Main');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GATE_STORAGE);
      if (saved) setGate(saved);
    } catch {}
  }, []);
  const gateRef = useRef(gate);
  gateRef.current = gate;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const busyRef = useRef(false);
  const lastScan = useRef<{ ref: string; at: number }>({ ref: '', at: 0 });
  const feedbackShownAt = useRef<number | null>(null);
  const scanStateRef = useRef<ScannerState>('starting');
  scanStateRef.current = scanner;

  // Access: owner of the event, or finance/admin/super_admin.
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=' + encodeURIComponent(`/check-in/${params.eventId}`));
  }, [authLoading, user, router, params.eventId]);

  const authorized = !!user && !!party && canOperateEvent(user.role, party.createdBy, user.id);

  const loadStats = useCallback((partyId: number) => {
    fetchCheckInStats(partyId)
      .then(setStats)
      .catch((err) => console.error('[check-in] stats load error', err));
  }, []);

  const loadActivity = useCallback((partyId: number) => {
    fetchCheckInActivity(partyId)
      .then(setActivity)
      .catch((err) => console.error('[check-in] activity load error', err));
  }, []);

  useEffect(() => {
    if (authorized && party) {
      loadStats(party.id);
      loadActivity(party.id);
    }
  }, [authorized, party, loadStats, loadActivity]);

  // Refresh door numbers whenever the tab regains focus.
  useEffect(() => {
    if (!party) return;
    const onFocus = () => loadStats(party.id);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [party, loadStats]);

  // Camera lifecycle. We drive getUserMedia + our own <video> element + an
  // off-screen canvas + jsQR directly instead of html5-qrcode. That library's
  // video overlay has no reliable fix for a blank/black feed across iOS Safari
  // (auto-fullscreen + a virtual "Back Triple/Dual" lens streaming nothing) and
  // Samsung Chrome (BarcodeDetector chain failure), and it decodes from the
  // displayed box size rather than the native frame — so any viewfinder CSS
  // override can silently break detection. Our loop always decodes the full
  // native frame, independent of how the preview is styled.
  useEffect(() => {
    if (!authorized || !party) return;
    let disposed = false;

    const stopStream = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.removeAttribute('src');
      }
    };

    const attach = async (constraints: MediaTrackConstraints): Promise<MediaStream> => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('disposed', 'AbortError');
      }
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('no video element', 'AbortError');
      }
      streamRef.current = stream;
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('autoplay', '');
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      try {
        await video.play();
      } catch (err) {
        console.warn('[check-in] video play() rejected', err);
      }
      return stream;
    };

    const MAX_DECODE_MS = 110;
    const decodeFrame = (): string | null => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
      const MAX_WIDTH = 640;
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      const w = Math.max(64, Math.round(video.videoWidth * scale));
      const h = Math.max(64, Math.round(video.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
      return code?.data ?? null;
    };

    const boot = async () => {
      setScanner('starting');
      setCameraError(null);

      // Pre-flight guards — never show a blank box.
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setCameraError('security');
        setScanner('denied');
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('unsupported');
        setScanner('denied');
        return;
      }

      // Prefer the rear camera (a phone resolves facingMode 'environment' to a
      // real rear lens — no device-id guessing). Fall back to any camera only
      // for non-fatal failures; permission/security issues are final.
      let lastErr: unknown = null;
      const attempts: MediaTrackConstraints[] = [{ facingMode: { ideal: 'environment' } }, {}];
      for (const constraints of attempts) {
        try {
          await attach(constraints);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const kind = mapCameraError(err);
          if (kind === 'permission-denied' || kind === 'security' || kind === 'unsupported') break;
          if (disposed) return;
        }
      }
      if (disposed) return;
      if (lastErr) {
        setCameraError(mapCameraError(lastErr));
        setScanner('denied');
        return;
      }
      setScanner('scanning');

      // Continuous decode loop. The <video> stays mounted for the whole session
      // (only hidden while a result panel is up, via busyRef), so resuming after
      // a scan needs no stream restart — the loop just decodes again.
      let lastDecodeAt = 0;
      const loop = (now: number) => {
        if (disposed) return;
        rafRef.current = requestAnimationFrame(loop);
        if (scanStateRef.current !== 'scanning' || busyRef.current) {
          lastDecodeAt = now;
          return;
        }
        if (now - lastDecodeAt < MAX_DECODE_MS) return;
        lastDecodeAt = now;
        const text = decodeFrame();
        if (!text) return;
        const orderRef = normalizeOrderRef(text);
        if (!orderRef) return;
        const at = Date.now();
        if (at - lastScan.current.at < DEDUPE_WINDOW_MS && lastScan.current.ref === orderRef) return;
        lastScan.current = { ref: orderRef, at };
        if (at - (feedbackShownAt.current ?? 0) < 900) return;
        void handleScanResult(orderRef);
      };
      rafRef.current = requestAnimationFrame(loop);
    };

    void boot();
    return () => {
      disposed = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, party?.id, cameraAttempt]);

  const scheduleResume = (ms: number) => {
    window.setTimeout(() => {
      setFeed(null);
      setBusy(false);
      busyRef.current = false;
      // The decode loop runs the whole session and is only gated by busyRef —
      // clearing it is all it takes to resume scanning.
    }, ms);
  };

  const handleScanResult = async (raw: string) => {
    if (busyRef.current || !party) return;
    busyRef.current = true;
    setBusy(true);
    feedbackShownAt.current = Date.now();
    try {
      const result = await performCheckIn({ partyId: party.id, orderRef: raw, gate: gateRef.current || null });
      const fb: Feedback = { result, raw: normalizeOrderRef(raw) };
      setFeed(fb);
      if (result.code === 'ok') {
        buzz('ok');
        chime('ok');
        setStats((s) => (s ? { ...s, checkedIn: s.checkedIn + result.quantity } : s));
        const item: CheckInActivityItem = {
          id: `tmp-${Date.now()}`,
          orderRef: result.orderRef,
          quantity: result.quantity,
          guestEmail: result.guestEmail,
          checkedInAt: result.checkedInAt,
          gate: result.gate,
          ticketType: result.ticketType,
        };
        setActivity((a) => [item, ...a].slice(0, 30));
      } else {
        buzz('reject');
        chime('reject');
      }
      scheduleResume(result.code === 'ok' ? RESUME_OK_MS : RESUME_ERROR_MS);
    } catch (err) {
      console.error('[check-in] scan RPC error', err);
      setFeed({
        result: {
          code: 'network',
          message: err instanceof Error ? err.message : 'Connection issue.',
        },
      });
      // Network hiccup — keep the scanner paused a moment, never double-fire.
      scheduleResume(1600);
    }
  };

  const manualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = normalizeOrderRef(manualInput);
    if (!ref) return;
    setManualInput('');
    setManualOpen(false);
    void handleScanResult(ref);
  };

  // Fallback when no camera is usable: read the ticket QR from an uploaded
  // photo/screenshot, decode it with the same jsQR pipeline, and run it
  // through the exact same server check-in path.
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = async () => {
        setUploading(true);
        try {
          const canvas = document.createElement('canvas');
          const MAX = 1024;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          canvas.width = Math.max(64, Math.round(img.width * scale));
          canvas.height = Math.max(64, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('canvas unsupported');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
          if (code?.data) {
            void handleScanResult(code.data);
          } else {
            setFeed({ result: { code: 'invalid' } });
          }
        } catch (err) {
          console.error('[check-in] upload decode error', err);
          setFeed({ result: { code: 'invalid' } });
        } finally {
          setUploading(false);
        }
      };
      img.onerror = () => {
        setUploading(false);
        setFeed({ result: { code: 'invalid' } });
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => {
      setFeed({ result: { code: 'invalid' } });
    };
    reader.readAsDataURL(file);
  };

  if (!user) {
    if (authLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color={ci.accent} className="animate-spin" />
        </div>
      );
    }
    return null;
  }

  if (!party) {
    if (loading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 size={26} strokeWidth={2} color={ci.accent} className="animate-spin" />
        </div>
      );
    }
    notFound();
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
          <Lock size={26} strokeWidth={1.5} color={ci.danger} />
        </div>
        <h1 className="font-display text-[26px] tracking-[1px]" style={{ color: ci.text }}>
          Not authorized
        </h1>
        <p className="max-w-[280px] text-sm" style={{ color: ci.muted }}>
          Only this event&apos;s host (or finance/admin staff) can run check-in here.
        </p>
        <BackButton href="/check-in" label="" />
      </div>
    );
  }

  const remaining = stats ? Math.max(0, stats.sold - stats.checkedIn) : 0;

  return (
    <div className="mx-auto min-h-screen max-w-[520px] animate-fade-in" style={{ background: ci.surface }}>
      <header className="sticky top-0 z-40 border-b px-5 py-3.5" style={{ background: 'rgba(19,19,22,0.92)', borderColor: ci.line, backdropFilter: 'blur(22px)' }}>
        <div className="flex items-center gap-3">
          <BackButton href="/check-in" label="" />
          <div className="min-w-0 flex-1">
            <span className="font-heading block text-[13px] font-bold uppercase tracking-[1px]" style={{ color: ci.text }}>
              Check-in
            </span>
            <span className="block truncate text-[11px]" style={{ color: ci.dim }}>
              {party.title}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
            <Clock size={12} strokeWidth={2} color={ci.accent} />
            <span className="text-[11px] font-semibold" style={{ color: ci.text }}>
              {formatClock(new Date().toISOString())}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-5 pb-24">
        {/* Gate selector */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] uppercase tracking-[0.6px]" style={{ color: ci.dim }}>
            Gate
          </span>
          {GATES.map((g) => (
            <button
              key={g}
              onClick={() => {
                setGate(g);
                try {
                  localStorage.setItem(GATE_STORAGE, g);
                } catch {}
              }}
              className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all active:scale-95"
              style={
                gate === g
                  ? { background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }
                  : { background: ci.raised, border: `1px solid ${ci.line}`, color: ci.muted }
              }
            >
              {g}
            </button>
          ))}
        </div>

        {/* Scanner / feedback viewport */}
        <div className="relative overflow-hidden rounded-3xl" style={{ background: '#0A0A0C', border: `1px solid ${ci.lineStrong}` }}>
          <div className="px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <ScanLine size={14} strokeWidth={2.2} color={ci.accent} />
              <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: ci.muted }}>
                Scan guest ticket
              </span>
            </div>
          </div>

          <div className={`ci-viewfinder mx-4 mb-4 ${feed ? 'hidden' : ''}`}>
            {/* The <video> + decode canvas stay mounted for the whole session so
                the camera stream is never restarted. While a result panel is up
                the box is simply hidden and the decode loop is gated by
                busyRef — that is all "pausing" takes now. */}
            <video ref={videoRef} className="ci-qr-video" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="hidden" />

            {scanner === 'starting' && (
              <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3" style={{ background: '#0A0A0C' }}>
                <Loader2 size={26} strokeWidth={2} color={ci.accent} className="animate-spin" />
                <span className="text-[12px]" style={{ color: ci.dim }}>
                  Starting camera…
                </span>
              </div>
            )}

            {scanner === 'denied' && (
              <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ background: '#0A0A0C' }}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: ci.warnSoft }}>
                  <CameraOff size={24} strokeWidth={1.5} color={ci.gold} />
                </div>
                <div className="font-heading text-[16px] font-bold" style={{ color: ci.text }}>
                  {CAMERA_ERROR_COPY[cameraError ?? 'unknown'].title}
                </div>
                <p className="max-w-[300px] text-[13px] leading-relaxed" style={{ color: ci.muted }}>
                  {CAMERA_ERROR_COPY[cameraError ?? 'unknown'].body}
                </p>
                <button
                  onClick={() => {
                    setScanner('starting');
                    setCameraAttempt((a) => a + 1);
                  }}
                  className="mt-1 flex items-center gap-2 rounded-[12px] px-5 py-3 text-[13px] font-bold"
                  style={{ background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }}
                >
                  <RefreshCw size={14} strokeWidth={2.5} />
                  Try again
                </button>
                <button onClick={() => setManualOpen((o) => !o)} className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: ci.accent }}>
                  <Keyboard size={13} strokeWidth={2} />
                  {manualOpen ? 'Hide' : 'Enter ticket code instead'}
                </button>
              </div>
            )}

            {scanner === 'scanning' && (
              <>
                <div className="pointer-events-none absolute inset-0 z-[1] rounded-2xl border-[3px] ci-corners" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] pb-4 text-center">
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: 'rgba(10,10,12,0.8)', color: ci.muted, backdropFilter: 'blur(6px)' }}>
                    Point at the ticket QR code
                  </span>
                </div>
              </>
            )}
          </div>

          {feed && (
            <div className="p-4">
              <FeedbackView feedback={feed} eventTitle={party.title} onNext={() => scheduleResume(0)} />
            </div>
          )}

          {!feed && (
            <>
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
                className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-[12px] py-3 text-[13px] font-semibold"
                style={{ background: ci.raised, border: `1px solid ${ci.line}`, color: ci.muted, opacity: uploading ? 0.6 : 1 }}
              >
                {uploading ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <UploadIcon size={14} strokeWidth={2} />}
                {uploading ? 'Reading image…' : 'Upload QR code image'}
              </button>
              <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </>
          )}
        </div>

        {/* Manual entry */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setManualOpen((o) => !o)}
            className="flex items-center justify-center gap-2 rounded-[12px] py-3 text-[13px] font-semibold"
            style={{ background: ci.raised, border: `1px solid ${ci.line}`, color: ci.muted }}
          >
            <Keyboard size={14} strokeWidth={2} />
            {manualOpen ? 'Hide manual entry' : 'Enter ticket code'}
          </button>
          {manualOpen && (
            <form
              onSubmit={manualSubmit}
              className="flex gap-2"
              style={{ animation: 'fade-in 0.2s ease-out' }}
            >
              <input
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="e.g. LL-82931"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-[11px] px-4 py-3 text-[14px] font-semibold uppercase outline-none"
                style={{ background: ci.raised, border: `1px solid ${ci.lineStrong}`, color: ci.text }}
              />
              <button
                type="submit"
                disabled={!normalizeOrderRef(manualInput) || busy}
                className="rounded-[11px] px-5 text-[13px] font-bold"
                style={{ background: ci.gradient, color: '#FFFFFF', boxShadow: ci.buttonShadow }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : 'Check'}
              </button>
            </form>
          )}
        </div>

        {/* Door numbers */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatBox label="Sold" value={stats ? String(stats.sold) : '—'} icon={TicketIcon} color={ci.accent} />
          <StatBox label="Checked in" value={stats ? String(stats.checkedIn) : '—'} icon={CheckCircle2} color={ci.ok} />
          <StatBox label="Remaining" value={stats ? String(remaining) : '—'} icon={Users} color={ci.gold} />
        </div>

        {/* Recent activity */}
        <div className="overflow-hidden rounded-2xl" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
          <button
            onClick={() => setActivityOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3.5"
          >
            <span className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: ci.muted }}>
              Check-in activity
            </span>
            <span className="flex items-center gap-2 text-[11px]" style={{ color: ci.dim }}>
              {activity.length > 0 && <span style={{ color: ci.ok }}>{activity.length} recent</span>}
              {activityOpen ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
            </span>
          </button>
          {activityOpen && (
            <div className="flex flex-col border-t" style={{ borderColor: ci.line }}>
              {activity.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px]" style={{ color: ci.dim }}>
                  No check-ins yet. Scan the first guest to see activity here.
                </div>
              ) : (
                activity.slice(0, 12).map((a, i) => (
                  <div key={a.id === a.orderRef ? `${a.orderRef}-${i}` : a.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0" style={{ borderColor: ci.line }}>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ background: ci.okSoft }}>
                      <CheckCircle2 size={14} strokeWidth={2.2} color={ci.ok} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold" style={{ color: ci.text }}>
                        {a.guestEmail ? guestNameFromEmail(a.guestEmail) : 'Guest'} · {a.ticketType ?? 'General Entry'}
                        {a.quantity > 1 ? ` ×${a.quantity}` : ''}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: ci.dim }}>
                        #{a.orderRef}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5 text-[11px]" style={{ color: ci.dim }}>
                      {a.gate && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: ci.warnSoft, color: ci.gold }}>
                          {a.gate}
                        </span>
                      )}
                      {formatClock(a.checkedInAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof TicketIcon; color: string }) {
  return (
    <div className="rounded-2xl p-3.5 text-center" style={{ background: ci.raised, border: `1px solid ${ci.line}` }}>
      <div className="mb-1.5 flex items-center justify-center gap-1.5">
        <Icon size={12} strokeWidth={2.2} color={color} />
        <span className="text-[9px] font-bold uppercase tracking-[0.7px]" style={{ color: ci.dim }}>
          {label}
        </span>
      </div>
      <div className="font-display text-[22px] leading-none" style={{ color: ci.text }}>
        {value}
      </div>
    </div>
  );
}