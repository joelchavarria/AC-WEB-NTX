-- Restrict writes to each store owner; public catalog images remain readable.
begin;
drop policy if exists "storage_authenticated_upload_store_images" on storage.objects;
create policy "storage_authenticated_upload_store_images" on storage.objects for insert to authenticated with check (bucket_id = 'store-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
drop policy if exists "storage_authenticated_update_store_images" on storage.objects;
create policy "storage_authenticated_update_store_images" on storage.objects for update to authenticated using (bucket_id = 'store-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid())) with check (bucket_id = 'store-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
drop policy if exists "storage_authenticated_delete_store_images" on storage.objects;
create policy "storage_authenticated_delete_store_images" on storage.objects for delete to authenticated using (bucket_id = 'store-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
drop policy if exists "storage_authenticated_upload_product_images" on storage.objects;
create policy "storage_authenticated_upload_product_images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
drop policy if exists "storage_authenticated_update_product_images" on storage.objects;
create policy "storage_authenticated_update_product_images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid())) with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
drop policy if exists "storage_authenticated_delete_product_images" on storage.objects;
create policy "storage_authenticated_delete_product_images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and (storage.foldername(name))[1] = 'stores' and exists (select 1 from public.stores s where s.id::text = (storage.foldername(name))[2] and s.owner_profile_id = auth.uid()));
-- Public checkout is server-mediated through the inventory RPC.
drop policy if exists "orders_public_insert" on public.orders;
create policy "orders_owner_insert" on public.orders for insert to authenticated
with check (public.is_store_owner(store_id));
drop policy if exists "order_items_public_insert" on public.order_items;
create policy "order_items_owner_insert" on public.order_items for insert to authenticated
with check (exists (select 1 from public.orders o where o.id = order_id and public.is_store_owner(o.store_id)));
commit;
