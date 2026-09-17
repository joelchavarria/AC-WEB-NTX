-- Push tokens for owner devices. Used by Edge Functions to notify store owners.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  device_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(profile_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_owner_select on public.push_tokens;
create policy push_tokens_owner_select on public.push_tokens
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists push_tokens_owner_insert on public.push_tokens;
create policy push_tokens_owner_insert on public.push_tokens
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists push_tokens_owner_update on public.push_tokens;
create policy push_tokens_owner_update on public.push_tokens
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists push_tokens_owner_delete on public.push_tokens;
create policy push_tokens_owner_delete on public.push_tokens
  for delete to authenticated using (profile_id = auth.uid());

create index if not exists push_tokens_profile_idx on public.push_tokens(profile_id);
