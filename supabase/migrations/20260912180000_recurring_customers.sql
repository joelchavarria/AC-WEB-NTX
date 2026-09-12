create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id) on delete cascade,
  name text not null, phone text not null, address text, preferred_payment_method text,
  preferred_delivery_method text, notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(store_id, phone)
);
alter table public.orders add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists idx_customers_store_name on public.customers(store_id,name);
create index if not exists idx_orders_customer on public.orders(customer_id,created_at desc);
