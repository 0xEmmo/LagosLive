-- The seed's "Fri, Jul 4 / Sat, Jul 5 / Sun, Jul 6" weekday labels only match
-- real calendar days in 2025, not 2026 (used in migration 00005's initial
-- backfill) — that mismatch made the new generated is_weekend column disagree
-- with the original demo's isWeekend values for the Friday rows.
update public.parties set
  starts_at = case id
    when 1 then '2025-07-05 22:00:00+01'::timestamptz
    when 2 then '2025-07-04 20:00:00+01'::timestamptz
    when 3 then '2025-07-05 16:00:00+01'::timestamptz
    when 4 then '2025-07-06 19:00:00+01'::timestamptz
    when 5 then '2025-07-05 21:00:00+01'::timestamptz
    when 6 then '2025-07-04 21:00:00+01'::timestamptz
    when 7 then '2025-07-05 23:00:00+01'::timestamptz
    when 8 then '2025-07-05 20:00:00+01'::timestamptz
    when 9 then '2025-07-06 15:00:00+01'::timestamptz
    when 10 then '2025-07-06 14:00:00+01'::timestamptz
    when 11 then '2025-07-04 20:00:00+01'::timestamptz
    when 12 then '2025-07-04 23:00:00+01'::timestamptz
    when 13 then '2025-07-05 18:00:00+01'::timestamptz
    when 14 then '2025-07-06 12:00:00+01'::timestamptz
    when 15 then '2025-07-04 21:00:00+01'::timestamptz
    when 16 then '2025-07-04 22:00:00+01'::timestamptz
    when 17 then '2025-07-05 20:00:00+01'::timestamptz
    when 18 then '2025-07-05 18:00:00+01'::timestamptz
    when 19 then '2025-07-05 23:00:00+01'::timestamptz
    when 20 then '2025-07-06 18:00:00+01'::timestamptz
    when 21 then '2025-07-05 17:00:00+01'::timestamptz
    when 22 then '2025-07-05 22:00:00+01'::timestamptz
  end,
  ends_at = case id
    when 1 then '2025-07-06 04:00:00+01'::timestamptz
    when 2 then '2025-07-05 02:00:00+01'::timestamptz
    when 3 then '2025-07-06 00:00:00+01'::timestamptz
    when 4 then '2025-07-06 23:00:00+01'::timestamptz
    when 5 then '2025-07-06 05:00:00+01'::timestamptz
    when 6 then '2025-07-05 03:00:00+01'::timestamptz
    when 7 then '2025-07-06 06:00:00+01'::timestamptz
    when 8 then '2025-07-06 00:00:00+01'::timestamptz
    when 9 then '2025-07-06 22:00:00+01'::timestamptz
    when 10 then '2025-07-06 20:00:00+01'::timestamptz
    when 11 then '2025-07-05 02:00:00+01'::timestamptz
    when 12 then '2025-07-05 05:00:00+01'::timestamptz
    when 13 then '2025-07-06 02:00:00+01'::timestamptz
    when 14 then '2025-07-06 20:00:00+01'::timestamptz
    when 15 then '2025-07-05 03:00:00+01'::timestamptz
    when 16 then '2025-07-05 06:00:00+01'::timestamptz
    when 17 then '2025-07-06 04:00:00+01'::timestamptz
    when 18 then '2025-07-05 22:00:00+01'::timestamptz
    when 19 then '2025-07-06 06:00:00+01'::timestamptz
    when 20 then '2025-07-06 23:00:00+01'::timestamptz
    when 21 then '2025-07-06 01:00:00+01'::timestamptz
    when 22 then '2025-07-06 06:00:00+01'::timestamptz
  end
where id between 1 and 22;
