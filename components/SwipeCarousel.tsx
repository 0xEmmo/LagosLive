'use client';

import { useRef, useState } from 'react';

interface SwipeCarouselProps {
  count: number;
  index: number;
  onIndexChange: (i: number) => void;
  children: React.ReactNode;
}

// Applies progressively increasing resistance past a boundary instead of a hard stop —
// real things slow down before they stop, they don't hit an invisible wall.
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

const DRAG_HYSTERESIS = 8; // px of movement before a press counts as a drag, not a tap
const VELOCITY_THRESHOLD = 0.35; // px/ms — a quick flick commits regardless of distance

/**
 * A drag-to-swipe carousel track: the image follows the finger 1:1 while dragging (no
 * transition), and only animates on release — so it can be grabbed and reversed mid-swipe
 * without fighting a CSS transition. Direction commits on distance OR velocity, whichever
 * comes first, and rubber-bands at the first/last slide instead of stopping dead.
 */
export default function SwipeCarousel({ count, index, onIndexChange, children }: SwipeCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; lastX: number; lastTime: number; velocity: number; committed: boolean } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, lastX: e.clientX, lastTime: performance.now(), velocity: 0, committed: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = now - d.lastTime;
    if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastTime = now;

    const dx = e.clientX - d.startX;
    if (!d.committed && Math.abs(dx) < DRAG_HYSTERESIS) return;
    d.committed = true;
    setDragging(true);

    const width = trackRef.current?.clientWidth || 1;
    const atStart = index === 0 && dx > 0;
    const atEnd = index === count - 1 && dx < 0;
    setDragX(atStart || atEnd ? rubberband(dx, width) : dx);
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.committed) {
      setDragging(false);
      setDragX(0);
      return;
    }
    const width = trackRef.current?.clientWidth || 1;
    const distanceThreshold = width * 0.2;
    let next = index;
    if (dragX < -distanceThreshold || d.velocity < -VELOCITY_THRESHOLD) {
      next = Math.min(count - 1, index + 1);
    } else if (dragX > distanceThreshold || d.velocity > VELOCITY_THRESHOLD) {
      next = Math.max(0, index - 1);
    }
    setDragging(false);
    setDragX(0);
    if (next !== index) onIndexChange(next);
  };

  return (
    <div
      ref={trackRef}
      className="flex h-full"
      style={{
        transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
        transition: dragging ? 'none' : 'transform 450ms cubic-bezier(0.25,0.46,0.45,0.94)',
        touchAction: 'pan-y',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </div>
  );
}
