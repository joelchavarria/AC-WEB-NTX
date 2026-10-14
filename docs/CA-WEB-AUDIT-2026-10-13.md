# Auditoría de CA-WEB — 13 de octubre de 2026

## Alcance

Revisión del proyecto `/Users/jachavarria/CA-WEB` en las áreas de:

- funcionalidad pública: portada, tienda, carrito, cuenta y privacidad;
- UX/UI responsive y accesibilidad observable;
- seguridad de Next.js, API de checkout, Supabase/RLS y exposición de datos;
- dependencias, build, tipos, tests y calidad del repositorio.

En la prueba inicial no se generó ningún pedido. En la repetición autorizada con Joyería Rocha se registró el pedido de prueba `ORD-90`; el navegador no abrió WhatsApp ni envió el mensaje. No se verificó si algún webhook automático de Supabase notificó a la tienda al insertar el pedido.

## Evidencia visual

- [01 — portada desktop](./ca-web-audit-2026-10-13/01-home-desktop.png)
- [02 — cuenta](./ca-web-audit-2026-10-13/02-account.png)
- [03 — tienda pública](./ca-web-audit-2026-10-13/03-store-desktop.png)
- [04 — privacidad](./ca-web-audit-2026-10-13/04-privacy.png)

## Flujo revisado

1. Portada/marketplace — saludable: jerarquía clara, CTA visible, navegación y categorías accesibles.
2. Tienda pública — saludable con observaciones: buen encabezado, contacto por WhatsApp y catálogo; revisar el comportamiento del carrito y el recorte del catálogo en móvil.
3. Carrito — saludable en la repetición: el producto de Joyería Rocha persistió al navegar a `/cart`, se mostró agrupado por tienda y llegó con el subtotal correcto.
4. Checkout — saludable en la repetición: el producto persistió al entrar a `/checkout`, se registró `ORD-90` y el carrito quedó vacío después de la creación.
5. Cuenta — saludable: campos etiquetados, autocomplete de correo/contraseña y enlaces legales visibles.
6. Privacidad — saludable: contenido legible, estructura con headings y contacto visible.

## Hallazgos prioritarios

### Revisión posterior — El fallo del carrito no se reprodujo

En la primera prueba el producto `Got 2b mini` se agregó correctamente, pero el carrito apareció vacío en una navegación posterior. El usuario confirmó después que había borrado el carrito durante esas pruebas. En la repetición limpia con Joyería Rocha, el producto `Aretes de Corazón` persistió correctamente en `/cart` y `/checkout`, el pedido `ORD-90` se registró y una pestaña nueva confirmó el carrito vacío después de la creación.

Conclusión actual: no hay evidencia suficiente para mantener este punto como P1 confirmado. Aun así, conviene conservar una prueba automatizada de persistencia entre tienda → carrito → checkout y evitar que el contexto exclusivo borre silenciosamente el carrito.

### P1 — Dependencias con vulnerabilidades conocidas

`npm audit` reportó 3 vulnerabilidades: 2 altas (`sharp@0.35.4`, `source-map-js@1.2.1`) y 1 moderada (`next@15.5.26`). El dry-run confirma actualizaciones patch disponibles: `sharp@0.35.5`, `source-map-js@1.2.2` y `next@15.5.27`. No ejecuté la actualización automática.

Recomendación: actualizar en una rama, ejecutar build/tests y revisar el lockfile antes de desplegar.

### P1 — La CSP actual no protege realmente contra scripts no autorizados

`next.config.js:10` solo define `frame-ancestors`, `object-src` y `base-uri`; no define `default-src`, `script-src`, `connect-src`, `img-src` ni `style-src`. Eso deja el navegador sin una política restrictiva para scripts y conexiones. El uso actual de JSON-LD escapa `<`, lo cual es positivo, pero no sustituye una CSP completa.

Recomendación: definir una CSP por entorno con nonces/hashes compatibles con Next.js, Supabase, Vercel Analytics/Speed Insights y los hosts de imágenes; probarla primero con `Content-Security-Policy-Report-Only`.

