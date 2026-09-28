'use client';

import Image from 'next/image';
import BackButton from '@/components/BackButton';
import { SiteLogo } from '@/components/Logo';

type AuthMode = 'login' | 'signup';

const AUTH_COPY: Record<AuthMode, { kicker: string; title: string; accent: string; description: string; image: string; label: string }> = {
  signup: {
    kicker: 'JOIN LAGOS LIVE',
    title: 'YOUR NEXT NIGHT',
    accent: 'STARTS HERE.',
    description: 'Find the events, the music and the people that make Lagos feel like Lagos.',
    image: '/images/auth/signup-crowd.webp',
    label: 'Sign-up crowd artwork',
  },
  login: {
    kicker: 'GOOD TO SEE YOU',
    title: 'WELCOME BACK.',
    accent: 'THE CITY IS OPEN.',
    description: 'Pick up where you left off and see what is happening next in the city.',
    image: '/images/auth/login-crowd.webp',
    label: 'Sign-in crowd artwork',
  },
};

export default function AuthSplitLayout({ mode, children }: { mode: AuthMode; children: React.ReactNode }) {
  const copy = AUTH_COPY[mode];

  return (
    <main className={`auth-split-layout auth-split-layout--${mode} animate-fade-in`}>
      <section className="auth-split-layout__form" aria-label={mode === 'signup' ? 'Create a Lagos Live account' : 'Sign in to Lagos Live'}>
        <header className="auth-split-layout__topbar">
          <BackButton href="/" label="Home" />
          <SiteLogo className="auth-split-layout__wordmark" />
        </header>

        <div className="auth-split-layout__content">{children}</div>

        <div className="auth-split-layout__footnote">
          <span className="auth-split-layout__status-dot" aria-hidden="true" />
          LAGOS LIVE <span aria-hidden="true">/</span> YOUR CITY, YOUR NIGHT
        </div>
      </section>

      <aside className="auth-split-layout__visual" aria-label={copy.label}>
        <Image
          src={copy.image}
          alt=""
          fill
          priority
          sizes="(max-width: 860px) 100vw, 50vw"
          className="auth-split-layout__image"
        />
        <div className="auth-split-layout__wash" aria-hidden="true" />
        <div className="auth-split-layout__visual-kicker">LAGOS LIVE <span>/</span> AFTER DARK</div>
        <div className="auth-split-layout__visual-copy">
          <p className="auth-split-layout__eyebrow">{copy.kicker}</p>
          <h2 className="font-display">
            {copy.title}
            <span>{copy.accent}</span>
          </h2>
          <p className="auth-split-layout__description">{copy.description}</p>
        </div>
        <div className="auth-split-layout__visual-footer">
          <span>Discover. Gather. Go out.</span>
          <span>{mode === 'signup' ? '01 / 02' : '02 / 02'}</span>
        </div>
      </aside>
    </main>
  );
}
