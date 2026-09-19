'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';

interface DeleteEventDialogProps {
  open: boolean;
  eventName?: string;
  onClose: () => void;
  onDelete: () => Promise<void>;
}

export default function DeleteEventDialog({ open, eventName, onClose, onDelete }: DeleteEventDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setIsDeleting(false);
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 30);
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-event-title"
      aria-describedby="delete-event-desc"
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      style={{ background: 'rgba(5,5,10,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        className="relative w-full max-w-[380px] animate-[modalUp_0.35s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden rounded-3xl p-6"
        style={{ background: '#12121C', border: '1px solid rgba(255,138,0,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isDeleting}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5' }}
        >
          <X size={15} strokeWidth={2} />
        </button>

        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,138,0,0.12)', border: '1px solid rgba(255,138,0,0.25)' }}
        >
          <AlertTriangle size={20} strokeWidth={2} color="#FF8A00" />
        </div>
        <h2 id="delete-event-title" className="mt-4 font-display text-[22px] leading-tight tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
          Delete Event
        </h2>
        <p id="delete-event-desc" className="mt-2 text-[13px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
          Are you sure you want to delete this event{eventName ? ` — ${eventName}` : ''}? This action cannot be undone.
        </p>

        <div className="mt-5 flex gap-2.5">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 rounded-[11px] py-3 text-[13px] font-bold transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#D5D6E0' }}
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="flex flex-1 items-center justify-center gap-2 rounded-[11px] py-3 text-[13px] font-bold uppercase tracking-[0.5px] transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#FF8A00,#FF2D95)', color: '#FFFFFF', boxShadow: '0 10px 28px rgba(255,45,149,0.3)' }}
          >
            {isDeleting ? <Loader2 size={15} strokeWidth={2.5} className="animate-spin" /> : null}
            {isDeleting ? 'Deleting…' : 'Delete Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
