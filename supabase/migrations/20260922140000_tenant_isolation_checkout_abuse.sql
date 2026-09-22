-- Separate public catalog reads from authenticated owner reads and harden checkout abuse controls.
begin;

-- Authenticated store owners must not use their session to read another store's catalog.
-- The public storefront continues to work through the anon role.
drop policy if exists "products_select_public_or_owner" on public.products;
drop policy if exists products_read on public.products;
drop policy if exists products_anon_public_select on public.products;
drop policy if exists products_authenticated_owner_select on public.products;
create policy products_anon_public_select on public.products
  for select to anon using (public.is_public_store(store_id));
create policy products_authenticated_owner_select on public.products
  for select to authenticated using (public.is_store_owner(store_id));

drop policy if exists "product_images_select_public_or_owner" on public.product_images;
drop policy if exists product_images_read on public.product_images;
drop policy if exists product_images_anon_public_select on public.product_images;
drop policy if exists product_images_authenticated_owner_select on public.product_images;
create policy product_images_anon_public_select on public.product_images
  for select to anon using (exists (
    select 1
    from public.products p
    where p.id = product_id and public.is_public_store(p.store_id)
  ));
create policy product_images_authenticated_owner_select on public.product_images
  for select to authenticated using (exists (
    select 1
    from public.products p
    where p.id = product_id and public.is_store_owner(p.store_id)
  ));

-- Consume all dimensions atomically. A denied request does not increment any bucket.
create or replace function public.consume_checkout_rate_limits(p_client_keys text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_attempts integer;
  v_window_start timestamptz;
begin
  if p_client_keys is null
    or cardinality(p_client_keys) not between 1 and 32
    or exists (
      select 1 from unnest(p_client_keys) as keys(client_key)
      where client_key is null or length(client_key) <> 64
    ) then
    return false;
  end if;

  delete from public.checkout_rate_limits
  where window_start < now() - interval '1 hour';

  for v_key in
    select distinct client_key from unnest(p_client_keys) as keys(client_key)
  loop
    select attempts, window_start
      into v_attempts, v_window_start
      from public.checkout_rate_limits
      where client_key = v_key
      for update;

    if found
      and v_window_start >= now() - interval '5 minutes'
      and v_attempts >= 20 then
      return false;
    end if;
  end loop;

  for v_key in
    select distinct client_key from unnest(p_client_keys) as keys(client_key)
  loop
    insert into public.checkout_rate_limits as limits
      (client_key, window_start, attempts)
    values (v_key, now(), 1)
    on conflict (client_key) do update set
      window_start = case
        when limits.window_start < now() - interval '5 minutes' then now()
        else limits.window_start
      end,
      attempts = case
        when limits.window_start < now() - interval '5 minutes' then 1
        else least(limits.attempts + 1, 21)
      end;
  end loop;

  return true;
end;
$$;

revoke all on function public.consume_checkout_rate_limits(text[]) from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limits(text[]) to service_role;

-- Keep the original single-key function for existing scripts and integrations.
create or replace function public.consume_checkout_rate_limit(p_client_key text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.consume_checkout_rate_limits(array[p_client_key]);
$$;

revoke all on function public.consume_checkout_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text) to service_role;

-- Durable abuse signals for logs/alerts without storing raw IPs or device IDs.
create table if not exists public.checkout_security_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('rate_limited', 'honeypot', 'bot_verification_failed')),
  client_key text not null check (length(client_key) = 64),
  store_count smallint not null default 0 check (store_count between 0 and 20),
  created_at timestamptz not null default now()
);

alter table public.checkout_security_events enable row level security;
revoke all on public.checkout_security_events from public, anon, authenticated;
create index if not exists checkout_security_events_created_idx
  on public.checkout_security_events(created_at desc);

create or replace function public.record_checkout_security_event(
  p_event_type text,
  p_client_key text,
  p_store_count smallint default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.checkout_security_events(event_type, client_key, store_count)
  values (p_event_type, p_client_key, coalesce(p_store_count, 0));
end;
$$;

revoke all on function public.record_checkout_security_event(text, text, smallint)
  from public, anon, authenticated;
grant execute on function public.record_checkout_security_event(text, text, smallint)
  to service_role;

commit;
