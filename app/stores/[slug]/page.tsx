export const revalidate = 0;

import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { getStoreBySlug } from "@/lib/store-api";

export default async function StorePage({ params }: { params: { slug: string } }) {
  const store = await getStoreBySlug(params.slug);

  if (!store) {
    return (
      <main className="page">
        <div className="shell card stack">
          <h1>Tienda no encontrada</h1>
          <Link href="/" className="button secondary">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  const products = store.products ?? [];

  return (
    <main className="page">
      <div className="shell stack">
        <Link href="/" className="button secondary">
          Volver a tiendas
        </Link>

        <section className="hero split">
          <div className="stack">
            <span className="eyebrow">Storefront</span>
            <h1>{store.name}</h1>
            <p className="muted">{store.description ?? store.store_json?.description ?? "Catalogo disponible para navegar sin iniciar sesion."}</p>
            <div className="row">
              <span className="pill">{store.slug}</span>
              <span className="pill">Checkout con login</span>
              {store.category ? <span className="pill">{store.category}</span> : null}
            </div>
          </div>
          <div className="hero-panel stack">
            <span className="eyebrow">Compra simple</span>
            <h3>Explora, agrega al carrito y autentica solo al finalizar.</h3>
            <p className="muted">Ideal para catalogos compartibles, campañas y trafico frio desde redes sociales.</p>
          </div>
        </section>

        <div className="section-head">
          <div className="stack">
            <span className="eyebrow">Catalogo</span>
            <h2>Productos destacados</h2>
          </div>
          <Link href="/" className="button secondary">
            Volver al inicio
          </Link>
        </div>

        <section className="grid">
          {products.length === 0 ? (
            <div className="card">Esta tienda aun no tiene productos activos en `products`.</div>
          ) : (
            products.map((product) => (
              <article key={product.id} className="card product-card stack">
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    width={800}
                    height={600}
                    className="product-image"
                  />
                ) : (
                  <div className="product-art" />
                )}
                <div className="stack product-copy">
                  <h3>{product.name}</h3>
                  <p className="muted">{product.description ?? "Producto de catalogo"}</p>
                </div>
                <div className="row product-meta">
                  <span className="price">C$ {product.price}</span>
                  <span className="stock-badge">{product.stock ?? 0} disponibles</span>
                  <span className="pill">{product.fulfillment_mode ?? "inmediato"}</span>
                </div>
                <div className="card-footer">
                  <AddToCartButton product={product} storeId={store.id} storeName={store.name} />
                  <span className="card-arrow">&rsaquo;</span>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
