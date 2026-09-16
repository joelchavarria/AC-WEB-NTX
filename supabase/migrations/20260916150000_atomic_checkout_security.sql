-- Atomic checkout, retry protection and explicit inventory reservations.
-- Apply after 0016; duplicated in CA-WEB for the shared database. Apply only once.
begin;
revoke create on schema public from public, anon, authenticated;
-- Trigger routines should never be exposed as API-callable operations.
do $$
declare v_signature regprocedure;
begin
  for v_signature in select p.oid::regprocedure from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('handle_new_user','link_order_customer','log_product_stock_movement','remember_previous_store_slug') loop
    execute format('revoke all on function %s from public, anon, authenticated',v_signature);
    execute format('alter function %s set search_path = public, pg_temp',v_signature);
  end loop;
end $$;
do $$ begin
  if to_regprocedure('public.can_manage_storage_object(text,text)') is not null then
    revoke execute on function public.can_manage_storage_object(text,text) from public,anon;
    grant execute on function public.can_manage_storage_object(text,text) to authenticated;
  end if;
end $$;
alter table public.orders add column if not exists inventory_managed boolean not null default true;
alter table public.order_items add column if not exists inventory_quantity integer not null default 0 check (inventory_quantity >= 0 and inventory_quantity <= quantity);
-- Historical quick sales without an inventory flag cannot be inferred reliably.
update public.orders set inventory_managed = false where notes ilike '%sin descontar inventario%';
update public.order_items i set inventory_quantity = i.quantity
from public.products p, public.orders o
where p.id = i.product_id and o.id = i.order_id and o.inventory_managed and p.fulfillment_mode = 'inmediato';
alter table public.products add constraint products_nonnegative_inventory check (stock >= 0) not valid;
alter table public.products validate constraint products_nonnegative_inventory;

-- RLS stays enabled even if a baseline used different policy names.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.products enable row level security;
revoke insert, update, delete, truncate on public.orders, public.order_items, public.order_status_history from anon;
revoke insert, update, delete, truncate on public.orders from authenticated;
grant update (customer_name, customer_phone, delivery_address, delivery_reference, payment_method, notes, status, updated_at) on public.orders to authenticated;
revoke insert, update, delete, truncate on public.order_items from authenticated;
drop policy if exists orders_public_insert on public.orders;
drop policy if exists order_items_public_insert on public.order_items;

create or replace function public.validate_inventory_items(p_store_id uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P4000', message = 'El carrito es inválido.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = 'P4000', message = 'El carrito debe contener entre 1 y 100 productos.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_items) i(id uuid, quantity integer)
    where i.id is null or i.quantity is null or i.quantity < 1 or i.quantity > 999)
    or (select count(distinct i.id) from jsonb_to_recordset(p_items) i(id uuid)) <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P4000', message = 'El carrito contiene cantidades inválidas o productos repetidos.';
  end if;
  select count(*) into v_count from public.products p
  join jsonb_to_recordset(p_items) i(id uuid) on i.id=p.id
  where p.store_id=p_store_id and p.is_active;
  if v_count <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P4090', message = 'Uno de los productos ya no está disponible.';
  end if;
end $$;
revoke all on function public.validate_inventory_items(uuid,jsonb) from public, anon, authenticated;

