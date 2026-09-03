create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  delivery_reference text,
  payment_method text not null,
  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  status text not null default 'nuevo',
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.orders add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists delivery_reference text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists subtotal numeric(12, 2) not null default 0;
alter table public.orders add column if not exists total numeric(12, 2) not null default 0;
alter table public.orders add column if not exists status text not null default 'nuevo';
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists created_at timestamptz not null default timezone('utc', now());

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  product_description text,
  product_image text,
  unit_price numeric(12, 2) not null,
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.order_status_history add column if not exists order_id uuid references public.orders(id) on delete cascade;
alter table public.order_status_history add column if not exists status text;
alter table public.order_status_history add column if not exists notes text;
alter table public.order_status_history add column if not exists created_at timestamptz not null default timezone('utc', now());

create index if not exists orders_store_id_created_at_idx on public.orders(store_id, created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_status_history_order_id_idx on public.order_status_history(order_id, created_at desc);
