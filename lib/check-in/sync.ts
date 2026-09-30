// Hybrid online-first check-in. The server remains authoritative; offline mode
// validates only against a downloaded event manifest and queues scans for replay.
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import {
  getLocalTicket,
  makeScanId,
  markLocalCheckedIn,
  queueScan,
  getQueuedScans,
  removeQueuedScan,
  saveConflict,
  type QueuedScan,
} from './offline';

export type CheckInCode =
  | 'ok' | 'already_checked_in' | 'invalid' | 'wrong_event' | 'not_confirmed'
  | 'refunded' | 'event_not_live' | 'cancelled_event' | 'unauthorized' | 'network';

export interface CheckInOkResult {
  code: 'ok'; orderId: string; orderRef: string; partyId: number;
  guestEmail: string | null; quantity: number; ticketType: string;
  checkedInAt: string; gate: string | null; offline?: boolean;
}
export interface CheckInAlreadyResult {
  code: 'already_checked_in'; checkedInAt: string | null; gate: string | null;
  checkedInBy: string | null; offline?: boolean;
}
export interface CheckInErrorResult {
  code: Exclude<CheckInCode, 'ok' | 'already_checked_in'>;
  payment?: string; message?: string;
}
export type CheckInResult = CheckInOkResult | CheckInAlreadyResult | CheckInErrorResult;
type JsonObject = { [key: string]: unknown };

function toCheckInResult(raw: unknown): CheckInResult {
  const obj = (raw ?? {}) as JsonObject;
  const code = obj.code;
  if (code === 'ok') return {
    code: 'ok', orderId: String(obj.order_id ?? ''), orderRef: String(obj.order_ref ?? ''),
    partyId: Number(obj.party_id ?? 0), guestEmail: typeof obj.guest_email === 'string' ? obj.guest_email : null,
    quantity: Number(obj.quantity ?? 1), ticketType: String(obj.ticket_type ?? 'General Entry'),
    checkedInAt: String(obj.checked_in_at ?? ''), gate: typeof obj.gate === 'string' ? obj.gate : null,
  };
  if (code === 'already_checked_in') return {
    code: 'already_checked_in', checkedInAt: typeof obj.checked_in_at === 'string' ? obj.checked_in_at : null,
    gate: typeof obj.gate === 'string' ? obj.gate : null, checkedInBy: typeof obj.checked_in_by === 'string' ? obj.checked_in_by : null,
  };
  const known: CheckInResult['code'][] = ['invalid', 'wrong_event', 'not_confirmed', 'refunded', 'event_not_live', 'cancelled_event', 'unauthorized'];
  const mapped = known.includes(code as CheckInResult['code']) ? code as CheckInErrorResult['code'] : 'invalid';
  return { code: mapped, payment: typeof obj.payment === 'string' ? obj.payment : undefined, message: typeof obj.message === 'string' ? obj.message : undefined };
}

export function normalizeOrderRef(input: string): string {
  return input.trim().replace(/^#/, '').toUpperCase();
}
export interface PerformCheckInInput { partyId: number; orderRef: string; gate?: string | null; }

export async function performCheckIn({ partyId, orderRef, gate }: PerformCheckInInput): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('staff_check_in', {
    p_party_id: partyId, p_order_ref: normalizeOrderRef(orderRef), p_gate: gate || undefined,
  });
  if (error) throw new Error(error.message);
  return toCheckInResult(data);
}

async function performOfflineCheckIn({ partyId, orderRef, gate }: PerformCheckInInput): Promise<CheckInResult> {
  const normalized = normalizeOrderRef(orderRef);
  const ticket = await getLocalTicket(partyId, normalized);
  if (!ticket) return { code: 'invalid', message: 'Ticket is not in this device’s downloaded event list.' };
  if (ticket.paymentStatus !== 'confirmed') return { code: 'not_confirmed', payment: ticket.paymentStatus };
  if (ticket.refundStatus !== 'none' || ticket.cancellationReason) return { code: 'refunded' };
  if (ticket.checkInStatus === 'checked_in') {
    return { code: 'already_checked_in', checkedInAt: ticket.checkedInAt, gate: ticket.checkedInGate, checkedInBy: null, offline: true };
  }
  const at = new Date().toISOString();
  await markLocalCheckedIn(partyId, normalized, at, gate ?? null);
  await queueScan({ scanId: makeScanId(partyId, normalized), eventId: partyId, orderRef: normalized, gate: gate ?? null, scannedAt: at, attempts: 0 });
  return {
    code: 'ok', orderId: '', orderRef: ticket.orderRef, partyId: ticket.partyId,
    guestEmail: ticket.guestEmail, quantity: ticket.quantity, ticketType: ticket.ticketType,
    checkedInAt: at, gate: gate ?? null, offline: true,
  };
}

export async function performHybridCheckIn(input: PerformCheckInInput): Promise<CheckInResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return performOfflineCheckIn(input);
  try { return await performCheckIn(input); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/network|offline|failed to fetch|fetch failed|timeout|abort|connection/i.test(message)) throw error;
    return performOfflineCheckIn(input);
  }
}

export interface SyncSummary { synced: number; conflicts: number; pending: number; }
export async function syncQueuedScans(eventId?: number): Promise<SyncSummary> {
  const queued = await getQueuedScans(eventId);
  let synced = 0; let conflicts = 0;
  for (const scan of queued) {
    try {
      const result = await performCheckIn({ partyId: scan.eventId, orderRef: scan.orderRef, gate: scan.gate });
      if (result.code === 'ok') { await removeQueuedScan(scan.scanId); synced += 1; }
      else if (result.code === 'already_checked_in') {
        await saveConflict({ ...scan, conflictAt: new Date().toISOString(), reason: 'already_checked_in' });
        await removeQueuedScan(scan.scanId); conflicts += 1;
      } else {
        await saveConflict({ ...scan, conflictAt: new Date().toISOString(), reason: 'rejected', lastError: result.code });
        await removeQueuedScan(scan.scanId); conflicts += 1;
      }
    } catch (error) {
      const retry: QueuedScan = { ...scan, attempts: scan.attempts + 1, lastError: error instanceof Error ? error.message : 'Network unavailable' };
      await queueScan(retry);
    }
  }
  return { synced, conflicts, pending: (await getQueuedScans(eventId)).length };
}

export function isAdmission(code: CheckInCode): boolean { return code === 'ok'; }
export type { Database };
