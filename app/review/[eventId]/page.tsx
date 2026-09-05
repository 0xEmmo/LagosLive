'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Star } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { useParty } from '@/lib/hooks/useParty';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';

const REVIEW_MAX = 500;

export default function ReviewPage({ params }: { params: { eventId: string } }) {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const showToast = useLagosLiveStore((s) => s.showToast);
  const { party } = useParty(Number(params.eventId));

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace(`/login?next=${encodeURIComponent(`/review/${params.eventId}`)}`);
  }, [authLoading, user, router, params.eventId]);

  const handleSubmit = async () => {
    if (!rating) {
      showToast('Pick a rating', 'Tap a star to rate this event before posting.');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('add_event_review', {
        p_party_id: Number(params.eventId),
        p_rating: rating,
        p_review_text: review.trim(),
      });
      if (error) throw error;
      void data;
      showToast('Review posted', 'Thanks for sharing your experience.');
      router.push(`/party/${params.eventId}`);
    } catch (err) {
      console.error('[review] submit error', err);
      showToast('Could not post review', err instanceof Error ? err.message : 'Please try again.');
      setIsLoading(false);
    }
  };

  const effectiveHover = hover || rating;

  return (
    <div className="mx-auto max-w-[600px] animate-fade-in pb-24">
      <div
        className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <BackButton href={party ? `/party/${party.id}` : '/'} />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
          Rate &amp; Review
        </span>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <div>
          <h1 className="font-display text-[30px] leading-none tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
            How was it?
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#A7A8B5' }}>
            {party?.title ? `Tell other Lagos Live guests about ${party.title}.` : 'Share your experience with other guests.'}
          </p>
        </div>

        {/* Star rating */}
        <div>
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
            Your rating
          </p>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                className="transition-transform duration-100 active:scale-90"
                aria-label={`${star} star${star === 1 ? '' : 's'}`}
              >
                <Star
                  size={40}
                  strokeWidth={1.5}
                  fill={star <= effectiveHover ? '#FFD600' : 'none'}
                  color={star <= effectiveHover ? '#FFD600' : '#6B6C80'}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Review text */}
        <div>
          <label className="mb-2 block text-[11px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
            Your review <span style={{ color: '#6B6C80' }}>(optional)</span>
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value.slice(0, REVIEW_MAX))}
            placeholder="The music was unreal, the vibes were immaculate…"
            rows={5}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          />
          <p className="mt-1.5 text-xs" style={{ color: '#6B6C80' }}>
            {review.length}/{REVIEW_MAX} characters
          </p>
        </div>

        {/* Only ticket holders */}
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <Lock size={13} strokeWidth={2} color="#6B6C80" className="flex-shrink-0" />
          <p className="text-xs leading-[1.5]" style={{ color: '#A7A8B5' }}>
            <span style={{ color: '#A7A8B5', fontWeight: 600 }}>You can update this anytime.</span> Reviews require a confirmed ticket and open once the event starts.
          </p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || !rating}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] py-4 text-[13px] font-bold uppercase tracking-[0.5px] transition-all duration-200 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(255,45,149,0.3)' }}
        >
          {isLoading ? (
            <>
              <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />
              Posting…
            </>
          ) : (
            'Post Review'
          )}
        </button>
      </div>
    </div>
  );
}