-- Create a storefront order and reserve immediate inventory atomically.
create or replace function public.create_store_order_with_inventory(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_reference text,
  p_payment_method text,
  p_items jsonb
)
returns table (id uuid, order_number bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric(12, 2);
  v_requested_count integer;
  v_product_count integer;
begin
  if not exists (select 1 from public.stores where stores.id = p_store_id and is_active) then
    raise exception 'La tienda ya no está disponible.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as item(id uuid, quantity integer)
    where item.id is null or item.quantity is null or item.quantity < 1
  ) then
    raise exception 'El carrito contiene cantidades inválidas.';
  end if;

  select count(*) into v_requested_count
  from jsonb_to_recordset(p_items) as item(id uuid, quantity integer);

  -- Lock products in a deterministic order so concurrent checkouts cannot oversell.
  perform product.id
  from public.products as product
  join jsonb_to_recordset(p_items) as item(id uuid, quantity integer) on item.id = product.id
  where product.store_id = p_store_id
  order by product.id
  for update;

  perform public.validate_inventory_items(p_store_id, p_items);

  select count(*) into v_product_count
  from public.products as product
  join jsonb_to_recordset(p_items) as item(id uuid, quantity integer) on item.id = product.id
  where product.store_id = p_store_id and product.is_active;

  if v_product_count <> v_requested_count then
    raise exception 'Uno de los productos ya no está disponible.';
  end if;

  if exists (
    select 1
    from public.products as product
    join jsonb_to_recordset(p_items) as item(id uuid, quantity integer) on item.id = product.id
    where product.store_id = p_store_id
      and product.fulfillment_mode = 'inmediato'
      and product.stock < item.quantity
  ) then
    raise exception using errcode = 'P4090', message = 'No hay suficientes existencias para completar el pedido.';
  end if;

  select sum(product.price * item.quantity) into v_subtotal
  from public.products as product
  join jsonb_to_recordset(p_items) as item(id uuid, quantity integer) on item.id = product.id
  where product.store_id = p_store_id;

  insert into public.orders (
    store_id, customer_name, customer_phone, delivery_address,
    delivery_reference, payment_method, subtotal, total, status
  ) values (
    p_store_id, trim(p_customer_name), trim(p_customer_phone), trim(p_delivery_address),
    nullif(trim(p_delivery_reference), ''), trim(p_payment_method), v_subtotal, v_subtotal, 'new'
  ) returning orders.id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, product_id, product_name, product_description, product_image,
    unit_price, quantity, line_total, inventory_quantity
  )
  select
    v_order_id,
    product.id,
    product.name,
    product.description,
    image.image_url,
    product.price,
    item.quantity,
    product.price * item.quantity,
    case when product.fulfillment_mode = 'inmediato' then item.quantity else 0 end
  from public.products as product
  join jsonb_to_recordset(p_items) as item(id uuid, quantity integer) on item.id = product.id
  left join lateral (
    select product_images.image_url
    from public.product_images
    where product_images.product_id = product.id
    order by product_images.sort_order, product_images.created_at
    limit 1
  ) as image on true
  where product.store_id = p_store_id;

  update public.products as product
  set stock = product.stock - item.quantity,
      updated_at = now()
  from jsonb_to_recordset(p_items) as item(id uuid, quantity integer)
  where product.id = item.id
    and product.store_id = p_store_id
    and product.fulfillment_mode = 'inmediato';

  insert into public.order_status_history (order_id, status)
  values (v_order_id, 'new');

  return query select v_order_id, v_order_number;
end;
$$;

