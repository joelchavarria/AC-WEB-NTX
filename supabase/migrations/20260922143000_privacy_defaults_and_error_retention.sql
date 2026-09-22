begin;

alter table public.store_bank_accounts
  alter column is_public set default false;

update public.stores
set store_json = jsonb_set(
  jsonb_set(
    coalesce(store_json, '{}'::jsonb),
    '{profile_settings,payments}',
    coalesce(
      (
        select jsonb_agg(payment - 'number')
        from jsonb_array_elements(
          case
            when jsonb_typeof(store_json #> '{profile_settings,payments}') = 'array'
              then store_json #> '{profile_settings,payments}'
            else '[]'::jsonb
          end
        ) payment
      ),
      '[]'::jsonb
    ),
    true
  ),
  '{paymentAccounts}',
  coalesce(
    (
      select jsonb_agg(account - 'accountNumber')
      from jsonb_array_elements(
        case
          when jsonb_typeof(store_json -> 'paymentAccounts') = 'array'
            then store_json -> 'paymentAccounts'
          else '[]'::jsonb
        end
      ) account
    ),
    '[]'::jsonb
  ),
  true
)
where store_json is not null;

create index if not exists idx_app_errors_created_at_desc
  on public.app_errors(created_at desc);

create or replace function public.purge_old_app_errors(p_retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if p_retention_days < 30 or p_retention_days > 365 then
    raise exception 'retention must be between 30 and 365 days';
  end if;

  delete from public.app_errors
  where created_at < now() - make_interval(days => p_retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_old_app_errors(integer) from public, anon, authenticated;
grant execute on function public.purge_old_app_errors(integer) to service_role;

commit;
