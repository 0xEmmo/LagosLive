-- Organizer contact details on each event so guests and admins can reach the
-- person behind an event directly (in addition to the social links already
-- stored on the row). Both are optional; the host's WhatsApp is already the
-- primary chat channel, and these add a plain phone + email fallback.
alter table public.parties
  add column if not exists organizer_phone text,
  add column if not exists organizer_email text;