### P2 — Rate limit de reportes de error solo en memoria

`app/api/error-reports/route.ts:8` usa un `Map` local para limitar envíos. En Vercel, distintas instancias pueden tener mapas distintos, por lo que el límite de 15 segundos se puede evadir distribuyendo solicitudes.

Recomendación: mover el límite a un mecanismo compartido (RPC/tabla de Supabase, KV o servicio equivalente) y aplicar límites por IP hash, sesión opcional y tamaño.

### P2 — Datos de tienda potencialmente sensibles se publican directamente

`lib/store-api.ts:6-7` incluye `address` y `whatsapp_phone` en la selección pública; la tienda muestra la dirección en `components/stores/storefront-client.tsx:393-395`. Puede ser correcto para puntos de retiro, pero debe confirmarse que las tiendas entienden que esos datos son públicos.

Recomendación: separar `public_address`/`pickup_address` de datos internos y exponer solo el campo que el propietario marque como público.

### P2 — CTA de vendedores usa un correo distinto al contacto legal

La portada enlaza “Quiero vender” a `hola@ondie.com` (`components/page/marketplace-home.tsx:96`), mientras que privacidad usa `ondie.app.ni@gmail.com`. Verificar que el primer buzón existe y está monitoreado; si no, el CTA está roto.

### P2 — Copia en español sin acentos en el flujo de cuenta

La pantalla usa “Inicia sesion”, “Correo electronico”, “Contrasena”, “Minimo” y mensajes equivalentes (`components/page/auth/account-auth-client.tsx:16-28`, `:112`). Afecta el acabado visual y la pronunciación de lectores de pantalla.

### P2 — README contiene texto ajeno a documentación

`README.md:123-127` contiene instrucciones conversacionales y un bloque `<tool_call>` fuera del contexto del documento. No es código ejecutable, pero contamina la documentación pública y puede confundir a colaboradores o automatizaciones.

## Fortalezas confirmadas

- `npm run build` pasa compilación, tipos y generación de 12 rutas.
- `npx tsc --noEmit` pasa.
- `npm run test:orders` pasa validación de origen, límite de body, idempotencia, payload canónico, rate limit y sanitización de errores SQL.
- `npm run test:whatsapp` pasa normalización de números y routing de tienda.
- Hay headers base útiles: `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS.
- El endpoint de órdenes ignora precios/imágenes enviados por el cliente y delega el checkout canónico en una RPC privilegiada.
- Las migraciones recientes muestran RLS por tienda, revocación de funciones sensibles y `search_path` explícito en funciones `security definer`.
- Los formularios observados tienen labels, `autocomplete`, estados de botón y enlaces legales.

## Calidad y evidencia faltante

- `npm run lint` no es automatizable actualmente: `next lint` abre el asistente de configuración porque no hay configuración ESLint lista. No elegí una configuración nueva para no modificar el repositorio durante el escaneo.
- No ejecuté `scripts/test-checkout-security.py` porque crea órdenes en una base de datos de prueba y pediste no hacer pedidos.
- No ejecuté `npm run test:tenant` porque requiere dos cuentas reales de staging, fixtures y autorización explícita para writes.
- Codex Security Cloud no pudo lanzar/listar un scan remoto porque no hay conexión GitHub configurada en el workspace.
- No se validaron despliegue productivo, cookies en dominio real, configuración de Vercel, secretos del entorno ni pruebas autenticadas con cuentas reales.

## Orden recomendado de corrección

1. Mantener una prueba automatizada de persistencia del carrito entre tienda → carrito → checkout.
2. Actualizar dependencias vulnerables y repetir build/tests.
3. Diseñar una CSP efectiva para producción.
4. Reemplazar el rate limit en memoria del endpoint de reportes.
5. Confirmar qué dirección/contacto son públicos y corregir el correo de “Quiero vender”.
6. Añadir ESLint no interactivo y limpiar el README.
7. Repetir aislamiento tenant/RLS en staging desechable, sin usar datos productivos.
