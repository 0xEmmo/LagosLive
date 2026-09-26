-- Stop storing raw bank account numbers on the KYC row.
--
-- The host verification wizard used to ask for a 10-digit account number and a
-- typed account holder name, and wrote both to public.host_verifications. That
-- column is the problem: a full NUBAN is a permanent, reusable identifier for
-- someone's bank account, and it was kept in a table whose rows are visible to
-- every admin reviewing the verification queue.
--
-- Nothing needs it. Payouts have not read this column since 00038 - they use
-- host_bank_accounts, where Paystack has verified the number and LagosLive
-- holds a recipient_code instead of the digits. So the KYC copy was never a
-- source of truth, only a second, unverified one that an admin could mistake
-- for the verified thing.
--
-- The account holder name had the same problem for a different reason: it was
-- whatever the applicant typed. If it disagreed with the name Paystack holds,
-- the row recorded the typed one, which is the one least likely to be right.
--
-- So this migration:
--   1. scrubs any number already stored,
--   2. makes the column impossible to write again, in the database rather than
--      by convention, so a future caller cannot quietly reintroduce it,
--   3. lets account_holder be null, because a host can submit KYC before they
--      have added a verified account.
--
-- The column itself is kept rather than dropped so the admin queue's existing
-- reads keep working. It is now permanently empty.

-- ---------------------------------------------------------------------------
-- 1. Scrub what is already there
-- ---------------------------------------------------------------------------
-- account_last4 survives, so the queue can still show a host which account
-- their KYC referred to without holding the digits that identify it.
update public.host_verifications
   set account_number = null
 where account_number is not null;

-- ---------------------------------------------------------------------------
-- 2. Make it unwritable
-- ---------------------------------------------------------------------------
-- A trigger, not a revoked grant. Revoking a grant would only bind the roles
-- that had one; the service role writes this table and bypasses grants, which
-- is exactly the path that created the problem. A BEFORE trigger binds
-- everyone, and the comment below is what the next person reads when they
-- wonder why their insert came back with a null.
create or replace function public.block_raw_account_numbers()
returns trigger
language plpgsql
security invoker set search_path = public
as $$
begin
  -- Not an error. A caller that still sends the field is a caller running
  -- against an older build, and failing their KYC submission over a field we
  -- no longer keep would be a worse outcome than quietly dropping it. The
  -- verified account on host_bank_accounts is unaffected.
  new.account_number := null;
  return new;
end;
$$;

drop trigger if exists trg_block_raw_account_numbers on public.host_verifications;
create trigger trg_block_raw_account_numbers
  before insert or update on public.host_verifications
  for each row execute function public.block_raw_account_numbers();

-- ---------------------------------------------------------------------------
-- 3. The account columns become optional
-- ---------------------------------------------------------------------------
-- A host may submit KYC before adding a verified payout account - the payout
-- page's bank form is not gated behind verification, so the two steps are
-- independent and neither blocks the other. That means both account columns
-- have to tolerate being absent.
--
-- account_holder drops NOT NULL and holds the Paystack-verified name when there
-- is a verified account, null when there is not. Inventing a placeholder would
-- put a fake account holder name in front of an admin reviewing the queue,
-- which is worse than an honest blank.
--
-- account_last4 drops NOT NULL for the same reason. Its regex check is
-- unaffected: a check constraint passes on null, so this only permits absence,
-- it does not permit a malformed value.
--
-- The four-digit check is left in place deliberately. '0000' would satisfy
-- NOT NULL and mean nothing, and an admin would read it as an account number.
alter table public.host_verifications
  alter column account_holder drop not null;
alter table public.host_verifications
  alter column account_last4 drop not null;

-- ---------------------------------------------------------------------------
-- 4. Stop the form fields at the edge
-- ---------------------------------------------------------------------------
-- The verification wizard's account number and account holder inputs are
-- removed; the payout destination is set on /host/payouts, where Paystack
-- verifies it and only the last four digits are ever kept. The bank name is
-- still collected, as free text, because an admin reviewing a KYC application
-- reads it as context and it identifies nobody.
--
-- These are checked in submitHostVerification() and in both submit and
-- resubmit routes. The database trigger above is the backstop, not the primary
-- control: a caller that still sends the field should be told, not silently
-- tolerated.
comment on column public.host_verifications.account_number is
  'Always null. Raw account numbers are not stored: payouts use the Paystack-verified recipient_code on host_bank_accounts. Kept as a column so existing admin-queue reads do not break.';
comment on column public.host_verifications.account_holder is
  'The account name Paystack verified for host_bank_accounts, when one exists. Never the name the applicant typed.';
comment on column public.host_verifications.account_last4 is
  'Last four digits of the account the KYC referred to, for admin recognition only. Not sufficient to pay anyone.';
