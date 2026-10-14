-- Carry customer requests from the storefront into the order notes visible in the app.
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
    or coalesce(length(p_payload#>>'{customer,reference}'),0)>1000
    or exists(select 1 from jsonb_array_elements(p_payload->'groups') g
      where coalesce(length(g->>'notes'),0)>250) then
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
    update public.orders
      set delivery_method=p_payload->>'deliveryMethod',
          shipping_fee=v_fee,
          total=subtotal+v_fee,
          notes=nullif(trim(coalesce(v_group->>'notes','')), '')
      where id=v_order.id;
    update public.customers set preferred_delivery_method=p_payload->>'deliveryMethod'
      where id=(select customer_id from public.orders where id=v_order.id);
    v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_order.id,'orderNumber',v_order.order_number,'storeId',v_store.id));
  end loop;
  update public.checkout_requests set result=v_result where request_id=p_request_id;
  return v_result;
end $$;
revoke all on function public.create_checkout(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_checkout(uuid,jsonb) to service_role;
