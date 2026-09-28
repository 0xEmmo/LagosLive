'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Music2,
  Search,
  Ticket,
} from 'lucide-react';
import Faq from '@/components/home/Faq';
import FinalCta from '@/components/home/FinalCta';
import HowItWorks from '@/components/home/HowItWorks';
import PartyCard from '@/components/PartyCard';
import PartyPhoto from '@/components/PartyPhoto';
import Pricing from '@/components/home/Pricing';
import { useParties } from '@/lib/hooks/useParties';
import { isPartyThisWeekend, isPartyTonight, sortByTrending } from '@/lib/filters';
import { ALL_VIBES, hostStartHref, partyPhoto } from '@/lib/data';
import { useLagosLiveStore } from '@/lib/store';
import type { Party, Vibe } from '@/lib/types';

const SPOTIFY_PLAYLIST_URL =
  'https://open.spotify.com/playlist/1GSP7SCHTQOeDtax41ZWho?si=MS8WKhT5S5iWvX9xqOW-Lw';

const AREAS = ['Victoria Island', 'Lekki', 'Ikoyi', 'Yaba', 'Ikeja', 'Surulere', 'Ajah', 'Eko Atlantic'];

const VIBE_COPY: Record<Vibe, string> = {
  Club: 'After-hours energy',
  Rooftop: 'Open-air gatherings',
  Festival: 'Big city moments',
  Concert: 'Live music, up close',
  'House Party': 'Good people, close in',
  Lounge: 'Take it easy',
};

