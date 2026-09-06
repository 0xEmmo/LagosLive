'use client';

// Single source of truth for the guest → account order linking call. The link
// endpoint (POST /api/orders/link-guest) is idempotent and safe to re-run, but
// the sessionStorage guard avoids redundant work across a single session.
//
// Both AuthListener (fire-and-forget) and the /tickets + Profile pages (awaited)
// call this same function so that guest purchases bought under the same email
// surface before fetchMyTickets runs, regardless of how a session began.

export function linkGuestOrdersOnce(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const flag = sessionStorage.getItem('ll_guest_linked');
  if (flag === '1') return Promise.resolve();
  return fetch('/api/orders/link-guest', { method: 'POST' })
    .then((res) => {
      if (res.ok) sessionStorage.setItem('ll_guest_linked', '1');
    })
    .catch(() => {
      // Best-effort: the next page load / sign-in retries automatically.
    });
}