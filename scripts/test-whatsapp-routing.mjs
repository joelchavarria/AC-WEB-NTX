import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function loadTypeScript(path, imports = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, exports);
  return exports;
}

const { toWhatsAppNumber, whatsAppMessageUrl } = loadTypeScript("../lib/whatsapp.ts");
assert.equal(toWhatsAppNumber("8888-8888"), "50588888888");
assert.equal(toWhatsAppNumber("+505 8888 8888"), "50588888888");
assert.equal(toWhatsAppNumber("+(505) 8888 8888"), "50588888888");
assert.equal(toWhatsAppNumber("00505 8888 8888"), "50588888888");
assert.equal(toWhatsAppNumber("123"), "");
assert.equal(toWhatsAppNumber("+506 8888 8888"), "");
assert.equal(toWhatsAppNumber("+505 8888 888"), "");
assert.equal(toWhatsAppNumber("+505 8888 88888"), "");
assert.equal(toWhatsAppNumber(null), "");
assert.equal(whatsAppMessageUrl(null, "Pedido ORD-1"), null);
assert.equal(whatsAppMessageUrl("123", "Pedido ORD-1"), null);
assert.equal(whatsAppMessageUrl("+506 8888 8888", "Pedido ORD-1"), null);

const store = {
  id: "store-1",
  name: "Tienda prueba",
  slug: "tienda-prueba",
  whatsapp_phone: "+505 8888 8888",
  store_json: null,
};
const selections = [];
const supabase = {
  from(table) {
    const result = () => ({
      data: table === "stores" ? store : [],
      error: null,
    });
    const query = {
      select(columns) {
        selections.push({ table, columns });
        return this;
      },
      eq() { return this; },
      in() { return this; },
      order() { return Promise.resolve({ ...result(), data: table === "stores" ? [store] : [] }); },
      maybeSingle() { return Promise.resolve(result()); },
      then(resolve, reject) {
        return Promise.resolve({ ...result(), data: table === "stores" ? [store] : [] }).then(resolve, reject);
      },
    };
    return query;
  },
};
const { getStores, getStoreBySlug } = loadTypeScript("../lib/store-api.ts", {
  "@/lib/supabase": { supabase },
  "@/lib/store-slug": { normalizeStoreSlug: (value) => value },
  "@/lib/product-availability": { normalizeFulfillmentMode: (value) => value },
});

const stores = await getStores();
assert.equal(stores[0].whatsapp_phone, store.whatsapp_phone);
const detail = await getStoreBySlug(store.slug);
assert.equal(detail.whatsapp_phone, store.whatsapp_phone);
assert.ok(
  selections.filter(({ table }) => table === "stores").every(({ columns }) =>
    columns.split(",").map((column) => column.trim()).includes("whatsapp_phone")
  ),
);

const link = new URL(whatsAppMessageUrl(stores[0].whatsapp_phone, "Pedido ORD-1"));
assert.equal(link.pathname, "/50588888888");
assert.equal(link.searchParams.get("text"), "Pedido ORD-1");
console.log("PASS: tienda pública, checkout y enlace de WhatsApp usan el número configurado");
