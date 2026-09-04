"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle, Heart, MagnifyingGlass, MapPin, Package, ShareNetwork, ShieldCheck, SlidersHorizontal, SortAscending, Storefront, Truck, UserCircle, WhatsappLogo } from "@phosphor-icons/react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CartSummary } from "@/components/cart/cart-summary";
import type { Store } from "@/lib/supabase";
import { toWhatsAppNumber } from "@/lib/whatsapp";

export function StorefrontClient({ store, exclusive = false }: { store: Store; exclusive?: boolean }) {
  const products = store.products ?? [];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [favorites, setFavorites] = useState<string[]>([]);
  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    const result = search ? products.filter((product) => [product.name, product.description].some((value) => value?.toLowerCase().includes(search))) : [...products];
    if (sort === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort === "stock") result.sort((a, b) => b.stock - a.stock);
    return result;
  }, [products, query, sort]);
  const whatsappNumber = toWhatsAppNumber(store.whatsapp_phone);
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;
  const coverImage = products.find((product) => product.image)?.image;

  return <main className={`storefront-page${exclusive ? " storefront-page--exclusive" : ""}`}>
    {exclusive ? (
      <header className="exclusive-storefront-header">
        <strong>{store.name}</strong>
        <label className="storefront-search"><MagnifyingGlass /><input aria-label="Buscar en esta tienda" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar en ${store.name}...`} /></label>
        <CartSummary />
      </header>
    ) : <header className="storefront-header">
      <Link href="/" className="storefront-brand"><Image src="/ondie-logo.svg" alt="ONDIE" width={176} height={58} priority /></Link>
      <label className="storefront-search"><MagnifyingGlass /><input aria-label="Buscar en esta tienda" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar en ${store.name}...`} /></label>
      <nav><Link href="/">Tiendas</Link><a href="#products">Productos</a><a href="#information">Información</a></nav>
      <div className="storefront-actions"><CartSummary /><Link href="/account" aria-label="Mi cuenta"><UserCircle weight="bold" /></Link></div>
    </header>}
    <div className="storefront-shell">
      {!exclusive ? <div className="store-breadcrumb"><Link href="/">Inicio</Link><span>/</span><Link href="/">Tiendas</Link><span>/</span><strong>{store.name}</strong></div> : null}
      <section className="store-cover">
        {coverImage ? <Image src={coverImage} alt="" fill priority sizes="100vw" /> : null}<div className="store-cover-shade" />
        <div className="store-identity"><div className="store-monogram"><Storefront weight="duotone" /></div><div><span className="verified"><CheckCircle weight="fill" /> Tienda verificada</span><h1>{store.name}</h1><p>{store.category ?? "Tienda local"}</p></div></div>
        <div className="store-cover-meta"><span><Truck weight="duotone" /> Envíos coordinados</span><span><ShieldCheck weight="duotone" /> Compra protegida</span>{store.address ? <span><MapPin weight="duotone" /> {store.address}</span> : null}</div>
        <div className="store-cover-actions"><button type="button"><ShareNetwork /> Compartir</button>{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer"><WhatsappLogo weight="fill" /> Contactar por WhatsApp</a> : null}</div>
      </section>
      <div className="store-tabs"><a href="#products" className="active">Productos</a><a href="#information">Información</a><a href="#policies">Políticas</a></div>
      <div className="store-catalog-layout" id="products">
        <aside className="catalog-sidebar"><div className="catalog-filter"><h3>Categorías</h3><button className="active" type="button"><Package weight="duotone" /> Todos los productos <span>{products.length}</span></button>{store.category ? <button type="button"><Storefront weight="duotone" /> {store.category}<span>{products.length}</span></button> : null}</div><div className="catalog-filter" id="information"><h3>Sobre esta tienda</h3><p>{store.description ?? store.store_json?.description ?? "Catálogo local disponible en ONDIE."}</p>{store.address ? <span className="store-detail"><MapPin /> {store.address}</span> : null}</div><div className="catalog-filter trust-filter" id="policies"><h3>Compra con confianza</h3><span><ShieldCheck /> Datos protegidos</span><span><Truck /> Entrega coordinada</span><span><WhatsappLogo /> Atención directa</span></div></aside>
        <section className="catalog-main"><div className="catalog-heading"><div><span>CATÁLOGO</span><h2>Productos de {store.name}</h2><p>{visibleProducts.length} {visibleProducts.length === 1 ? "producto" : "productos"} disponibles</p></div><label className="catalog-sort"><SortAscending /><select aria-label="Ordenar productos" value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Destacados</option><option value="price-low">Menor precio</option><option value="price-high">Mayor precio</option><option value="stock">Más disponibles</option></select></label></div>
          {visibleProducts.length ? <div className="store-products-grid">{visibleProducts.map((product) => <article className="store-product-card" key={product.id}><div className="store-product-image">{product.image ? <Image src={product.image} alt={product.name} fill sizes="(max-width: 760px) 50vw, 25vw" /> : <div className="product-image-fallback"><Package weight="duotone" /></div>}<button type="button" onClick={() => setFavorites((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} aria-label="Guardar producto" className={favorites.includes(product.id) ? "favorite" : ""}><Heart weight={favorites.includes(product.id) ? "fill" : "regular"} /></button></div><div className="store-product-copy"><span className="product-store-name">{store.name}</span><h3>{product.name}</h3><p>{product.description ?? "Producto de catálogo"}</p><div className="product-price-row"><strong>C$ {product.price.toLocaleString("es-NI")}</strong><span className={product.stock > 2 ? "in-stock" : "low-stock"}>{product.stock > 2 ? "En stock" : "Últimas unidades"}</span></div><AddToCartButton product={product} storeId={store.id} storeName={store.name} storeSlug={store.slug} /></div></article>)}</div> : <div className="catalog-empty"><SlidersHorizontal /><h3>No encontramos productos</h3><p>Prueba con otra búsqueda.</p><button type="button" onClick={() => setQuery("")}>Limpiar búsqueda</button></div>}
        </section>
      </div>
      <section className="store-benefits"><div><Truck weight="duotone" /><span><strong>Envíos coordinados</strong><small>Recibe tu pedido donde estés</small></span></div><div><WhatsappLogo weight="duotone" /><span><strong>Atención rápida</strong><small>Habla directamente con el negocio</small></span></div><div><ShieldCheck weight="duotone" /><span><strong>Compra segura</strong><small>Tu pedido queda protegido</small></span></div></section>
      <Link href="/cart" className="mobile-cart-link">Ver carrito <ArrowRight /></Link>
    </div>
  </main>;
}
