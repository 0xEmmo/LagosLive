import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventCoverObjectPath } from '../../lib/event-cover.ts';

describe('event cover storage paths', () => {
  it('creates a different immutable public path for each replacement of the same event', () => {
    const first = buildEventCoverObjectPath(42, 'image/jpeg', '6f5c1f65-2c65-4d85-a44e-a152d0d4d5a4');
    const replacement = buildEventCoverObjectPath(42, 'image/jpeg', 'f88d75d0-20d0-4d9c-a7c0-88a4b3a1fb10');

    assert.notEqual(first, replacement);
    assert.equal(first, 'events/42/cover-6f5c1f65-2c65-4d85-a44e-a152d0d4d5a4.jpg');
    assert.equal(replacement, 'events/42/cover-f88d75d0-20d0-4d9c-a7c0-88a4b3a1fb10.jpg');
  });

  it('keeps each accepted image MIME type aligned with its object extension', () => {
    const uuid = '6f5c1f65-2c65-4d85-a44e-a152d0d4d5a4';
    assert.match(buildEventCoverObjectPath(7, 'image/jpeg', uuid), /\.jpg$/);
    assert.match(buildEventCoverObjectPath(7, 'image/png', uuid), /\.png$/);
    assert.match(buildEventCoverObjectPath(7, 'image/webp', uuid), /\.webp$/);
  });

  it('rejects invalid event IDs, MIME types, and upload IDs', () => {
    const uuid = '6f5c1f65-2c65-4d85-a44e-a152d0d4d5a4';
    assert.throws(() => buildEventCoverObjectPath(0, 'image/jpeg', uuid), /Event ID/);
    assert.throws(() => buildEventCoverObjectPath(7, 'image/gif', uuid), /Unsupported/);
    assert.throws(() => buildEventCoverObjectPath(7, 'image/jpeg', 'cover'), /UUID/);
  });
});
