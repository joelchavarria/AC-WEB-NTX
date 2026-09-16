# Ondie 1.0.0 — 16 septiembre 2026

Base compartida qynzrunfsflfppczghhj: migración de checkout/seguridad aplicada y pedidos limpiados. Se conservaron los 23 productos y cada cantidad de stock, verificados en la misma transacción. No se descontó ni se devolvió inventario.

Checkout: una transacción para todas las tiendas, stock bloqueado en orden determinista, precios de base de datos, envío configurado por la tienda e identificador de compra para reintentos. La última unidad solo se vende una vez. Los pedidos guardan las unidades realmente descontadas; cancelar, reactivar y editar respetan esa reserva. Se rechazan cantidades inválidas, productos repetidos y productos de otras tiendas.

Seguridad: RLS de pedidos/detalles/productos permanece activo; público sin permisos para crear pedidos directamente ni ejecutar el RPC de inventario. Edición de cantidades únicamente mediante RPC del propietario. Totales, tienda y reservas no pueden modificarse directamente desde el cliente. Endpoint con validación de origen, JSON limitado a 64 KiB, errores internos ocultos y límite persistente de 20 intentos por IP cada 5 minutos en Vercel. En otro alojamiento hay un límite compartido conservador hasta configurar un proxy confiable. Dos Edge Functions verifican la sesión con Auth; se mantuvo verificación JWT.

Verificación: PostgreSQL 17 aislado, ocho compras simultáneas de última unidad, ocho reintentos simultáneos, reversión de carrito de varias tiendas, cancelación/reactivación, edición, venta rápida sin descuento e aislamiento RLS. Endpoint con transportes simulados; TypeScript, build de Next y Deno check correctos. React Doctor: 90/100, una advertencia de complejidad preexistente.

Comandos: `npm run test:orders`; `npm run test:orders:db` con contenedor PostgreSQL desechable llamado `ondie-stock-test`. El segundo comando solo toca la base local `ondie_checkout_test`.

Migración duplicada en CA-APP/0017 y CA-WEB/20260916150000 para documentar la base compartida: aplicar solo una vez. Ya se ejecutó mediante Management API. El reset de pedidos está en supabase/maintenance, requiere solicitud explícita y verifica inventario antes de confirmar. No se reinició la numeración histórica.

Publicación web pendiente de iniciar sesión en Vercel. Código local marcado 1.0.0; las correcciones del endpoint/reintentos requieren publicar la web. La base de datos y Edge Functions ya están actualizadas; la web anterior sigue compatible con el RPC del servidor.

Limitaciones: pedidos pendientes reservan stock hasta su cancelación; no hay vencimiento automático. Para datos históricos sin una marca de reserva no puede inferirse con certeza si ventas rápidas descontaron inventario; el preflight encontró cero casos ambiguos y el reset autorizado dejó pedidos vacíos.

Referencias: [bloqueos de PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html), [permisos de funciones Supabase](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [cabeceras Vercel](https://vercel.com/docs/headers/request-headers).
