'use client';

import { Bell, X } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

export default function Toast() {
  const toast = useLagosLiveStore((s) => s.toast);
  const dismissToast = useLagosLiveStore((s) => s.dismissToast);

  if (!toast) return null;

  return (
    <div
      className="fixed left-1/2 top-[14px] z-[3000] w-[calc(100%-32px)] max-w-[380px] animate-toast-in"
      style={{ transform: 'translateX(-50%)' }}
    >
      <div
        className="flex items-start gap-3 rounded-2xl p-3.5 backdrop-blur-2xl"
        style={{
          background: 'rgba(20,20,23,0.97)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'linear-gradient(135deg,#FF5A2E,#FF7F5C)' }}
        >
          <Bell size={16} color="white" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 font-heading text-[13px] font-bold text-[#FFFFFF]">{toast.title}</div>
          <div className="text-xs leading-snug text-[#A7A8B5]">{toast.subtitle}</div>
        </div>
        <button onClick={dismissToast} className="flex-shrink-0 cursor-pointer p-0.5" style={{ color: '#6B6C80' }}>
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
