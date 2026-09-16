-- Explicitly requested reset for Ondie 1.0: delete orders; preserve exact stock.
begin;
lock table public.orders in access exclusive mode;
lock table public.products in share mode;
-- Refuse to reset if a new DELETE trigger could alter inventory.
do $$ begin
  if exists(select 1 from pg_trigger where tgrelid in ('public.orders'::regclass,'public.order_items'::regclass)
    and not tgisinternal and (tgtype & 8) <> 0) then
    raise exception 'Hay un trigger DELETE que debe revisarse antes de limpiar pedidos.';
  end if;
end $$;
create temporary table inventory_before_reset on commit drop as select id,store_id,stock from public.products;
-- Items and status history are removed by their existing ON DELETE CASCADE FKs.
delete from public.orders;
delete from public.checkout_requests;
delete from public.checkout_rate_limits;
do $$ begin
  if exists((select id,store_id,stock from public.products except select id,store_id,stock from inventory_before_reset)
    union all (select id,store_id,stock from inventory_before_reset except select id,store_id,stock from public.products)) then
    raise exception 'Inventario cambió: se revierte toda la limpieza.';
  end if;
  if exists(select 1 from public.orders) or exists(select 1 from public.order_items) or exists(select 1 from public.order_status_history) then
    raise exception 'La limpieza no se completó: se revierte.';
  end if;
end $$;
select (select count(*) from public.orders) remaining_orders,
  (select count(*) from public.order_items) remaining_items,
  (select count(*) from public.products) preserved_products, true inventory_unchanged;
commit;
