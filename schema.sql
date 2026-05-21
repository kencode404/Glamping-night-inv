-- ============================================================
-- Rooftop Party 2026 — Supabase schema
-- ============================================================
-- Run this in your Supabase project's SQL Editor (or paste it
-- into a new query). The script is idempotent — safe to re-run
-- on an existing project; it won't drop data.
-- ============================================================

-- The RSVPs table. One row per submission of the invitation form.
create table if not exists rsvps (
  id            bigserial    primary key,
  name          text         not null,
  phone         text         not null,
  food_allergy  text         not null default '',
  created_at    timestamptz  not null default now()
);

-- If the table already existed without the allergy column, add it.
alter table rsvps
  add column if not exists food_allergy text not null default '';

-- Newest-first listing index (used by the GET /api/rsvp query)
create index if not exists rsvps_created_at_desc_idx
  on rsvps (created_at desc);


-- ------------------------------------------------------------
-- Security note
-- ------------------------------------------------------------
-- The serverless function /api/rsvp authenticates with the
-- service_role key (set in Vercel as SUPABASE_SERVICE_ROLE_KEY),
-- which bypasses Row Level Security. We do NOT need to enable
-- RLS or write policies for this app: anonymous browsers never
-- talk to Supabase directly — all reads and writes flow through
-- the server. Phone numbers and allergies stay readable only by
-- you, via the Supabase Table Editor / SQL Editor.
-- ------------------------------------------------------------
