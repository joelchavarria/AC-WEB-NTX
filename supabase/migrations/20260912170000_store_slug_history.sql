create table if not exists public.store_slug_history (
  slug text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_store_slug_history_store on public.store_slug_history(store_id);
alter table public.store_slug_history enable row level security;
drop policy if exists "public_read_store_slug_history" on public.store_slug_history;
create policy "public_read_store_slug_history" on public.store_slug_history for select using (true);
