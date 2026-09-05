// ===========================================================================
// Phase 2 check-in — server-sync layer (the seam for Phase 2B offline).
//
// Today this layer is one thin mapping over the atomic staff_check_in RPC and
// is the ONLY place the UI talks to a backend about a scan. Phase 2B ("offline
// door") can replace/expand this module without touching the scanner UI:
//
//   1. QUEUE — write successful scan intents into a local queue (idb) when the
//      network is unavailable instead of calling rpc().
//   2. VET — screen a scanned order-ref against a locally cached ticket list so
//      staff get instant feedback; only 'ok' intents are queued.
//   3. SYNC — replay the queue through staff_check_in() when a connection
//      returns. staff_check_in() is already idempotent/atomic PER TICKET, so a
//      queued replay can only ever return 'ok' once on the server; a second
//      device that already admitted the guest gets 'already_checked_in' and the
//      queue item must be reconciled (reported to staff, not silently applied).
//
// We deliberately do NOT implement cached offline validation yet: a local
// ticket list is only safe with an explicit, per-device trusted-staff claim and
// a server-side reconciliation loop for duplicate prevention. That is Phase 2B.
// ===========================================================================

import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

export type CheckInCode =
  | 'ok'
  | 'already_checked_in'
  | 'invalid'
  | 'wrong_event'
  | 'not_confirmed'
  | 'refunded'
  | 'event_not_live'
  | 'cancelled_event'
  | 'unauthorized'
  | 'network';

export interface CheckInOkResult {
  code: 'ok';
  orderId: string;
  orderRef: string;
  partyId: number;
  guestEmail: string | null;
  quantity: number;
  ticketType: string;
  checkedInAt: string;
  gate: string | null;
}

export interface CheckInAlreadyResult {
  code: 'already_checked_in';
  checkedInAt: string | null;
  gate: string | null;
  checkedInBy: string | null;
}

export interface CheckInErrorResult {
  code: Exclude<CheckInCode, 'ok' | 'already_checked_in'>;
  payment?: string;
  message?: string;
}

export type CheckInResult = CheckInOkResult | CheckInAlreadyResult | CheckInErrorResult;

type JsonObject = {
  [key: string]: unknown;
};

// The RPC payload goes back as a flat JSON object; keep the mapping here so the
// browser shape never leaks into components. Unknown codes degrade to 'invalid'
// — a scanner must never show a green screen on an unexpected answer.
function toCheckInResult(raw: unknown): CheckInResult {
  const obj = (raw ?? {}) as JsonObject;
  const code = obj.code;
  if (code === 'ok') {
    return {
      code: 'ok',
      orderId: String(obj.order_id ?? ''),
      orderRef: String(obj.order_ref ?? ''),
      partyId: Number(obj.party_id ?? 0),
      guestEmail: typeof obj.guest_email === 'string' ? obj.guest_email : null,
      quantity: Number(obj.quantity ?? 1),
      ticketType: String(obj.ticket_type ?? 'General Entry'),
      checkedInAt: String(obj.checked_in_at ?? ''),
      gate: typeof obj.gate === 'string' ? obj.gate : null,
    };
  }
  if (code === 'already_checked_in') {
    return {
      code: 'already_checked_in',
      checkedInAt: typeof obj.checked_in_at === 'string' ? obj.checked_in_at : null,
      gate: typeof obj.gate === 'string' ? obj.gate : null,
      checkedInBy: typeof obj.checked_in_by === 'string' ? obj.checked_in_by : null,
    };
  }
  const known: CheckInResult['code'][] = ['invalid', 'wrong_event', 'not_confirmed', 'refunded', 'event_not_live', 'cancelled_event', 'unauthorized'];
  const mapped = known.includes(code as CheckInResult['code']) ? (code as CheckInErrorResult['code']) : 'invalid';
  return {
    code: mapped,
    payment: typeof obj.payment === 'string' ? obj.payment : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
  };
}

// Staff paste or a damaged-'ed QR: uppercase, strip the leading '#' and any
// whitespace so "ll-82931" / "#ll-82931" both resolve like the printed code.
export function normalizeOrderRef(input: string): string {
  return input.trim().replace(/^#/, '').toUpperCase();
}

export interface PerformCheckInInput {
  partyId: number;
  orderRef: string;
  gate?: string | null;
}

// Validates + admits in ONE atomic server transaction (see 00020 migration).
// Throws only on transport/network failures (retryable); every business answer
// is returned as a CheckInResult so the UI can render the exact state.
export async function performCheckIn({ partyId, orderRef, gate }: PerformCheckInInput): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('staff_check_in', {
    p_party_id: partyId,
    p_order_ref: normalizeOrderRef(orderRef),
    p_gate: gate || undefined,
  });
  if (error) {
    throw new Error(error.message);
  }
  return toCheckInResult(data);
}

// Which error codes are safe to chase with an instant re-scan without staff
// retyping? Everything except network-type failures (which throw, not code).
export function isAdmission(code: CheckInCode): boolean {
  return code === 'ok';
}

export type { Database };