function SectionHeading({
  eyebrow,
  title,
  body,
  href,
  linkLabel = 'VIEW ALL EVENTS',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="ll-section-heading">
      <div>
        <p className="ll-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {body && <p className="ll-section-heading__body">{body}</p>}
      </div>
      {href && (
        <Link href={href} className="ll-text-link">
          {linkLabel} <ArrowRight size={15} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

function EventEmpty({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href: string;
}) {
  return (
    <div className="ll-event-empty">
      <div className="ll-event-empty__mark" aria-hidden="true"><Ticket size={18} strokeWidth={1.7} /></div>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <Link href={href} className="ll-event-empty__link">
        Explore events <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function EventError({ retry }: { retry: () => void }) {
  return (
    <div className="ll-event-empty ll-event-empty--error" role="status">
      <div>
        <h3>Event listings are taking a moment.</h3>
        <p>We could not load the latest plans. Try again in a moment.</p>
      </div>
      <button type="button" onClick={retry} className="ll-event-empty__link">
        Try again <ArrowRight size={14} />
      </button>
    </div>
  );
}

function EventSkeletons() {
  return (
    <div className="ll-home-event-grid" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div className="ll-home-skeleton" key={item}>
          <div className="ll-home-skeleton__media" />
          <div className="ll-home-skeleton__line ll-home-skeleton__line--long" />
          <div className="ll-home-skeleton__line" />
          <div className="ll-home-skeleton__line ll-home-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}

function EventShelf({
  id,
  eyebrow,
  title,
  body,
  href,
  parties,
  loading,
  error,
  retry,
  emptyTitle,
  emptyBody,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  parties: Party[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <section id={id} className="ll-section ll-event-shelf">
      <div className="ll-shell">
        <SectionHeading eyebrow={eyebrow} title={title} body={body} href={href} />
        {loading ? (
          <div aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}><EventSkeletons /></div>
        ) : error ? (
          <EventError retry={retry} />
        ) : parties.length ? (
          <div className="ll-home-event-grid">
            {parties.slice(0, 3).map((party, index) => (
              <PartyCard key={party.id} party={party} index={index} imageHeight={190} appearance="editorial" />
            ))}
          </div>
        ) : (
          <EventEmpty title={emptyTitle} body={emptyBody} href={href} />
        )}
      </div>
    </section>
  );
}

function FeaturedEvent({ party }: { party: Party }) {
  const image = partyPhoto(party.id, party.coverUrl);
  return (
    <Link href={`/party/${party.id}`} className="ll-featured-card">
      <div className="ll-featured-card__copy">
        <span className="ll-featured-card__label">{party.vibe} · FEATURED EVENT</span>
        <h3>{party.title}</h3>
        <div className="ll-featured-card__meta">
          <span><CalendarDays size={14} /> {party.date}</span>
          <span><Clock3 size={14} /> {party.time}</span>
          <span><MapPin size={14} /> {party.location}</span>
        </div>
        <div className="ll-featured-card__bottom">
          <strong>{party.feeNum === 0 ? 'Free entry' : `From ${party.fee}`}</strong>
          <span className="ll-featured-card__button">View event <ArrowRight size={15} /></span>
        </div>
      </div>
      <div className={`ll-featured-card__visual${image ? '' : ' ll-featured-card__visual--empty'}`}>
        {image ? (
          <PartyPhoto src={image} alt={party.title} gradient={party.gradient} sizes="(max-width: 768px) 100vw, 56vw" priority tone="editorial" />
        ) : (
          <div className="ll-featured-card__no-cover">
            <span>EVENT COVER</span>
            <strong>COMING<br />SOON</strong>
            <small>No image supplied by the organizer</small>
          </div>
        )}
        <span className="ll-featured-card__number">01 / THIS WEEK</span>
      </div>
    </Link>
  );
}

function EmptyFeatured({ error, retry, hostHref }: { error: string | null; retry: () => void; hostHref: string }) {
  return (
    <div className="ll-featured-empty">
      <div className="ll-featured-empty__copy">
        <span className="ll-featured-card__label">{error ? 'EVENTS UNAVAILABLE' : 'THE CITY IS OPEN'}</span>
        <h3>{error ? 'WE’LL BE BACK IN A MOMENT.' : 'THE NEXT PLAN IS OUT THERE.'}</h3>
        <p>
          {error
            ? 'The current event lineup could not be loaded. Try again, or come back shortly.'
            : 'New events will appear here as Lagos organizers publish their plans. Explore the marketplace in the meantime.'}
        </p>
        <div className="ll-featured-empty__actions">
          {error ? (
            <button type="button" onClick={retry} className="ll-button ll-button--blue">Try again <ArrowRight size={15} /></button>
          ) : (
            <Link href="/events" className="ll-button ll-button--blue">Explore events <ArrowRight size={15} /></Link>
          )}
          <Link href={hostHref} className="ll-button ll-button--outline">Host an event</Link>
        </div>
      </div>
      <div className="ll-featured-empty__visual">
        <Image
          src="/images/home/lagos-cultural-festival.webp"
          alt="A crowd at a cultural festival in Lagos"
          fill
          sizes="(max-width: 768px) 100vw, 52vw"
          className="ll-featured-empty__image"
        />
        <div className="ll-featured-empty__image-shade" />
        <span>THE CITY, IN MOTION</span>
      </div>
    </div>
  );
}

function LagosMapIllustration() {
  return (
    <div className="ll-map-art">
      <svg viewBox="0 0 760 400" role="img" aria-label="Stylized illustration of Lagos neighborhoods">
        <path className="ll-map-water" d="M0 302 C112 270 164 318 260 290 C371 258 444 299 530 278 C627 254 699 273 760 246 L760 400 L0 400Z" />
        <g className="ll-map-roads">
          <path d="M-18 270 C78 225 143 217 217 239 S357 294 441 249 588 170 782 197" />
          <path d="M34 372 C115 315 167 268 244 201 S371 125 445 138 597 202 781 92" />
          <path d="M88 -20 C143 79 171 151 186 210 S230 300 316 419" />
          <path d="M363 -18 C339 70 345 138 375 206 S425 316 435 414" />
          <path d="M646 -16 C601 87 570 144 552 205 S564 314 623 417" />
          <path d="M-14 128 C96 159 192 149 278 108 S441 46 558 73 685 126 776 118" />
          <path d="M-20 335 C73 294 126 298 206 318 S350 374 447 338 611 278 780 303" />
          <path d="M227 -22 C240 64 274 109 321 161 S395 261 378 414" />
          <path d="M497 -20 C460 66 454 130 487 194 S555 310 536 418" />
        </g>
        <g className="ll-map-routes">
          <path d="M150 270 C229 246 267 210 328 175 S438 147 512 188 601 207 679 155" />
          <path d="M186 90 C227 128 275 150 328 175 S370 240 399 296" />
        </g>
        <g className="ll-map-points">
          <circle cx="176" cy="267" r="7" /><circle cx="328" cy="175" r="7" />
          <circle cx="512" cy="188" r="7" /><circle cx="399" cy="296" r="7" />
          <circle cx="616" cy="119" r="7" />
        </g>
        <g className="ll-map-labels">
          <text x="112" y="253">IKEJA</text>
          <text x="277" y="158">YABA</text>
          <text x="526" y="176">IKOYI</text>
          <text x="412" y="320">VICTORIA ISLAND</text>
          <text x="624" y="104">LEKKI</text>
        </g>
        <text className="ll-map-water-label" x="86" y="351">LAGOS LAGOON</text>
      </svg>
      <span className="ll-map-art__caption">A CITY OF MANY PLANS</span>
    </div>
  );
}

function LagosLocationSection() {
  return (
    <section className="ll-section ll-location-section">
      <div className="ll-shell ll-location-layout">
        <div className="ll-location-copy">
          <p className="ll-eyebrow">FIND YOUR SIDE OF THE CITY</p>
          <h2>LAGOS<br /><span>BY LOCATION.</span></h2>
          <p>From Lekki nights to the mainland scene, find what is happening near your part of Lagos.</p>
          <div className="ll-location-areas" aria-label="Browse events by area">
            {AREAS.slice(0, 6).map((area) => (
              <Link key={area} href={`/events?location=${encodeURIComponent(area)}`}>{area}</Link>
            ))}
          </div>
          <Link href="/map" className="ll-button ll-button--outline">Open the event map <ArrowRight size={15} /></Link>
        </div>
        <Link href="/map" className="ll-map-link" aria-label="Open the interactive Lagos event map">
          <LagosMapIllustration />
          <span className="ll-map-link__note">Interactive map <ArrowRight size={14} /></span>
        </Link>
      </div>
    </section>
  );
}

function VibeSection({ counts }: { counts: Record<Vibe, number> }) {
  return (
    <section className="ll-vibe-section">
      <div className="ll-shell ll-vibe-row">
        <div className="ll-vibe-intro">
          <p className="ll-eyebrow">PICK YOUR MOOD</p>
          <h2>EXPLORE<br />BY VIBE</h2>
        </div>
        <div className="ll-vibe-list">
          {ALL_VIBES.map((vibe) => (
            <Link
              key={vibe}
              href={`/events?vibe=${encodeURIComponent(vibe)}`}
              title={VIBE_COPY[vibe]}
              aria-label={`${vibe}: ${VIBE_COPY[vibe]}. ${counts[vibe]} ${counts[vibe] === 1 ? 'event' : 'events'}`}
            >
              <span>{vibe}</span>
              <small>{counts[vibe]} {counts[vibe] === 1 ? 'event' : 'events'}</small>
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
        <Link href="/events" className="ll-vibe-all">All events <ArrowRight size={14} /></Link>
      </div>
    </section>
  );
}

function NextNightSection() {
  return (
    <section className="ll-section ll-night-section" aria-labelledby="next-night-title">
      <div className="ll-shell ll-night-card">
        <Image
          src="/images/home/next-night-out.webp"
          alt="A crowd at an outdoor Lagos music festival beneath bright stage lights"
          fill
          sizes="(max-width: 768px) calc(100vw - 34px), 92vw"
          className="ll-night-card__image"
        />
        <div className="ll-night-card__shade" aria-hidden="true" />
        <div className="ll-night-card__copy">
          <p className="ll-eyebrow">MAKE TONIGHT YOURS</p>
          <h2 id="next-night-title">YOUR NEXT<br />GREAT NIGHT<br /><span>STARTS HERE</span></h2>
          <p>Discover live music, late-night parties and the city moments worth showing up for.</p>
          <Link href="/events" className="ll-button ll-button--blue">Explore events <ArrowRight size={15} /></Link>
        </div>
      </div>
    </section>
  );
}

function SoundSection() {
  return (
    <section className="ll-section ll-sound-section">
      <div className="ll-shell ll-sound-card">
        <div className="ll-sound-card__image">
          <Image
            src="/images/home/beat-of-city.webp"
            alt="A DJ performing an after-party set behind a mixing console"
            fill
            sizes="(max-width: 768px) 100vw, 48vw"
          />
          <span>THE CITY HAS A SOUND</span>
        </div>
        <div className="ll-sound-card__copy">
          <p className="ll-eyebrow">THE LAGOS LIVE SOUND</p>
          <h2>THE BEAT<br />OF THE CITY.</h2>
          <p>Afrobeats, late-night sets and the sounds that bring the city together. Tune in before you head out.</p>
          <Link href={SPOTIFY_PLAYLIST_URL} target="_blank" rel="noopener noreferrer" className="ll-button ll-button--outline">
            <Music2 size={16} /> Listen on Spotify <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function OrganizerSection({ user }: { user: { id: string } | null }) {
  const href = hostStartHref(user);
  return (
    <section id="for-hosts" className="ll-section ll-organizer-section">
      <div className="ll-shell ll-organizer-card">
        <div className="ll-organizer-card__visual">
          <Image
            src="/images/home/organizer-festival.webp"
            alt="Festival-goers celebrating together at an African music event"
            fill
            sizes="(max-width: 768px) 100vw, 45vw"
          />
          <div className="ll-organizer-card__visual-shade" />
          <span>FOR THE PEOPLE WHO MAKE LAGOS HAPPEN</span>
        </div>
        <div className="ll-organizer-card__copy">
          <p className="ll-eyebrow">FOR ORGANIZERS</p>
          <h2>YOUR EVENT<br />DESERVES<br /><span>TO BE SEEN.</span></h2>
          <p>Create an event page, sell tickets and manage the door from one place.</p>
          <ul>
            <li><Check size={15} /> Multiple ticket types and promo codes</li>
            <li><Check size={15} /> QR check-in and live sales tracking</li>
            <li><Check size={15} /> Clear payouts and simple pricing</li>
          </ul>
          <div className="ll-organizer-card__actions">
            <Link href={href} className="ll-button ll-button--blue">Create an event <ArrowRight size={15} /></Link>
            <Link href="/#pricing" className="ll-text-link">See pricing</Link>
          </div>
          <small>Free events stay free. Ticketed events carry a 5% + ₦100 fee per paid ticket.</small>
        </div>
      </div>
    </section>
  );
}

export default function HomeLandingPage() {
  const { parties, loading, error, retry } = useParties();
  const user = useLagosLiveStore((state) => state.user);
  const router = useRouter();
  const [query, setQuery] = useState('');

  const upcoming = useMemo(() => {
    const now = Date.now();
    return parties.filter((party) => {
      const startsAt = new Date(party.startsAt).getTime();
      return Number.isFinite(startsAt) && startsAt >= now && party.status === 'approved' && !party.cancelledAt;
    });
  }, [parties]);

  const ranked = useMemo(() => sortByTrending(upcoming), [upcoming]);
  const featured = ranked[0];
  const tonight = useMemo(() => ranked.filter((party) => isPartyTonight(party)).slice(0, 3), [ranked]);
  const weekend = useMemo(() => ranked.filter((party) => isPartyThisWeekend(party)).slice(0, 3), [ranked]);
  const vibeCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_VIBES.map((vibe) => [vibe, 0])) as Record<Vibe, number>;
    for (const party of upcoming) counts[party.vibe] += 1;
    return counts;
  }, [upcoming]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/events?q=${encodeURIComponent(value)}` : '/events');
  };

  return (
    <main className="ll-home">
      <section className="ll-hero">
        <Image
          src="/images/home/hero-concert.webp"
          alt="A woman enjoying live music in a blue-lit concert crowd"
          fill
          priority
          sizes="100vw"
          className="ll-hero__image"
        />
        <div className="ll-hero__shade" />
        <div className="ll-hero__grid" aria-hidden="true" />
        <div className="ll-shell ll-hero__content">
          <p className="ll-hero__eyebrow"><span /> THE CITY IS LIVE</p>
          <h1>WHAT’S<br />HAPPENING<br /><span>IN LAGOS?</span></h1>
          <p className="ll-hero__description">Discover parties, concerts, culture and everything worth showing up for.</p>
          <form className="ll-hero__search" onSubmit={submitSearch} role="search">
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search events, venues, DJs..."
              aria-label="Search events, venues, or DJs"
            />
            <button type="submit" aria-label="Search events"><ArrowRight size={16} /></button>
          </form>
          <div className="ll-hero__actions">
            <Link href="/events" className="ll-button ll-button--blue">Explore events <ArrowRight size={15} /></Link>
            <Link href={hostStartHref(user)} className="ll-button ll-button--outline">Host an event</Link>
          </div>
          <div className="ll-hero__microcopy">LAGOS · EVENTS · CULTURE · DISCOVERY</div>
        </div>
        <div className="ll-hero__aside" aria-hidden="true">
          <span>01</span><p>THIS WEEK<br />IN LAGOS</p><i />
        </div>
        <div className="ll-hero__coordinates" aria-hidden="true">06°26&apos;N&nbsp; / &nbsp;03°25&apos;E <span>LAGOS, NIGERIA</span></div>
        <a className="ll-hero__scroll" href="#discover" aria-label="Scroll to discover events"><ArrowDown size={15} /></a>
      </section>

      <section id="discover" className="ll-section ll-feature-section">
        <div className="ll-shell">
          <SectionHeading
            eyebrow="FEATURED THIS WEEK"
            title="LAGOS AFTER DARK"
            body="A city-wide line-up, not just one night. Find the next plan that feels like yours."
            href="/events"
          />
          {loading ? (
            <div className="ll-featured-skeleton" aria-busy="true" aria-label="Loading featured event"><div /><span /><span /></div>
          ) : featured ? (
            <FeaturedEvent party={featured} />
          ) : (
            <EmptyFeatured error={error} retry={retry} hostHref={hostStartHref(user)} />
          )}
        </div>
      </section>

      <EventShelf
        id="tonight"
        eyebrow="MAKE TONIGHT COUNT"
        title="TONIGHT IN LAGOS"
        body="Plans happening tonight, across the city."
        href="/events?date=Tonight"
        parties={tonight}
        loading={loading}
        error={error}
        retry={retry}
        emptyTitle="Nothing listed for tonight yet."
        emptyBody="New plans will appear here as organizers publish them."
      />

      <EventShelf
        id="weekend"
        eyebrow="YOUR NEXT OPEN INVITE"
        title="THIS WEEKEND"
        body="Save a plan for the days just ahead."
        href="/events?date=This%20Weekend"
        parties={weekend}
        loading={loading}
        error={error}
        retry={retry}
        emptyTitle="The weekend line-up is still open."
        emptyBody="Check back soon, or browse everything currently listed."
      />

      <NextNightSection />
      <LagosLocationSection />
      <VibeSection counts={vibeCounts} />
      <SoundSection />
      <OrganizerSection user={user} />
      <HowItWorks />
      <Pricing />
      <Faq />
      <FinalCta />
    </main>
  );
}
