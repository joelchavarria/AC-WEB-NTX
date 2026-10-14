-- A product can appear more than once when each line selects a different variant.
create or replace function public.validate_inventory_items(p_store_id uuid, p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_count integer; v_distinct_products integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P4000', message = 'El carrito es inválido.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = 'P4000', message = 'El carrito debe contener entre 1 y 100 productos.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) i(id uuid, quantity integer, variant_options jsonb)
    where i.id is null or i.quantity is null or i.quantity < 1 or i.quantity > 999
  ) then
    raise exception using errcode = 'P4000', message = 'El carrito contiene cantidades inválidas.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) i(id uuid, quantity integer, variant_options jsonb)
    group by i.id, coalesce(i.variant_options, '{}'::jsonb)
    having count(*) > 1
  ) then
    raise exception using errcode = 'P4000', message = 'El carrito contiene cantidades inválidas o productos repetidos.';
  end if;
  select count(distinct i.id) into v_distinct_products
  from jsonb_to_recordset(p_items) i(id uuid);
  select count(distinct p.id) into v_count
  from public.products p
  join jsonb_to_recordset(p_items) i(id uuid) on i.id = p.id
  where p.store_id = p_store_id and p.is_active;
  if v_count <> v_distinct_products then
    raise exception using errcode = 'P4090', message = 'Uno de los productos ya no está disponible.';
  end if;
end $$;
revoke all on function public.validate_inventory_items(uuid, jsonb) from public, anon, authenticated;
