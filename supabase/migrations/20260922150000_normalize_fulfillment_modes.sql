begin;

-- Older web records used `posterior`; keep one canonical value shared with
-- the mobile app so zero stock never means both "on demand" and "sold out".
update public.products
set fulfillment_mode = 'encargo', updated_at = now()
where lower(trim(fulfillment_mode)) <> 'inmediato';

alter table public.products
  drop constraint if exists products_fulfillment_mode_allowed;

alter table public.products
  add constraint products_fulfillment_mode_allowed
  check (fulfillment_mode in ('inmediato', 'encargo')) not valid;

alter table public.products
  validate constraint products_fulfillment_mode_allowed;

commit;
