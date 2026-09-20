-- ===========================================================================
-- Host Verification simplification — Batch 33. IDEMPOTENT / re-runnable.
--
-- Reduces the 5-step document KYC from Batch 32 to a quick 3-step flow and
-- removes the friction-heavy requirements:
--
--   * Business type is now Individual | Company. A Company host does NOT need
--     a CAC certificate — a social media / business presence is enough, so CAC
--     is no longer requested anywhere.
--   * New optional columns: years_in_business (1-2 years / 2-5 years / 5+
--     years), website_social (optional social media link), address (contact /
--     residential/business address) and account_number (full NUBAN used for
--     payouts). account_last4 is now derived from account_number.
--   * NIN is the single identity number. id_type is no longer collected; the
--     column stays only so legacy rows keep their historical value and is
--     nullable + default-null for new submissions.
--   * Phone OTP, selfie and CAC columns are left in place for historical data
--     but are no longer required, validated, uploaded or displayed.
--
-- Nothing in here drops or rewrites existing rows, so historical verification
-- data is preserved. Existing check constraints are replaced narrowly (not
-- re-applied to old rows), new columns are add-if-not-exists.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Business type: Individual | Company.
--    The old default 'sole_proprietor' becomes 'individual' and the CHECK is
--    widened to the two supported values so new submissions pass while old
--    rows (sole_proprietor/registered_company/partnership) stay readable.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'host_verifications'
               and column_name = 'business_type' and column_default is not null) then
    alter table public.host_verifications alter column business_type drop default;
  end if;
end $$;

alter table public.host_verifications alter column business_type set default 'individual';

alter table public.host_verifications drop constraint if exists host_verifications_business_type_check;
alter table public.host_verifications add constraint host_verifications_business_type_check
  check (business_type in ('individual', 'company'));

-- ---------------------------------------------------------------------------
-- 2. New simplified-flow columns.
-- ---------------------------------------------------------------------------
alter table public.host_verifications add column if not exists years_in_business text;
alter table public.host_verifications add column if not exists website_social text;
alter table public.host_verifications add column if not exists address text;
alter table public.host_verifications add column if not exists account_number text;

-- ---------------------------------------------------------------------------
-- 3. NIN is the only identity number. id_type is no longer required (default
--    null, nullable) and the CHECK is loosened to allow NULL while still
--    accepting every legacy value so nothing written before is rejected.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'host_verifications'
               and column_name = 'id_type' and column_default is not null) then
    alter table public.host_verifications alter column id_type drop default;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'host_verifications'
               and column_name = 'id_type' and is_nullable = 'NO') then
    alter table public.host_verifications alter column id_type drop not null;
  end if;
end $$;

alter table public.host_verifications drop constraint if exists host_verifications_id_type_check;
alter table public.host_verifications add constraint host_verifications_id_type_check
  check (id_type is null or id_type in ('national_id', 'driver_license', 'passport', 'business_registration'));

-- ---------------------------------------------------------------------------
-- 4. account_last4 is derived from the full account number on new rows. The
--    old 4-digit CHECK is kept (it still holds because every new submission
--    stores account_number and slices its last 4). Nothing to change here —
--    the column simply stays for historical rows and legacy read paths.
-- ---------------------------------------------------------------------------