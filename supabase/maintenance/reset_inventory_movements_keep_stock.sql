-- Explicitly requested reset for Ondie 1.0: delete inventory movement history; preserve exact stock.
begin;
lock table public.inventory_movements in access exclusive mode;
lock table public.products in share mode;

create temporary table inventory_before_reset on commit drop as
select id, store_id, stock from public.products;

delete from public.inventory_movements;

do $$ begin
  if exists(
    (select id, store_id, stock from public.products
     except
     select id, store_id, stock from inventory_before_reset)
    union all
    (select id, store_id, stock from inventory_before_reset
     except
     select id, store_id, stock from public.products)
  ) then
    raise exception 'Inventario cambio: se revierte toda la limpieza.';
  end if;

  if exists(select 1 from public.inventory_movements) then
    raise exception 'La limpieza de movimientos no se completo: se revierte.';
  end if;
end $$;

select
  (select count(*) from public.inventory_movements) remaining_inventory_movements,
  (select count(*) from public.products) preserved_products,
  true inventory_unchanged;
commit;
