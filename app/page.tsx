export const revalidate = 0;

import { CartSummary } from "@/components/cart-summary";
import { StoreCard } from "@/components/store-card";
import { getStores } from "@/lib/store-api";
import type { Store } from "@/lib/supabase";

export default async function HomePage() {
  let stores: Store[] = [];
  let error = "";

  try {
    stores = await getStores();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "No se pudieron cargar las tiendas.";
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark">CA</div>
            <div>
              <div className="pill">CA Marketplace</div>
            </div>
          </div>
          <CartSummary />
        </div>

        <section className="hero hero-grid">
          <div className="stack">
            <span className="eyebrow">Marketplace premium multi-store</span>
            <h1>Descubre tiendas con una experiencia de compra elegante y directa.</h1>
            <p className="muted">
              Explora catalogos sin iniciar sesion, agrega productos al carrito y autentica al cliente solo cuando vaya a cerrar la compra.
            </p>
            <div className="row">
              <a href="#stores" className="button">Explorar tiendas</a>
              <a href="/checkout" className="button secondary">Ir al checkout</a>
            </div>
          </div>

          <div className="hero-panel stack">
            <div className="stats">
              <div className="stat stack">
                <strong>{stores.length}</strong>
                <span className="muted">tiendas visibles</span>
              </div>
              <div className="stat stack">
                <strong>Publico</strong>
                <span className="muted">sin login inicial</span>
              </div>
              <div className="stat stack">
                <strong>Seguro</strong>
                <span className="muted">login al comprar</span>
              </div>
            </div>
            <div className="card stack">
              <span className="eyebrow">Seleccion curada</span>
              <h3>Tiendas que se sienten como marca, no como un listado generico.</h3>
              <p className="muted">Diseño sobrio, foco en conversión y navegación simple para catálogos multi-tienda.</p>
            </div>
          </div>
        </section>

        {error ? <p className="card">Error al leer `stores`: {error}</p> : null}

        <div className="section-head" id="stores">
          <div className="stack">
            <span className="eyebrow">Tiendas</span>
            <h2>Explora por marca</h2>
          </div>
          <p className="muted">Cada tienda puede tener su propio catalogo, y un mismo usuario puede comprar o vender.</p>
        </div>

        <section className="grid">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </section>
      </div>
    </main>
  );
}
