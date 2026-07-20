create table if not exists public.user_snapshots (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_snapshots enable row level security;

-- The serverless function uses the service-role key.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY in config.js or browser code.
