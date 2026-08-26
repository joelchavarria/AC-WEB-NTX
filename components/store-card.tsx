import Link from "next/link";
import type { Store } from "@/lib/supabase";

export function StoreCard({ store }: { store: Store }) {
  const totalProducts = store.products?.length ?? 0;

  return (
    <Link href={`/stores/${store.slug}`} className="card store-card stack">
      <div className="store-art" />
      <div className="stack">
        <div className="row">
          <span className="pill">{store.slug}</span>
          <span className="pill">{totalProducts} productos</span>
        </div>
        <h3>{store.name}</h3>
        <p className="muted">{store.store_json?.description ?? "Catalogo publico listo para comprar cuando quieras."}</p>
      </div>
      <div className="card-footer">
        <strong>Explorar tienda</strong>
        <span className="card-arrow">&rsaquo;</span>
      </div>
    </Link>
  );
}
