"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Bag, CaretRight, ForkKnife, Heart, House, MagnifyingGlass, Package, Palette, ShoppingCart, Sneaker, Sparkle, Storefront, TShirt, UserCircle } from "@phosphor-icons/react";
import { CartSummary } from "@/components/cart/cart-summary";
import type { Store } from "@/lib/supabase";

const categoryIcons: Record<string, typeof TShirt> = {
  "ropa y moda": TShirt,
  "ropa y accesorios": TShirt,
  calzado: Sneaker,
  zapateria: Sneaker,
  zapataeria: Sneaker,
  joyerias: Sparkle,
  joyeria: Sparkle,
  "belleza y cuidado": Sparkle,
  "hogar y decoracion": House,
  "comida y bebidas": ForkKnife,
  "arte y diseno": Palette,
};

function normalizeCategory(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MarketplaceHome({ stores, error }: { stores: Store[]; error: string }) {
  const [query, setQuery] = useState("");
  const [favorite, setFavorite] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const visibleStores = stores;
  const categories = useMemo(() => {
    const values = [...new Set(visibleStores.map((store) => store.category?.trim()).filter(Boolean))] as string[];
    return values.map((label) => {
      const normalized = normalizeCategory(label);
      return {
        label,
        normalized,
        icon: categoryIcons[normalized] ?? Storefront,
      };
    });
  }, [visibleStores]);
  const filteredStores = useMemo(() => {
    const search = query.trim().toLowerCase();
    return visibleStores.filter((store) => {
      const matchesCategory = selectedCategory ? normalizeCategory(store.category ?? "") === selectedCategory : true;
      const matchesSearch = search ? [store.name, store.category, store.description, store.store_json?.description].some((value) => value?.toLowerCase().includes(search)) : true;
      return matchesCategory && matchesSearch;
    });
  }, [query, selectedCategory, visibleStores]);

  return <main className="marketplace-page">
    <header className="market-header">
      <Link className="market-brand" href="/" aria-label="ONDIE, inicio"><Image src="/ondie-logo.svg" alt="ONDIE" width={176} height={58} priority /></Link>
      <label className="market-search"><MagnifyingGlass aria-hidden="true" /><input aria-label="Buscar productos o tiendas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos o tiendas..." /></label>
      <nav className="market-nav" aria-label="Navegación principal"><a href="#stores">Tiendas</a></nav>
      <div className="header-actions"><CartSummary /><Link href="/account" className="profile-button" aria-label="Mi cuenta"><UserCircle weight="bold" /></Link></div>
    </header>

    <div className="market-layout">
      <aside className="category-sidebar" id="categories">
        <p className="sidebar-title">Categorías</p>
        <div className="category-list">{categories.map(({ label, normalized, icon: Icon }) => <button key={label} type="button" className={selectedCategory === normalized ? "active" : ""} onClick={() => setSelectedCategory(normalized)}><Icon weight="duotone" /><span>{titleCase(label)}</span><CaretRight /></button>)}</div>
        <button className="all-categories" type="button" onClick={() => { setQuery(""); setSelectedCategory(""); }}>Ver todas <ArrowRight /></button>
        <div className="seller-card"><span><Bag weight="duotone" /></span><strong>Únete al colectivo</strong><p>Haz visible tu tienda y llega a más personas.</p><a href="mailto:hola@ondie.com">Quiero vender</a></div>
      </aside>

      <div className="market-content">
        <section className="market-hero" id="discover">
          <div className="hero-copy"><span className="hero-kicker"><Sparkle weight="fill" /> ONDIE · Colectivo de tiendas</span><h1>Tiendas con identidad,<br />productos con<br /><em>historia.</em></h1><p>Conoce qué vende cada negocio, explora sus catálogos y compra directamente a emprendedores de nuestra comunidad.</p><a href="#stores" className="lime-button">Conocer el colectivo <ArrowRight weight="bold" /></a></div>
          <div className="hero-visual" aria-hidden="true"><Image src="/assets/marketplace-hero-products-optimized.jpg" alt="" fill priority sizes="(max-width: 760px) 100vw, 48vw" /></div>
          <div className="hero-dots"><span /><span className="active" /><span /></div>
        </section>

        <section className="featured-section" id="stores">
          <div className="featured-head"><div><span className="section-kicker">NUESTRO COLECTIVO</span><h2>Tiendas en ONDIE</h2><p>Descubre negocios locales y conoce lo que cada uno tiene para ofrecerte.</p></div><span className="store-count">{filteredStores.length} {filteredStores.length === 1 ? "tienda" : "tiendas"}</span></div>
          {error ? <p className="data-note">No fue posible cargar las tiendas: {error}</p> : null}
          <div className="featured-grid">{filteredStores.slice(0, 4).map((store, index) => <article className={`featured-store store-tone-${index % 4}`} key={store.id}>
            <Link href={`/stores/${store.slug}`} className="store-visual" aria-label={`Visitar ${store.name}`}>{store.products?.[0]?.image ? <Image src={store.products[0].image} alt={store.products[0].name} fill sizes="(max-width: 760px) 100vw, 25vw" /> : null}<span className="store-badge">Tienda local</span></Link>
            <div className="store-info"><div className="store-avatar"><Storefront weight="fill" /></div><div><h3>{store.name}</h3><p>{store.category ?? "Tienda local"}</p></div><button type="button" onClick={() => setFavorite(favorite === store.id ? null : store.id)} aria-label="Guardar tienda" className={favorite === store.id ? "is-favorite" : ""}><Heart weight={favorite === store.id ? "fill" : "regular"} /></button></div>
            <p className="store-description">{store.description ?? store.store_json?.description ?? "Una tienda local con productos seleccionados para nuestra comunidad."}</p>
            <div className="store-footer"><span>{store.products?.[0]?.name ?? "Catálogo disponible"}</span><span>{store.products?.length ?? 0} productos</span></div>
          </article>)}</div>
          {filteredStores.length === 0 ? <div className="empty-stores"><MagnifyingGlass /><h3>{query ? "No encontramos coincidencias" : "Aún no hay tiendas publicadas"}</h3><p>{query ? "Prueba otra búsqueda o explora todas las categorías." : "Las tiendas activas aparecerán aquí automáticamente desde la base de datos."}</p>{query ? <button onClick={() => setQuery("")} type="button">Limpiar búsqueda</button> : null}</div> : null}
        </section>

        <section className="trust-strip"><div><Package weight="duotone" /><span><strong>Catálogos diversos</strong><small>Todo el colectivo en un solo lugar</small></span></div><div><ShoppingCart weight="duotone" /><span><strong>Compra directa</strong><small>Elige fácil y de forma segura</small></span></div><div><Storefront weight="duotone" /><span><strong>Impacto local</strong><small>Apoya negocios de tu comunidad</small></span></div></section>
      </div>
    </div>
  </main>;
}
