// Phase 2 check-in palette — the Phase 1 "operations" identity.
// Deep charcoal, warm off-white text, gold/orange accent. Deliberately NOT the
// old cyan/purple nightlife chrome: this is a door tool that must read in
// bright sun and be unambiguous under stress.
export const ci = {
  surface: '#131316',
  raised: '#1B1B20',
  line: 'rgba(245,240,232,0.08)',
  lineStrong: 'rgba(245,240,232,0.16)',
  text: '#F5F0E8',
  muted: '#B7AD9F',
  dim: '#7C7467',
  accent: '#FF7A1A',
  accentSoft: '#FF9B3E',
  gold: '#FFB347',
  ok: '#34C77B',
  okSoft: 'rgba(52,199,123,0.14)',
  warnSoft: 'rgba(255,179,71,0.14)',
  danger: '#FF5A36',
  dangerSoft: 'rgba(255,90,54,0.14)',
  info: '#5BB8FF',
  gradient: 'linear-gradient(135deg, #FF9B3E 0%, #FF6A00 100%)',
  buttonShadow: '0 12px 32px rgba(255,106,0,0.28)',
} as const;

// Short vibration on a valid scan, distinct long pattern on a reject.
export function buzz(kind: 'ok' | 'reject') {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(kind === 'ok' ? 60 : [120, 60, 120]);
  } catch {}
}

// Tiny WebAudio tones (no asset files): a confident two-note chirp on success,
// a flat low blip on rejection. Fails silently wherever AudioContext is absent.
export function chime(kind: 'ok' | 'reject') {
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined' ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    if (kind === 'ok') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.setValueAtTime(1100, t + 0.09);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.24);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.42);
    }
    osc.onended = () => ctx.close().catch(() => {});
  } catch {}
}

export function guestNameFromEmail(email: string | null | undefined): string {
  if (!email || !String(email).includes('@')) return 'Guest';
  const base = String(email).split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!base) return 'Guest';
  return base
    .split(' ')
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ')
    .slice(0, 20);
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
}