revoke all on function public.create_store_order_with_inventory(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_store_order_with_inventory(uuid, text, text, text, text, text, jsonb) to service_role;

create or replace function public.register_quick_sale(p_store_id uuid,p_payment_method text,p_items jsonb,p_discount_inventory boolean default true,p_customer_id uuid default null)
returns table(id uuid,order_number bigint,total numeric) language plpgsql security definer set search_path=public, pg_temp as $$
declare v_order_id uuid; v_number bigint; v_total numeric(12,2); v_customer customers%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.stores s where s.id=p_store_id and s.owner_profile_id=auth.uid()) then raise exception 'No autorizado.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecciona al menos un producto.'; end if;
  if p_customer_id is not null then
    select c.* into v_customer from public.customers c where c.id=p_customer_id and c.store_id=p_store_id;
    if not found then raise exception 'Cliente no encontrado.'; end if;
  end if;
  perform p.id from products p join jsonb_to_recordset(p_items) i(id uuid,quantity int) on i.id=p.id where p.store_id=p_store_id order by p.id for update;
  perform public.validate_inventory_items(p_store_id, p_items);
  if exists(select 1 from jsonb_to_recordset(p_items) i(id uuid,quantity int) where i.quantity is null or i.quantity<1) then raise exception 'Cantidad inválida.'; end if;
  if p_discount_inventory and exists(select 1 from products p join jsonb_to_recordset(p_items) i(id uuid,quantity int) on i.id=p.id where p.store_id=p_store_id and p.fulfillment_mode='inmediato' and p.stock<i.quantity) then raise exception 'No hay suficientes existencias.'; end if;
  select sum(p.price*i.quantity) into v_total from products p join jsonb_to_recordset(p_items) i(id uuid,quantity int) on i.id=p.id where p.store_id=p_store_id;
  insert into orders(store_id,customer_id,customer_name,customer_phone,delivery_address,payment_method,subtotal,total,status,notes,delivery_method,inventory_managed)
  values(p_store_id,p_customer_id,coalesce(v_customer.name,'Venta rápida'),v_customer.phone,coalesce(v_customer.address,'Feria / Local / Presencial'),p_payment_method,v_total,v_total,'completed',case when p_discount_inventory then 'Venta rápida presencial' else 'Venta rápida presencial · sin descontar inventario' end,'pickup',coalesce(p_discount_inventory,false)) returning orders.id,orders.order_number into v_order_id,v_number;
  insert into order_items(order_id,product_id,product_name,product_description,product_image,unit_price,quantity,line_total,inventory_quantity)
  select v_order_id,p.id,p.name,p.description,img.image_url,p.price,i.quantity,p.price*i.quantity,case when p_discount_inventory and p.fulfillment_mode='inmediato' then i.quantity else 0 end from products p join jsonb_to_recordset(p_items)i(id uuid,quantity int)on i.id=p.id left join lateral(select image_url from product_images where product_id=p.id order by sort_order,created_at limit 1)img on true where p.store_id=p_store_id;
  if p_discount_inventory then update products p set stock=p.stock-i.quantity,updated_at=now() from jsonb_to_recordset(p_items)i(id uuid,quantity int) where p.id=i.id and p.store_id=p_store_id and p.fulfillment_mode='inmediato'; end if;
  insert into order_status_history(order_id,status) values(v_order_id,'completed'); return query select v_order_id,v_number,v_total;
end $$;
grant execute on function public.register_quick_sale(uuid,text,jsonb,boolean,uuid) to authenticated;

revoke all on function public.register_quick_sale(uuid,text,jsonb,boolean,uuid) from public, anon;

create or replace function public.sync_order_inventory_on_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.status = 'cancelled') = (old.status = 'cancelled') then return new; end if;
  -- The order row is already locked by UPDATE. Lock every product before checking.
  perform p.id from public.products p join public.order_items i on i.product_id=p.id
  where i.order_id=new.id and i.inventory_quantity>0 order by p.id for update of p;
  if new.status = 'cancelled' then
    update public.products p set stock=p.stock+i.quantity, updated_at=now()
    from (select product_id,sum(inventory_quantity)::integer quantity from public.order_items
      where order_id=new.id group by product_id) i where p.id=i.product_id;
  else
    if exists(select 1 from public.products p join
      (select product_id,sum(inventory_quantity) quantity from public.order_items where order_id=new.id group by product_id) i
      on p.id=i.product_id where p.stock<i.quantity) then
      raise exception using errcode='P4090', message='No hay existencias suficientes para reactivar este pedido.';
    end if;
    update public.products p set stock=p.stock-i.quantity,updated_at=now()
    from (select product_id,sum(inventory_quantity)::integer quantity from public.order_items
      where order_id=new.id group by product_id) i where p.id=i.product_id;
  end if;
  return new;
end $$;
revoke all on function public.sync_order_inventory_on_status_change() from public, anon, authenticated;

