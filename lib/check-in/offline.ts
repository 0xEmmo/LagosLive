export interface OfflineTicket {
  orderRef: string;
  partyId: number;
  ticketType: string;
  quantity: number;
  paymentStatus: string;
  refundStatus: string;
  cancellationReason: string | null;
  checkInStatus: string;
  checkedInAt: string | null;
  checkedInGate: string | null;
  guestEmail: string | null;
}

export interface OfflineManifest {
  eventId: number;
  eventTitle: string;
  downloadedAt: string;
  expiresAt: string;
  tickets: OfflineTicket[];
}

export interface QueuedScan {
  scanId: string;
  eventId: number;
  orderRef: string;
  gate: string | null;
  scannedAt: string;
  attempts: number;
  lastError?: string;
}

export interface OfflineConflict extends QueuedScan {
  conflictAt: string;
  reason: 'already_checked_in' | 'rejected';
}

const DB_NAME = 'lagos-live-check-in';
const DB_VERSION = 1;
const MANIFESTS = 'manifests';
const QUEUE = 'queue';
const CONFLICTS = 'conflicts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('Offline storage is not available on this device.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) db.createObjectStore(MANIFESTS, { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'scanId' });
      if (!db.objectStoreNames.contains(CONFLICTS)) db.createObjectStore(CONFLICTS, { keyPath: 'scanId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
  });
}

export async function saveManifest(manifest: OfflineManifest): Promise<void> {
  const db = await openDb();
  try {
    await requestResult(db.transaction(MANIFESTS, 'readwrite').objectStore(MANIFESTS).put(manifest));
  } finally {
    db.close();
  }
}

export async function getManifest(eventId: number): Promise<OfflineManifest | null> {
  const db = await openDb();
  try {
    return (await requestResult(db.transaction(MANIFESTS, 'readonly').objectStore(MANIFESTS).get(eventId))) ?? null;
  } finally {
    db.close();
  }
}

export async function markLocalCheckedIn(eventId: number, orderRef: string, at: string, gate: string | null): Promise<void> {
  const manifest = await getManifest(eventId);
  if (!manifest) return;
  const ticket = manifest.tickets.find((item) => item.orderRef === orderRef);
  if (!ticket) return;
  ticket.checkInStatus = 'checked_in';
  ticket.checkedInAt = at;
  ticket.checkedInGate = gate;
  await saveManifest(manifest);
}

export async function getLocalTicket(eventId: number, orderRef: string): Promise<OfflineTicket | null> {
  const manifest = await getManifest(eventId);
  if (!manifest || new Date(manifest.expiresAt).getTime() < Date.now()) return null;
  return manifest.tickets.find((item) => item.orderRef === orderRef) ?? null;
}

export async function queueScan(scan: QueuedScan): Promise<void> {
  const db = await openDb();
  try {
    await requestResult(db.transaction(QUEUE, 'readwrite').objectStore(QUEUE).put(scan));
  } finally {
    db.close();
  }
}

export async function getQueuedScans(eventId?: number): Promise<QueuedScan[]> {
  const db = await openDb();
  try {
    const rows = await requestResult(db.transaction(QUEUE, 'readonly').objectStore(QUEUE).getAll());
    return (rows as QueuedScan[]).filter((row) => eventId == null || row.eventId === eventId);
  } finally {
    db.close();
  }
}

export async function removeQueuedScan(scanId: string): Promise<void> {
  const db = await openDb();
  try {
    await requestResult(db.transaction(QUEUE, 'readwrite').objectStore(QUEUE).delete(scanId));
  } finally {
    db.close();
  }
}

export async function saveConflict(conflict: OfflineConflict): Promise<void> {
  const db = await openDb();
  try {
    await requestResult(db.transaction(CONFLICTS, 'readwrite').objectStore(CONFLICTS).put(conflict));
  } finally {
    db.close();
  }
}

export async function getConflictCount(eventId?: number): Promise<number> {
  const db = await openDb();
  try {
    const rows = await requestResult(db.transaction(CONFLICTS, 'readonly').objectStore(CONFLICTS).getAll());
    return (rows as OfflineConflict[]).filter((row) => eventId == null || row.eventId === eventId).length;
  } finally {
    db.close();
  }
}

export function makeScanId(eventId: number, orderRef: string): string {
  return `${eventId}:${orderRef}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
