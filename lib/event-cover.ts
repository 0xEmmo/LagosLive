const COVER_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Build an immutable object path for one event-cover upload.
 * A fresh object URL on every replacement prevents browser/CDN/Next image
 * caches from continuing to serve the previous image at an overwritten URL.
 */
export function buildEventCoverObjectPath(partyId: number, contentType: string, uploadId: string): string {
  if (!Number.isSafeInteger(partyId) || partyId <= 0) {
    throw new Error('Event ID must be a positive safe integer.');
  }

  const extension = COVER_EXTENSION_BY_MIME[contentType];
  if (!extension) {
    throw new Error('Unsupported event cover image type.');
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new Error('Event cover upload ID must be a UUID.');
  }

  return `events/${partyId}/cover-${uploadId}.${extension}`;
}