create or replace function public.replace_order_items(p_order_id uuid,p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_store_id uuid; v_status text; v_managed boolean; v_subtotal numeric(12,2);
begin
  select o.store_id,o.status,o.inventory_managed into v_store_id,v_status,v_managed
  from public.orders o join public.stores s on s.id=o.store_id
  where o.id=p_order_id and s.owner_profile_id=auth.uid() for update of o;
  if v_store_id is null then raise exception 'Pedido no encontrado.'; end if;
  if v_status='cancelled' then raise exception 'Reactiva el pedido antes de editar sus productos.'; end if;
  -- Lock the union of old and new products before restoring any inventory.
  perform p.id from public.products p where p.store_id=v_store_id and (
    p.id in (select product_id from public.order_items where order_id=p_order_id)
    or p.id in (select i.id from jsonb_to_recordset(p_items) i(id uuid))) order by p.id for update of p;
  perform public.validate_inventory_items(v_store_id,p_items);
  update public.products p set stock=p.stock+i.quantity,updated_at=now()
  from (select product_id,sum(inventory_quantity)::integer quantity from public.order_items
    where order_id=p_order_id group by product_id) i where p.id=i.product_id and i.quantity>0;
  if v_managed and exists(select 1 from public.products p join jsonb_to_recordset(p_items) i(id uuid,quantity integer)
    on p.id=i.id where p.store_id=v_store_id and p.fulfillment_mode='inmediato' and p.stock<i.quantity) then
    raise exception using errcode='P4090',message='No hay suficientes existencias para actualizar el pedido.';
  end if;
  delete from public.order_items where order_id=p_order_id;
  insert into public.order_items(order_id,product_id,product_name,product_description,product_image,unit_price,quantity,line_total,inventory_quantity)
  select p_order_id,p.id,p.name,p.description,img.image_url,p.price,i.quantity,p.price*i.quantity,
    case when v_managed and p.fulfillment_mode='inmediato' then i.quantity else 0 end
  from public.products p join jsonb_to_recordset(p_items) i(id uuid,quantity integer) on i.id=p.id
  left join lateral(select image_url from public.product_images where product_id=p.id order by sort_order,created_at limit 1) img on true
  where p.store_id=v_store_id;
  update public.products p set stock=p.stock-i.inventory_quantity,updated_at=now()
    from public.order_items i where i.order_id=p_order_id and p.id=i.product_id and i.inventory_quantity>0;
  select sum(line_total) into v_subtotal from public.order_items where order_id=p_order_id;
  update public.orders set subtotal=v_subtotal,total=v_subtotal+shipping_fee,updated_at=now() where id=p_order_id;
end $$;
revoke all on function public.replace_order_items(uuid,jsonb) from public, anon;
grant execute on function public.replace_order_items(uuid,jsonb) to authenticated;

create table public.checkout_requests (
  request_id uuid primary key,
  payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.checkout_requests enable row level security;
revoke all on public.checkout_requests from public,anon,authenticated;

-- Durable limits across server instances; keys are HMACs generated only by the server.
create table public.checkout_rate_limits (
  client_key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.checkout_rate_limits enable row level security;
revoke all on public.checkout_rate_limits from public,anon,authenticated;
create or replace function public.consume_checkout_rate_limit(p_client_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_attempts integer;
begin
  if p_client_key is null or length(p_client_key)<>64 then return false; end if;
  delete from public.checkout_rate_limits where window_start<now()-interval '1 hour';
  insert into public.checkout_rate_limits as r(client_key,window_start,attempts) values(p_client_key,now(),1)
  on conflict(client_key) do update set
    window_start=case when r.window_start<now()-interval '5 minutes' then now() else r.window_start end,
    attempts=case when r.window_start<now()-interval '5 minutes' then 1 else least(r.attempts+1,21) end
  returning attempts into v_attempts;
  return v_attempts<=20;
end $$;
revoke all on function public.consume_checkout_rate_limit(text) from public,anon,authenticated;
grant execute on function public.consume_checkout_rate_limit(text) to service_role;

create or replace function public.create_checkout(p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.checkout_requests%rowtype; v_group jsonb; v_store public.stores%rowtype;
  v_settings jsonb; v_method jsonb; v_fee numeric(12,2); v_order record; v_result jsonb:='[]'::jsonb;
begin
  if p_request_id is null or p_payload is null or coalesce(jsonb_typeof(p_payload->'groups'),'null')<>'array'
    or jsonb_array_length(p_payload->'groups') not between 1 and 20
    or coalesce(p_payload->>'deliveryMethod','') not in ('pickup','own_delivery','store_delivery')
    or coalesce(p_payload->>'paymentMethod','') not in ('cash','transfer')
    or coalesce(length(trim(p_payload#>>'{customer,name}')),0) not between 1 and 150
    or coalesce(length(trim(p_payload#>>'{customer,phone}')),0) not between 1 and 30
    or coalesce(length(p_payload#>>'{customer,address}'),0)>1000
    or coalesce(length(p_payload#>>'{customer,reference}'),0)>1000 then
    raise exception using errcode='P4000',message='Datos del pedido inválidos.';
  end if;
  if (select count(distinct g->>'storeId') from jsonb_array_elements(p_payload->'groups') g)
    <>jsonb_array_length(p_payload->'groups') then
    raise exception using errcode='P4000',message='El carrito contiene tiendas repetidas.';
  end if;
  insert into public.checkout_requests(request_id,payload) values(p_request_id,p_payload) on conflict do nothing;
  select * into v_request from public.checkout_requests where request_id=p_request_id for update;
  if v_request.payload<>p_payload then
    raise exception using errcode='P4090',message='Este intento de compra ya tiene otros datos. Revisa el carrito.';
  end if;
  if v_request.result is not null then return v_request.result; end if;

  -- Global lock order across all stores/products avoids deadlocks for multi-store carts.
  perform s.id from public.stores s where s.id in
    (select (g->>'storeId')::uuid from jsonb_array_elements(p_payload->'groups') g)
    order by s.id for share of s;
  perform p.id from public.products p where p.id in
    (select (i->>'id')::uuid from jsonb_array_elements(p_payload->'groups') g,
      jsonb_array_elements(g->'items') i) order by p.id for update of p;
  for v_group in select g from jsonb_array_elements(p_payload->'groups') g order by g->>'storeId' loop
    select * into v_store from public.stores where id=(v_group->>'storeId')::uuid and is_active;
    if not found then raise exception using errcode='P4090',message='La tienda ya no está disponible.'; end if;
    v_settings:=coalesce(v_store.store_json->'profile_settings','{}'::jsonb);
    v_fee:=0;
    if p_payload->>'deliveryMethod'='pickup' and not coalesce((v_settings->>'pickupEnabled')::boolean,false) then
      raise exception using errcode='P4000',message='La tienda no ofrece retiro en local.';
    end if;
    if p_payload->>'paymentMethod'='cash' and not coalesce((v_settings->>'cashEnabled')::boolean,true) then
      raise exception using errcode='P4000',message='La tienda no acepta efectivo.';
    end if;
    if p_payload->>'deliveryMethod'='store_delivery' then
      if coalesce(trim(p_payload#>>'{customer,address}'),'')='' then
        raise exception using errcode='P4000',message='Completa la dirección de entrega.';
      end if;
      if jsonb_typeof(v_settings->'deliveryMethods')='array' and jsonb_array_length(v_settings->'deliveryMethods')>0 then
        select m into v_method from jsonb_array_elements(v_settings->'deliveryMethods') m
          where (m->>'enabled')::boolean and m->>'id'=v_group->>'deliveryOptionId' limit 1;
        if not found then raise exception using errcode='P4000',message='El método de envío ya no está disponible.'; end if;
        v_fee:=coalesce(nullif(v_method->>'fee','')::numeric,0);
      else
        v_fee:=coalesce(nullif(v_settings->>'managuaFee','')::numeric,0);
      end if;
      if v_fee<0 then raise exception 'Configuración de envío inválida.'; end if;
    end if;
    select * into v_order from public.create_store_order_with_inventory(
      v_store.id,p_payload#>>'{customer,name}',p_payload#>>'{customer,phone}',
      coalesce(p_payload#>>'{customer,address}',''),coalesce(p_payload#>>'{customer,reference}',''),
      p_payload->>'paymentMethod',v_group->'items');
    update public.orders set delivery_method=p_payload->>'deliveryMethod',shipping_fee=v_fee,total=subtotal+v_fee where id=v_order.id;
    update public.customers set preferred_delivery_method=p_payload->>'deliveryMethod'
      where id=(select customer_id from public.orders where id=v_order.id);
    v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_order.id,'orderNumber',v_order.order_number,'storeId',v_store.id));
  end loop;
  update public.checkout_requests set result=v_result where request_id=p_request_id;
  return v_result;
end $$;
revoke all on function public.create_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_checkout(uuid,jsonb) to service_role;
commit;
