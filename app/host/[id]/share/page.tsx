'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, notFound, useParams } from 'next/navigation';
import QRCode from 'react-qr-code';
import { Copy, Download, Check, Share2 } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParty } from '@/lib/hooks/useParty';
import { partyShareUrl } from '@/lib/queries';
import { useLagosLiveStore } from '@/lib/store';

export default function EventSharePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const { party, loading } = useParty(id);
  const [copied, setCopied] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=' + encodeURIComponent(`/host/${id}/share`));
  }, [authLoading, user, router, id]);

  useEffect(() => {
    if (!user || !party) return;
    if (party.createdBy !== user.id) {
      router.replace('/host');
    }
  }, [user, party, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[600px] animate-fade-in p-5">
        <div className="mb-4"><BackButton href="/host" /></div>
        <div className="h-[52px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="mt-4 h-[380px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    );
  }

  if (!party) notFound();

  const url = partyShareUrl(party.id);
  const shareText = `${party.title} on Lagos Live! ${party.date} @ ${party.location}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const svg = qrWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${party.title}-qrcode.png`;
        a.click();
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/host/${party.id}`} />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Share Event
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[16px] font-bold" style={{ color: '#FFFFFF' }}>{party.title}</div>
            <div className="text-[11.5px]" style={{ color: '#A7A8B5' }}>{party.date} · {party.location}</div>
          </div>
          <Link
            href={`/party/${party.id}`}
            className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-3 py-2 text-[12px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
          >
            <Share2 size={13} strokeWidth={2} /> Open event
          </Link>
        </div>

        {/* QR */}
        <div className="rounded-2xl p-5 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-1 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Event QR Code</div>
          <div className="mb-4 text-[11px]" style={{ color: '#A7A8B5' }}>Scan to view event details</div>
          <div className="mx-auto flex w-fit flex-col items-center gap-3 rounded-2xl bg-white p-5">
            <div ref={qrWrapRef} className="flex h-[180px] w-[180px] items-center justify-center">
              <QRCode value={url} size={168} fgColor="#0B0B10" bgColor="#FFFFFF" level="H" />
            </div>
          </div>
          <button
            onClick={download}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] py-[13px] text-[13px] font-bold transition-all duration-200 active:scale-[0.98]"
            style={{ background: 'rgba(255,45,149,0.14)', border: '1px solid rgba(255,45,149,0.4)', color: '#FF2D95' }}
          >
            <Download size={14} strokeWidth={2.5} /> Download QR (PNG)
          </button>
        </div>

        {/* Link */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-1 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Shareable Link</div>
          <div className="mb-3 text-[11px]" style={{ color: '#A7A8B5' }}>Copy and share this link on social media</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-[10px] px-3.5 py-[12px] text-[12px] outline-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#D5D6E0' }}
            />
            <button
              onClick={copy}
              className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-4 py-[12px] text-[12px] font-bold"
              style={{ background: copied ? 'rgba(0,245,212,0.12)' : 'rgba(176,106,255,0.14)', border: '1px solid', borderColor: copied ? 'rgba(0,245,212,0.35)' : 'rgba(176,106,255,0.4)', color: copied ? '#00F5D4' : '#B06AFF' }}
            >
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2.5} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Social */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-3 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Share on Social</div>
          <div className="flex flex-col gap-2.5">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-[10px] py-[12px] text-[13px] font-semibold transition-all duration-200"
              style={{ background: 'rgba(0,191,255,0.08)', border: '1px solid rgba(0,191,255,0.2)', color: '#00BFFF' }}
            >
              Share on X
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-[10px] py-[12px] text-[13px] font-semibold transition-all duration-200"
              style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: '#00F5D4' }}
            >
              Share on WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-[10px] py-[12px] text-[13px] font-semibold transition-all duration-200"
              style={{ background: 'rgba(59,89,152,0.12)', border: '1px solid rgba(59,89,152,0.3)', color: '#7C9BE8' }}
            >
              Share on Facebook
            </a>
          </div>
        </div>

        {/* Note */}
        <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid rgba(176,106,255,0.2)' }}>
          <p className="text-[12.5px]" style={{ color: '#D5D6E0' }}>
            <span className="font-bold" style={{ color: '#B06AFF' }}>This QR code and link never expire.</span> Share them anytime — they point directly to your live event page.
          </p>
        </div>
      </div>
    </div>
  );
}
