"""Run concurrency/RLS regressions only in a disposable local Docker PostgreSQL.
Usage: python3 scripts/test-checkout-security.py
Requires the ondie-stock-test container (postgres:17, no production credentials).
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT.parent / 'CA-APP'
DB = 'ondie_checkout_test'
CONTAINER = 'ondie-stock-test'

def command(*args, **kwargs):
    return subprocess.run(['docker', 'exec', '-i', CONTAINER, *args], text=True, capture_output=True, **kwargs)

def sql(query, ok=True):
    result = command('psql', '-U', 'postgres', '-d', DB, '-At', '-v', 'ON_ERROR_STOP=1', input=query)
    if ok and result.returncode: raise AssertionError(result.stderr)
    return result

def scalar(query):
    return sql(query).stdout.strip().splitlines()[-1]

def literal(value): return "'" + value.replace("'", "''") + "'"

def payload(product='10000000-0000-0000-0000-000000000001', quantity=1, store='00000000-0000-0000-0000-000000000001'):
    return {'customer': {'name': 'Cliente', 'phone': '88888888', 'address': 'Managua', 'reference': ''},
            'paymentMethod': 'cash', 'deliveryMethod': 'store_delivery',
            'groups': [{'storeId': store, 'deliveryOptionId': 'managua', 'items': [{'id': product, 'quantity': quantity}]}]}

def checkout(body, key=None):
    return sql("set role service_role; select public.create_checkout(%s,%s::jsonb);" %
               (literal(key or str(uuid.uuid4())),literal(json.dumps(body))), ok=False)

def reset(stock=1):
    sql('truncate public.stores cascade; truncate public.checkout_requests,public.checkout_rate_limits;')
    sql("""insert into public.stores(id,owner_profile_id,name,slug,store_json)
    values('00000000-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tienda A','a',
      '{"profile_settings":{"pickupEnabled":true,"deliveryMethods":[{"id":"managua","enabled":true,"fee":"70"}]}}'),
      ('00000000-0000-0000-0000-000000000002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Tienda B','b','{}');
    insert into public.products(id,store_id,name,price,stock,fulfillment_mode)
    values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Producto',100,%s,'inmediato'),
      ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Producto B',200,1,'inmediato');""" % stock)

def owner(query, identity='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ok=True):
    return sql("set role authenticated; set request.jwt.claim.sub=%s; %s" % (literal(identity), query),ok)

# Never connect to the linked Supabase project or read its credentials.
roles=command('psql','-U','postgres','-At','-v','ON_ERROR_STOP=1',input="""do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;""")
assert roles.returncode==0,roles.stderr
command('dropdb','-U','postgres','--if-exists',DB)
result=command('createdb','-U','postgres',DB)
assert result.returncode==0,result.stderr
bootstrap='''create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
'''
base=(APP/'supabase/production/0001_ondie_full_schema.sql').read_text().split('insert into storage.buckets')[0]+'\ncommit;\n'
sql(bootstrap+base)
for name in ['0009_restore_inventory_on_cancel.sql','0010_high_priority_order_flows.sql','0013_recurring_customers.sql','0015_inventory_history_customer_codes.sql']:
    sql((APP/'supabase/migrations'/name).read_text())
sql('''grant usage on schema public to anon,authenticated,service_role;
grant all on all tables in schema public to anon,authenticated,service_role;
grant all on all sequences in schema public to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;''')
sql((ROOT/'supabase/migrations/20260916150000_atomic_checkout_security.sql').read_text())
sql("insert into auth.users(id,email) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a@test.local'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','b@test.local');")

reset()
with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:checkout(payload()),range(8)))
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
assert scalar('select stock from products where name=\'Producto\'')=='0'
assert scalar('select count(*) from orders')=='1'
assert scalar('select total from orders')=='170.00'
print('PASS: 8 simultaneous buyers / last unit: 1 order, stock 0, server shipping total')

reset(10)
key=str(uuid.uuid4())
with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(lambda _:checkout(payload(),key),range(8)))
assert all(r.returncode==0 for r in results),[r.stderr for r in results]
assert len(set(r.stdout for r in results))==1
assert scalar('select count(*) from orders')=='1'
assert scalar('select stock from products where name=\'Producto\'')=='9'
assert checkout(payload(quantity=2),key).returncode!=0
print('PASS: concurrent retries return the same order; changed payload rejected')

reset()
b=payload(); b['groups'].append(payload(quantity=2,product='10000000-0000-0000-0000-000000000002',store='00000000-0000-0000-0000-000000000002')['groups'][0])
assert checkout(b).returncode!=0
assert scalar('select count(*) from orders')=='0'
assert scalar('select stock from products where name=\'Producto\'')=='1'
assert scalar('select count(*) from checkout_requests')=='0'
print('PASS: failure in a second store rolls back all orders and stock')

