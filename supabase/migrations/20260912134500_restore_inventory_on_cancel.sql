-- Restore inventory exactly once when an order is cancelled, and reserve it again on reactivation.
create or replace function public.sync_order_inventory_on_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.products p
    set stock = p.stock + oi.quantity, updated_at = now()
    from public.order_items oi
    where oi.order_id = new.id and oi.product_id = p.id and p.fulfillment_mode = 'inmediato';
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    if exists (
      select 1 from public.order_items oi join public.products p on p.id = oi.product_id
      where oi.order_id = new.id and p.fulfillment_mode = 'inmediato' and p.stock < oi.quantity
    ) then
      raise exception 'No hay existencias suficientes para reactivar este pedido.';
    end if;
    update public.products p
    set stock = p.stock - oi.quantity, updated_at = now()
    from public.order_items oi
    where oi.order_id = new.id and oi.product_id = p.id and p.fulfillment_mode = 'inmediato';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_sync_inventory_on_status_change on public.orders;
create trigger orders_sync_inventory_on_status_change after update of status on public.orders
for each row execute function public.sync_order_inventory_on_status_change();
