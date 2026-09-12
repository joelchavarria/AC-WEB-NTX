alter table public.orders add column if not exists delivery_method text not null default 'store_delivery';
alter table public.orders add column if not exists shipping_fee numeric(12,2) not null default 0 check (shipping_fee >= 0);
