# CA-WEB

Marketplace web con Next.js, Supabase y despliegue en Vercel.

[Demo en vivo](https://acweb.devtester.lat)

## 📦 Flujo

- Home pública que lee `stores`
- Página pública por tienda en `/catalogo/[slug]`
- Carrito local en navegador
- Login solo al entrar a `checkout`
- Catálogo exclusivo por tienda (comparte link `/catalogo/[slug]`)

## ⚙️ Variables de entorno

Crear `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
```

**Nunca commits claves reales.** Usa variables de entorno en Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo para funciones server-side, nunca en cliente)

## 🚀 Deploy en Vercel

1. Importa el repositorio en Vercel
2. Framework detectado: `Next.js`
3. Agrega las variables en la sección **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo si es necesario para APIs server-side)
4. Deploy

Incluye:
- `vercel.json`
- `@vercel/analytics`
- `@vercel/speed-insights`
- `app/loading.tsx` para mejor carga inicial
- `next/font` con `Inter`
- metadata base para producción

## 📊 Estructura esperada en Supabase

**Tabla `stores`:**
- `id uuid` - Identificador único
- `name text` - Nombre de la tienda
- `slug text` - URL amigable (ej: `tienda-elaborados`)
- `store_json jsonb` - Configuración de branding y settings

**Tabla `products`:**
- `id uuid`
- `store_id uuid` - FK a stores
- `name text`
- `description text`
- `price numeric`
- `stock int`
- `fulfillment_mode text` - `inmediato` o `encargo`
- `is_active boolean`
- `created_at timestamp`

**`store_json`** contiene:
- `description` - Descripción de la tienda
- `accent` - Color acento para temas
- `profile_settings` - Configuración adicional (`brand_color`, `businessHours`, etc.)

Ejemplo de `store_json`:

```json
{
  "description": "Moda y accesorios",
  "accent": "#f59e0b",
  "profile_settings": {
    "brandColor": "#0f172a",
    "businessHours": [
      { "day": "lunes", "label": "Lunes", "open": true, "opensAt": "09:00", "closesAt": "18:00" }
    ]
  }
}
```

## 🔒 Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` nunca en variables `NEXT_PUBLIC_`
- Las APIs de órdenes están privatizadas (`/api/orders/route.ts`)
- Headers de seguridad en todas las respuestas API (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`)
- Validación de negocio en `lib/store-api.ts` (sanitized SELECT queries)

## 🛠️ Scripts útiles

```bash
npm run build     # Build de producción
npm run lint      # Linting
npm run dev       # Modo desarrollo
```

### Prueba de aislamiento entre tiendas

`npm run test:tenant` requiere un proyecto Supabase de staging y dos cuentas
reales de propietario. Configura `TENANT_A_EMAIL`, `TENANT_A_PASSWORD`,
`TENANT_B_EMAIL`, `TENANT_B_PASSWORD` y los IDs de fixtures B
(`TENANT_TEST_STORE_B_ID`, `TENANT_TEST_PRODUCT_B_ID`,
`TENANT_TEST_ORDER_B_ID`, `TENANT_TEST_ORDER_ITEM_B_ID`,
`TENANT_TEST_CUSTOMER_B_ID`, `TENANT_TEST_IMAGE_B_ID`,
`TENANT_TEST_PUSH_TOKEN_B_ID`), además de
`TENANT_TEST_ALLOW_WRITES=1`. El script valida lecturas, escrituras, funciones
privilegiadas y Realtime; solo debe ejecutarse contra datos de prueba.

## 📁 .gitignore

Incluye automáticamente:
- `.DS_Store`
- `tsconfig.tsbuildinfo`
- `node_modules/`
- `.env.local`
```

Now let me also check the git history and potentially fix any commit issues. The user mentioned "errores en los commits". Let me check the git log and see if there are any issues.Ahora voy a mejorar el README de GitHub y revisaré los commits. Veamos el historial:
<tool_call>
<function=bash>
<parameter=workdir>
/Users/jachavarria/CA-WEB
