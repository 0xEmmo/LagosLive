import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  createSignedUploadUrl,
  VERIFICATION_DOCUMENT_FIELDS,
  type VerificationDocumentField,
} from '@/lib/host-verification';
import type { ServiceSupabase } from '@/lib/supabase/server';

// One-shot signed upload URL for a whitelisted document slot. The browser PUTs
// the file bytes straight to the returned url (upsert is already enabled, so a
// resubmission replaces the previous scan at the same object path).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { field?: unknown; fileName?: unknown; contentType?: unknown };
    const field = typeof body.field === 'string' ? body.field : '';
    const fileName = typeof body.fileName === 'string' ? body.fileName : '';
    const contentType = typeof body.contentType === 'string' && body.contentType ? body.contentType : 'image/jpeg';

    if (!VERIFICATION_DOCUMENT_FIELDS.includes(field as VerificationDocumentField)) {
      return NextResponse.json({ error: 'Invalid document field.' }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const service: ServiceSupabase = createServiceSupabase();
    const result = await createSignedUploadUrl(service, user.id, field as VerificationDocumentField, fileName, contentType);
    if (!result.ok || !result.url) {
      return NextResponse.json({ error: result.error ?? 'Could not prepare an upload.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, url: result.url, path: result.path });
  } catch {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}