reset(10)
for invalid in [0,-1,1000]: assert checkout(payload(quantity=invalid)).returncode!=0
b=payload();b['groups'][0]['items']*=2; assert checkout(b).returncode!=0
b=payload(product='10000000-0000-0000-0000-000000000002');assert checkout(b).returncode!=0
b=payload(); b['groups'][0]['deliveryOptionId']='fake';assert checkout(b).returncode!=0
assert scalar('select count(*) from orders')=='0'
print('PASS: invalid quantities, duplicate products, foreign store products and shipping rejected')

reset(2)
assert checkout(payload()).returncode==0
order=scalar('select id from orders')
owner("update orders set status='cancelled' where id=%s" % literal(order))
owner("update orders set status='cancelled' where id=%s" % literal(order))
assert scalar('select stock from products where name=\'Producto\'')=='2'
# A new buyer and order reactivation race for the last unit.
sql("update products set stock=1 where name='Producto'")
with ThreadPoolExecutor(max_workers=2) as pool:
    a=pool.submit(checkout,payload())
    b=pool.submit(owner,"update orders set status='new' where id=%s" % literal(order),ok=False)
    results=[a.result(),b.result()]
assert sum(r.returncode==0 for r in results)==1,[r.stderr for r in results]
assert scalar('select stock from products where name=\'Producto\'')=='0'
print('PASS: repeated cancel restores once; reactivation vs checkout cannot oversell')

reset(3)
assert checkout(payload()).returncode==0
order=scalar('select id from orders')
items=json.dumps([{'id':'10000000-0000-0000-0000-000000000001','quantity':2}])
owner('select replace_order_items(%s,%s::jsonb)'%(literal(order),literal(items)))
assert scalar('select stock from products where name=\'Producto\'')=='1'
assert scalar('select total from orders')=='270.00'
sql("update products set fulfillment_mode='encargo' where name='Producto'")
owner("update orders set status='cancelled' where id=%s"%literal(order))
assert scalar('select stock from products where name=\'Producto\'')=='3'
print('PASS: editing preserves inventory and totals; changed fulfillment mode does not lose reservation')

reset(3)
items=json.dumps([{'id':'10000000-0000-0000-0000-000000000001','quantity':2}])
owner("select register_quick_sale('00000000-0000-0000-0000-000000000001','cash',%s::jsonb,false,null)"%literal(items))
order=scalar('select id from orders')
owner('select replace_order_items(%s,%s::jsonb)'%(literal(order),literal(items)))
owner("update orders set status='cancelled' where id=%s"%literal(order))
owner("update orders set status='new' where id=%s"%literal(order))
assert scalar('select stock from products where name=\'Producto\'')=='3'
print('PASS: quick sale without inventory discount: edit/cancel/reactivate never invents stock')

reset(10)
assert checkout(payload()).returncode==0
order=scalar('select id from orders')
assert scalar("set role anon; select count(*) from orders")=='0'
assert scalar("set role anon; select count(*) from order_items")=='0'
assert scalar("set role authenticated; set request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; select count(*) from orders")=='0'
owner("update orders set status='cancelled' where id=%s"%literal(order),identity='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
assert scalar('select status from orders')=='new'
for role in ['anon','authenticated']:
    assert sql("set role %s; select create_checkout(%s,%s::jsonb)"%(role,literal(str(uuid.uuid4())),literal(json.dumps(payload()))),ok=False).returncode!=0
    assert sql("set role %s; insert into orders(store_id,customer_name) values('00000000-0000-0000-0000-000000000001','Forged')"%role,ok=False).returncode!=0
assert owner('update orders set total=1 where id=%s'%literal(order),ok=False).returncode!=0
assert owner('update orders set inventory_managed=false where id=%s'%literal(order),ok=False).returncode!=0
assert owner('delete from order_items where order_id=%s'%literal(order),ok=False).returncode!=0
assert owner('select replace_order_items(%s,%s::jsonb)'%(literal(order),literal(items)),identity='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ok=False).returncode!=0
assert sql('select * from checkout_requests',ok=False).returncode==0
assert sql('set role anon; select * from checkout_requests',ok=False).returncode!=0
print('PASS: RLS tenant isolation and grants deny forged orders, direct stock item edits and private checkout access')

key='a'*64
with ThreadPoolExecutor(max_workers=8) as pool:
    results=list(pool.map(lambda _:scalar("set role service_role; select consume_checkout_rate_limit('%s')"%key),range(25)))
assert results.count('t')==20 and results.count('f')==5,results
print('PASS: durable concurrent rate limit permits exactly 20 attempts / 5 minutes')
print('ALL CHECKOUT SECURITY TESTS PASSED')
