// Execute the actual TypeScript route with isolated transport dependencies.
// Does not load .env or connect to production.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ts from 'typescript';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
delete process.env.VERCEL;
let calls = [];
let limit = true;
let failure = null;
const storeId='00000000-0000-0000-0000-000000000001';
const productId='10000000-0000-0000-0000-000000000001';
const body = { customer:{name:'Cliente',phone:'88888888',address:'Managua'},paymentMethod:'cash',deliveryMethod:'store_delivery',groups:[{storeId,deliveryOptionId:'managua',items:[{id:productId,quantity:1,price:0.01,name:'Forged'}]}] };
const source=fs.readFileSync(new URL('../app/api/orders/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function('require','exports',compiled)(name=>{
  if(name==='node:crypto')return crypto;
  if(name==='next/server')return {NextResponse:{json:(data,options)=>Response.json(data,options)}};
  if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='consume_checkout_rate_limit')return {data:limit,error:null};
    return {data:[{id:productId,orderNumber:1,storeId}],error:failure};
  }})};
  throw Error('Unexpected import '+name);
},exports);
function request(value=body, headers={}) {return new Request('https://ondie.test/api/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),...headers},body:typeof value==='string'?value:JSON.stringify(value)});}
assert.equal((await exports.POST(request(body,{'Idempotency-Key':'invalid'}))).status,400);
assert.equal((await exports.POST(request(body,{Origin:'https://attacker.test'}))).status,403);
assert.equal((await exports.POST(request(body,{'Sec-Fetch-Site':'cross-site'}))).status,403);
assert.equal((await exports.POST(request(body,{'Content-Type':'text/plain'}))).status,415);
assert.equal((await exports.POST(request('{broken'))).status,400);
assert.equal((await exports.POST(request('x'.repeat(65537)))).status,413);
const bad=structuredClone(body);bad.groups[0].items[0].quantity=-1;
assert.equal((await exports.POST(request(bad))).status,400);
assert.equal(calls.length,0,'Invalid requests must not call privileged database functions');
const response=await exports.POST(request());
assert.equal(response.status,200);
assert.equal(calls[1].name,'create_checkout');
assert.deepEqual(calls[1].args.p_payload.groups[0].items,[{id:productId,quantity:1}]);
assert.match(calls[0].args.p_client_key,/^[0-9a-f]{64}$/);
limit=false;assert.equal((await exports.POST(request())).status,429);
limit=true;failure={code:'P4090',message:'No hay suficientes existencias.'};assert.equal((await exports.POST(request())).status,409);
failure={code:'XX000',message:'private SQL secret detail'};
const previousError=console.error;console.error=()=>{};
const failed=await exports.POST(request());console.error=previousError;
assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes('secret'));
console.log('PASS: endpoint validation, origin, hard body limit, idempotency key, canonical payload, rate limiting and sanitized database errors');
