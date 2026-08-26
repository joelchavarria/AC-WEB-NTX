# CA-WEB

Marketplace web con Next.js, Supabase y despliegue listo para Vercel.

## Flujo

- Home publica que lee `stores`
- Pagina publica por tienda en `/stores/[slug]`
- Carrito local en navegador
- Login solo al entrar a `checkout`

## Variables

Crear `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://cgfknfvshndoktxxdwxz.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
```

## Deploy en Vercel

1. Importa el repo `joelchavarria/AC-WEB-NTX` en Vercel.
2. Framework detectado: `Next.js`.
3. Define estas variables en Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

El proyecto incluye:

- `vercel.json`
- `@vercel/analytics`
- `@vercel/speed-insights`
- `app/loading.tsx` para mejor carga inicial
- `next/font` con `Inter`
- metadata base para produccion

## Estructura esperada en Supabase

Tabla `stores`:

- `id uuid`
- `owner_profile_id uuid`
- `name text`
- `slug text`
- `store_json jsonb`

Tabla `products`:

- `id uuid`
- `store_id uuid`
- `name text`
- `description text`
- `price numeric`
- `stock int`
- `fulfillment_mode text`
- `is_active boolean`

`store_json` puede guardar branding o descripcion. Los productos reales se leen desde `products`.

Ejemplo de `store_json`:

```json
{
  "description": "Moda y accesorios",
  "products": [
    {
      "id": "prod-1",
      "name": "Bolso",
      "price": 25,
      "description": "Bolso negro"
    }
  ]
}
```

## Separacion recomendada

- Un solo `auth.users.id` por persona
- El duenio se detecta por `stores.owner_profile_id = auth.uid()`
- La compra se habilita a cualquier usuario autenticado
- Un mismo usuario puede comprar y tambien ser duenio de tienda
