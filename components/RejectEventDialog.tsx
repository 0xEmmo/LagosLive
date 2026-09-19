'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';

const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

interface RejectEventDialogProps {
  open: boolean;
  eventName?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function RejectEventDialog({ open, eventName, onClose, onConfirm }: RejectEventDialogProps) {
  const [reason, setReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setIsRejecting(false);
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON_LENGTH;
  const remaining = MAX_REASON_LENGTH - reason.length;
  const hint = trimmed.length === 0 ? `Minimum ${MIN_REASON_LENGTH} characters` : valid ? 'Looks good' : `Minimum ${MIN_REASON_LENGTH} characters`;

  const submit = async () => {
    if (!valid || isRejecting) return;
    setIsRejecting(true);
    try {
      await onConfirm(trimmed);
    } catch {
      // the caller surfaced the error; keep the dialog open
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-event-title"
      aria-describedby="reject-event-desc"
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      style={{ background: 'rgba(5,5,10,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={() => {
        if (!isRejecting) onClose();
      }}
    >
      <div
        className="relative w-full max-w-[420px] animate-[modalUp_0.35s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden rounded-3xl p-6"
        style={{ background: '#12121C', border: '1px solid rgba(255,138,0,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5' }}
        >
          <X size={15} strokeWidth={2} />
        </button>

        <h2 id="reject-event-title" className="font-display text-[22px] leading-none tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
          Reject Event
        </h2>
        <p id="reject-event-desc" className="mt-2 text-[13px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
          Add a reason for rejecting this event{eventName ? ` — ${eventName}` : ''}. The host will see it.
        </p>

        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={MAX_REASON_LENGTH}
          placeholder="Enter rejection reason..."
          autoComplete="off"
          className="mt-4 w-full resize-none rounded-[11px] px-4 py-3 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${valid ? 'rgba(255,255,255,0.1)' : 'rgba(255,138,0,0.35)'}`, color: '#FFFFFF' }}
        />
        <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: valid ? '#6B6C80' : '#FF8A00' }}>
          <span>{hint}</span>
          <span>{remaining} remaining</span>
        </div>

        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onClose}
            disabled={isRejecting}
            className="flex-1 rounded-[11px] py-3 text-[13px] font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#D5D6E0' }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || isRejecting}
            className="flex flex-1 items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-bold uppercase tracking-[0.5px] transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#FF8A00,#FF2D95)', color: '#FFFFFF', boxShadow: '0 10px 28px rgba(255,45,149,0.3)' }}
          >
            {isRejecting && <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />}
            {isRejecting ? 'Rejecting…' : 'Reject Event'}
          </button>
        </div>
      </div>
    </div>
  );
}