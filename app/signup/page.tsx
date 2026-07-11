'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/BackButton';
import { LogoMark } from '@/components/Logo';
import { useLagosLiveStore } from '@/lib/store';

export default function SignupPage() {
  const router = useRouter();
  const signup = useLagosLiveStore((s) => s.signup);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

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
      router.push('/profile');
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
          <h1 className="font-display mb-1.5 mt-[18px] text-[34px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            Check Your Email
          </h1>
          <p className="max-w-[300px] text-sm" style={{ color: 'var(--c-text-muted)' }}>
            We sent a confirmation link to <strong>{email}</strong>. Confirm your email, then log in.
          </p>
          <Link
            href="/login"
            className="mt-7 w-full rounded-xl border-none py-[15px] text-center font-heading text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', boxShadow: '0 8px 24px rgba(85,44,183,0.28)' }}
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
          <h1 className="font-display mb-1.5 mt-[18px] text-[38px] tracking-[1px]" style={{ color: 'var(--c-text)' }}>
            Join the Vibe
          </h1>
          <p className="text-sm" style={{ color: 'var(--c-text-muted)' }}>
            Create an account to save your favorite parties
          </p>
        </div>

        {error && (
          <div className="mb-4 animate-fade-in rounded-[10px] border px-3.5 py-2.5 text-[13px]" style={{ background: 'rgba(214,64,44,0.1)', borderColor: 'rgba(214,64,44,0.32)', color: '#D6402C' }}>
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
              <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.8px]" style={{ color: 'var(--c-text-muted)' }}>
                {f.label}
              </div>
              <input
                type={f.type}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-[10px] border px-3.5 py-[13px] text-sm outline-none font-heading"
                style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text)' }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-xl border-none py-[15px] font-heading text-sm font-bold text-white transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#552CB7,#FB7DA8)', boxShadow: '0 8px 24px rgba(85,44,183,0.28)' }}
        >
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>

        <p className="mt-[26px] text-center text-[13px]" style={{ color: 'var(--c-text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold" style={{ color: '#552CB7' }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
