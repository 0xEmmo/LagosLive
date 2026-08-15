'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { LogoMark } from '@/components/Logo';
import { useLagosLiveStore } from '@/lib/store';

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signup = useLagosLiveStore((s) => s.signup);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/profile';
  const nextQuery = next !== '/profile' ? `?next=${encodeURIComponent(next)}` : '';

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in your name, email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    const { error: signupError, needsEmailConfirmation } = await signup(name.trim(), email.trim(), password);
    setSubmitting(false);
    if (signupError) {
      setError(signupError);
      return;
    }
    setError('');
    if (needsEmailConfirmation) {
      setConfirmationSent(true);
    } else {
      router.push(next);
    }
  };

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen flex-col animate-fade-in">
        <div className="px-5 py-4">
          <BackButton href="/" />
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col items-center justify-center px-7 pb-[60px] text-center">
          <LogoMark size={56} />
          <h1 className="font-display mb-1.5 mt-[18px] text-[34px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Check Your Email
          </h1>
          <p className="max-w-[300px] text-sm" style={{ color: '#A7A8B5' }}>
            We sent a confirmation link to <strong style={{ color: '#FFFFFF' }}>{email}</strong>. Confirm your email, then log in.
          </p>
          <Link
            href={`/login${nextQuery}`}
            className="btn-primary mt-7 w-full py-[15px] text-center text-sm font-bold"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col animate-fade-in">
      <div className="px-5 py-4">
        <BackButton href="/" />
      </div>
      <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-7 pb-[60px]">
        <div className="mb-7 text-center">
          <LogoMark size={56} />
          <h1 className="font-display mb-1.5 mt-[18px] text-[38px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Join the Vibe
          </h1>
          <p className="text-sm" style={{ color: '#A7A8B5' }}>
            Create an account to save your favorite parties
          </p>
        </div>

        {error && (
          <div className="mb-4 animate-fade-in rounded-[10px] px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(255,138,0,0.08)', border: '1px solid rgba(255,138,0,0.2)', color: '#FF8A00' }}>
            {error}
          </div>
        )}

        <div className="mb-[22px] flex flex-col gap-3.5">
          {[
            { label: 'Full Name', value: name, set: setName, placeholder: 'Ada Okafor', type: 'text' },
            { label: 'Email', value: email, set: setEmail, placeholder: 'you@example.com', type: 'email' },
            { label: 'Phone Number', value: phone, set: setPhone, placeholder: '080X XXX XXXX', type: 'text' },
            { label: 'Password', value: password, set: setPassword, placeholder: '••••••••', type: 'password' },
          ].map((f) => (
            <div key={f.label}>
              <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: '#A7A8B5' }}>
                {f.label}
              </div>
              <input
                type={f.type}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-[10px] px-3.5 py-[13px] text-sm outline-none font-heading transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,45,149,0.3)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="btn-primary w-full py-[15px] text-sm font-bold disabled:opacity-60"
        >
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>

        <p className="mt-[26px] text-center text-[13px]" style={{ color: '#A7A8B5' }}>
          Already have an account?{' '}
          <Link href={`/login${nextQuery}`} className="font-semibold" style={{ color: '#FF2D95' }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
