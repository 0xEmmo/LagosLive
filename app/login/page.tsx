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

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLagosLiveStore((s) => s.login);
  const user = useLagosLiveStore((s) => s.user);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const rawNext = searchParams.get('next');
  const requestedNext = safeNextPath(rawNext, '') || null;
  const defaultHome = user?.isAdmin
    ? '/admin'
    : user?.role === 'organizer'
      ? '/host'
      : '/profile';
  const next = requestedNext ?? defaultHome;
  const signupHref = requestedNext ? `/signup?next=${encodeURIComponent(requestedNext)}` : '/signup';
  const callbackError = oauthErrorMessage(searchParams.get('error'));

  useEffect(() => {
    if (callbackError) setError(callbackError);
  }, [callbackError]);

  // If we're already signed in, route them to the requested page or dashboard.
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };

  const signInWithGoogle = async () => {
    if (googleLoading || submitting) return;

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

  return (
    <AuthSplitLayout mode="login">
      <div className="auth-form-stack">
        <div className="mb-7">
          <p className="auth-form-eyebrow">SIGN IN TO YOUR ACCOUNT</p>
          <h1 className="font-display mb-1.5 mt-2 text-[38px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Welcome Back
          </h1>
          <p className="text-sm" style={{ color: '#A7A8B5' }}>
            Log in to save parties &amp; get tickets faster.
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
          <span>OR CONTINUE WITH EMAIL</span>
          <span />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-5 flex flex-col gap-3.5">
            <label className="auth-field" htmlFor="login-email">
              <span className="auth-field__label">Email</span>
              <input
                id="login-email"
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
            <AuthPasswordField
              id="login-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || googleLoading}
            className="btn-primary auth-submit w-full py-[15px] text-sm font-bold disabled:opacity-60"
          >
            {submitting ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px]" style={{ color: '#A7A8B5' }}>
          New to Lagos Live?{' '}
          <Link href={signupHref} className="font-semibold auth-text-link">
            Create an account
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
