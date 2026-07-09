'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { LogoMark } from '@/components/Logo';
import { useLagosLiveStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const login = useLagosLiveStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    login(email);
    setError('');
    router.push('/profile');
  };

  return (
    <div className="flex min-h-screen flex-col animate-fade-in">
      <div className="px-5 py-4">
        <BackButton href="/" />
      </div>
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-7 pb-[60px]">
        <div className="mb-8 text-center">
          <LogoMark size={56} />
          <h1 className="font-display mb-1.5 mt-[18px] text-[38px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            Welcome Back
          </h1>
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            Log in to save parties &amp; get tickets faster
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-[10px] border px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(184,92,92,0.1)', borderColor: 'rgba(184,92,92,0.32)', color: '#D19A9A' }}>
            {error}
          </div>
        )}

        <div className="mb-[22px] flex flex-col gap-3.5">
          <div>
            <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-[10px] border px-3.5 py-[13px] text-sm outline-none font-heading"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
            />
          </div>
          <div>
            <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>
              Password
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-[10px] border px-3.5 py-[13px] text-sm outline-none font-heading"
              style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
            />
          </div>
        </div>

        <button
          onClick={submit}
          className="w-full rounded-xl border-none py-[15px] font-heading text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#6D5A99,#A85670)', boxShadow: '0 8px 24px rgba(109,90,153,0.28)' }}
        >
          Log In
        </button>

        <div className="my-[22px] flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: 'var(--c-border2)' }} />
          <span className="text-[11px] uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-dim)' }}>
            or continue with
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--c-border2)' }} />
        </div>

        <div className="flex gap-2.5">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border py-[11px] text-[13px] font-medium"
            style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-1.7 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.9 2 2.7 6.1 2.7 11.2S6.9 20.4 12 20.4c6.9 0 9.3-4.8 9.3-7.3 0-.5 0-.9-.1-1.3H12z" />
            </svg>
            Google
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border py-[11px] text-[13px] font-medium"
            style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--c-text)">
              <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-2.02 1.59-3.04 1.59-.12 0-.23-.02-.29-.03-.015-.1-.045-.4-.045-.7 0-1.14.564-2.27 1.2-2.98.744-.85 2.06-1.5 3.1-1.54.015.13.03.26.03.38zm4.565 15.71c-.42.94-.62 1.36-1.16 2.19-.75 1.16-1.81 2.6-3.12 2.61-1.16.02-1.46-.75-3.03-.74-1.57.01-1.9.76-3.06.74-1.31-.02-2.31-1.32-3.06-2.48-2.1-3.2-2.32-6.96-1.02-8.96.92-1.42 2.38-2.25 3.75-2.25 1.4 0 2.28.76 3.44.76 1.12 0 1.81-.76 3.44-.76 1.22 0 2.51.66 3.43 1.81-3.02 1.66-2.53 5.97.36 7.08z" />
            </svg>
            Apple
          </button>
        </div>

        <p className="mt-[26px] text-center text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
          New to Lagos Live?{' '}
          <Link href="/signup" className="font-semibold" style={{ color: '#A896C9' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
