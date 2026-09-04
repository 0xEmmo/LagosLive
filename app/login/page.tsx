'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { LogoMark } from '@/components/Logo';
import { useLagosLiveStore } from '@/lib/store';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLagosLiveStore((s) => s.login);
  const user = useLagosLiveStore((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const rawNext = searchParams.get('next');
  const requestedNext = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null;
  const defaultHome = user?.isAdmin
    ? '/admin'
    : user?.role === 'organizer'
      ? '/host'
      : '/profile';
  const next = requestedNext ?? defaultHome;
  const signupHref = requestedNext ? `/signup?next=${encodeURIComponent(requestedNext)}` : '/signup';

  // If we're already signed in (e.g. the user navigates to /login while
  // authenticated, or auth is restored after a page reload), bounce them to
  // their dashboard instead of showing the form again.
  useEffect(() => {
    if (user) router.replace(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    const errorMessage = await login(email.trim(), password);
    setSubmitting(false);
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    setError('');
    router.push(next);
  };

  return (
    <div className="flex min-h-screen flex-col animate-fade-in">
      <div className="px-5 py-4">
        <BackButton href="/" />
      </div>
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-7 pb-[60px]">
        <div className="mb-8 text-center">
          <LogoMark size={56} />
          <h1 className="font-display mb-1.5 mt-[18px] text-[38px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Welcome Back
          </h1>
          <p className="text-sm" style={{ color: '#A7A8B5' }}>
            Log in to save parties &amp; get tickets faster
          </p>
        </div>

        {error && (
          <div className="mb-4 animate-fade-in rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.25)', color: '#FF5A2E' }}>
            {error}
          </div>
        )}

        <div className="mb-[22px] flex flex-col gap-3.5">
          <div>
            <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: '#A7A8B5' }}>
              Email
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-[10px] px-3.5 py-[13px] text-sm outline-none font-heading transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,90,46,0.3)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>
          <div>
            <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: '#A7A8B5' }}>
              Password
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-[10px] px-3.5 py-[13px] text-sm outline-none font-heading transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,90,46,0.3)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="btn-primary w-full py-[15px] text-sm font-bold disabled:opacity-60"
        >
          {submitting ? 'Logging in...' : 'Log In'}
        </button>

        <p className="mt-[26px] text-center text-[13px]" style={{ color: '#A7A8B5' }}>
          New to Lagos Live?{' '}
          <Link href={signupHref} className="font-semibold" style={{ color: '#FF5A2E' }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
