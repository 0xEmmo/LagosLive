'use client';

import { type FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthPasswordField from '@/components/auth/AuthPasswordField';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import GoogleAuthButton from '@/components/GoogleAuthButton';
import { useLagosLiveStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import {
  buildGoogleCallbackUrl,
  classifyOAuthError,
  oauthErrorMessage,
  safeNextPath,
} from '@/lib/auth-redirect';

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const rawNext = searchParams.get('next');
  const next = safeNextPath(rawNext);
  const nextQuery = next !== '/profile' ? `?next=${encodeURIComponent(next)}` : '';
  const callbackError = oauthErrorMessage(searchParams.get('error'));

  useEffect(() => {
    if (callbackError) setError(callbackError);
  }, [callbackError]);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in your name, email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!acceptedTerms) {
      setError('Please agree to the Terms & Conditions and Privacy Policy to create an account.');
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const signInWithGoogle = async () => {
    if (googleLoading || submitting) return;

    if (!acceptedTerms) {
      setError('Please agree to the Terms & Conditions and Privacy Policy to continue with Google.');
      return;
    }

    setError('');
    setGoogleLoading(true);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildGoogleCallbackUrl(window.location.origin, next),
        },
      });

      if (oauthError) {
        setError(oauthErrorMessage(classifyOAuthError(oauthError.code, oauthError.message)));
        setGoogleLoading(false);
      }
    } catch {
      setError(oauthErrorMessage('oauth_failed'));
      setGoogleLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthSplitLayout mode="signup">
        <div className="auth-form-stack auth-confirmation">
          <p className="auth-form-eyebrow">ONE LAST STEP</p>
          <h1 className="font-display mb-2 mt-2 text-[34px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Check Your Email
          </h1>
          <p className="text-sm" style={{ color: '#A7A8B5' }}>
            We sent a confirmation link to <strong style={{ color: '#FFFFFF' }}>{email}</strong>. Confirm your email, then log in.
          </p>
          <Link href={`/login${nextQuery}`} className="btn-primary auth-submit mt-7 block w-full py-[15px] text-center text-sm font-bold">
            Go to Login
          </Link>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout mode="signup">
      <div className="auth-form-stack">
        <div className="mb-6">
          <p className="auth-form-eyebrow">CREATE YOUR ACCOUNT</p>
          <h1 className="font-display mb-1.5 mt-2 text-[38px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Join the Vibe
          </h1>
          <p className="text-sm" style={{ color: '#A7A8B5' }}>
            Create an account to save your favorite parties.
          </p>
        </div>

        {error && (
          <div className="auth-message auth-message--error" role="alert">
            {error}
          </div>
        )}

        <GoogleAuthButton onClick={signInWithGoogle} loading={googleLoading} disabled={submitting} />

        <div className="auth-divider" aria-hidden="true">
          <span />
          <span>OR SIGN UP WITH EMAIL</span>
          <span />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-5 flex flex-col gap-3">
            <label className="auth-field" htmlFor="signup-name">
              <span className="auth-field__label">Full Name</span>
              <input
                id="signup-name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Okafor"
                autoComplete="name"
                required
                className="auth-input"
              />
            </label>
            <label className="auth-field" htmlFor="signup-email">
              <span className="auth-field__label">Email</span>
              <input
                id="signup-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="auth-input"
              />
            </label>
            <label className="auth-field" htmlFor="signup-phone">
              <span className="auth-field__label">Phone Number</span>
              <input
                id="signup-phone"
                name="tel"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="080X XXX XXXX"
                autoComplete="tel"
                className="auth-input"
              />
            </label>
            <AuthPasswordField
              id="signup-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
          </div>

          <label className="mb-5 flex items-start gap-3 text-[12px] leading-5" style={{ color: '#A7A8B5' }}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(event) => {
                setAcceptedTerms(event.target.checked);
                if (event.target.checked) setError('');
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[#2B68FF]"
              required
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="font-semibold auth-text-link">Terms &amp; Conditions</Link>{' '}
              and acknowledge the{' '}
              <Link href="/privacy" target="_blank" className="font-semibold auth-text-link">Privacy Policy</Link>.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || googleLoading}
            className="btn-primary auth-submit w-full py-[15px] text-sm font-bold disabled:opacity-60"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px]" style={{ color: '#A7A8B5' }}>
          Already have an account?{' '}
          <Link href={`/login${nextQuery}`} className="font-semibold auth-text-link">
            Log in
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}
