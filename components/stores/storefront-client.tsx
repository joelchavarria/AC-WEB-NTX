"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Heart,
  MagnifyingGlass,
  MapPin,
  Package,
  ShareNetwork,
  ShieldCheck,
  SlidersHorizontal,
  SortAscending,
  Storefront,
  Truck,
  UserCircle,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CartSummary } from "@/components/cart/cart-summary";
import {
  clearExclusiveStoreContext,
  writeExclusiveStoreContext,
} from "@/lib/cart";
import type { Store } from "@/lib/supabase";
import { toWhatsAppNumber } from "@/lib/whatsapp";

const DEFAULT_ACCENT = "#142fe3";
const gradientColorMap: Record<string, string> = {
  "gradient-0": "#3532FF",
  "gradient-1": "#FF6852",
  "gradient-2": "#8038ED",
  "gradient-3": "#19BE9C",
  "gradient-4": "#FF465D",
  "gradient-5": "#15162B",
};

function isProductNew(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs / (1000 * 60 * 60) < 24;
}

function getStoreAccent(store: Store) {
  const saved =
    store.brand_color ??
    store.store_json?.accent ??
    store.store_json?.profile_settings?.brandColor;
  if (typeof saved === "string" && gradientColorMap[saved])
    return gradientColorMap[saved];
  return typeof saved === "string" && /^#[0-9a-f]{6}$/i.test(saved)
    ? saved
    : DEFAULT_ACCENT;
}

const dayOrder = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function formatHour(hour: string): string {
  if (!hour) return "";
  const parts = hour.split(":");
  if (parts.length < 2) return hour;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  if (isNaN(h)) return hour;
  const suffix = h >= 12 ? "p.m." : "a.m.";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m} ${suffix}`;
}

function getTodayEntry(businessHours: Array<{ day: string; label: string; open: boolean; opensAt: string; closesAt: string }> | undefined) {
  if (!businessHours?.length) return null;
  const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const today = dayOrder[todayIdx];
  return businessHours.find((h) => h.label.toLowerCase() === today) ?? null;
}

function getHoursStatus(businessHours: Array<{ day: string; label: string; open: boolean; opensAt: string; closesAt: string }> | undefined) {
  if (!businessHours?.length) return "Sin horario";
  const todayEntry = getTodayEntry(businessHours);
  if (!todayEntry) return "Sin horario configurado";
  return todayEntry.open
    ? `Abierto hasta ${formatHour(todayEntry.closesAt)}`
    : "Cerrado";
}



export function StorefrontClient({
  store,
  exclusive = false,
}: {
  store: Store;
  exclusive?: boolean;
}) {
  const products = store.products ?? [];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [showCategories, setShowCategories] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<
    NonNullable<Store["products"]>[number] | null
  >(null);
  const [themeApplying, setThemeApplying] = useState(exclusive);
  const categories = useMemo(
    () => [
      "Todos",
      ...Array.from(
        new Set(
          products
            .map((product) => product.category?.trim())
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    ],
    [products],
  );
  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    const byCategory =
      activeCategory === "Todos"
        ? products
        : products.filter(
            (product) => product.category?.trim() === activeCategory,
          );
    const result = search
      ? byCategory.filter((product) =>
          [product.name, product.description, product.category].some((value) =>
            value?.toLowerCase().includes(search),
          ),
        )
      : [...byCategory];
    if (sort === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort === "stock") result.sort((a, b) => b.stock - a.stock);
    return result;
  }, [activeCategory, products, query, sort]);
  const whatsappNumber = toWhatsAppNumber(store.whatsapp_phone);
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;
  const coverImage =
    store.store_json?.heroImage ??
    store.store_json?.profile_settings?.coverImage ??
    null;
  const storeAccent = getStoreAccent(store);

  useEffect(() => {
    if (exclusive) {
      writeExclusiveStoreContext({
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
      });
      return;
    }

    clearExclusiveStoreContext();
  }, [exclusive, store.id, store.name, store.slug]);

  useEffect(() => {
    if (!exclusive) {
      return;
    }

    const existingThemeMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    const themeMeta =
      existingThemeMeta ??
      document.head.appendChild(document.createElement("meta"));
    const previousThemeColor = themeMeta?.content;

    themeMeta.setAttribute("name", "theme-color");
    themeMeta?.setAttribute("content", storeAccent);

    const timeout = window.setTimeout(() => setThemeApplying(false), 650);

    return () => {
      window.clearTimeout(timeout);
      if (!existingThemeMeta) {
        themeMeta.remove();
      } else if (previousThemeColor) {
        themeMeta.setAttribute("content", previousThemeColor);
      }
    };
  }, [exclusive, storeAccent]);

  useEffect(() => {
    if (!selectedProduct) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProduct(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedProduct]);

  return (
    <main
      className={`storefront-page${exclusive ? " storefront-page--exclusive" : ""}`}
      style={{ "--store-accent": storeAccent } as CSSProperties}
    >
      {themeApplying ? (
        <div className="theme-applying" role="status" aria-live="polite">
          <span />
          <strong>Aplicando tema</strong>
          <small>{store.name}</small>
        </div>
      ) : null}
      {exclusive ? (
        <header className="exclusive-storefront-header">
          <strong>{store.name}</strong>
          <label className="storefront-search">
            <MagnifyingGlass />
            <input
              aria-label="Buscar en esta tienda"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar en ${store.name}...`}
            />
          </label>
          <CartSummary />
        </header>
      ) : (
        <header className="storefront-header">
          <Link href="/" className="storefront-brand">
            <Image
              src="/ondie-logo.png"
              alt="ONDIE"
              width={1051}
              height={310}
              priority
            />
          </Link>
          <label className="storefront-search">
            <MagnifyingGlass />
            <input
              aria-label="Buscar en esta tienda"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Buscar en ${store.name}...`}
            />
          </label>
          <nav>
            <Link href="/">Tiendas</Link>
            <a href="#products">Productos</a>
          </nav>
          <div className="storefront-actions">
            <CartSummary />
            <Link href="/account" aria-label="Mi cuenta">
              <UserCircle weight="bold" />
            </Link>
          </div>
        </header>
      )}
      <div className="storefront-shell">
        {!exclusive ? (
          <div className="store-breadcrumb">
            <Link href="/">Inicio</Link>
            <span>/</span>
            <Link href="/">Tiendas</Link>
            <span>/</span>
            <strong>{store.name}</strong>
          </div>
        ) : null}
        <section className="store-cover">
          {coverImage ? (
            <Image src={coverImage} alt="" fill priority sizes="100vw" />
          ) : null}
          <div className="store-cover-shade" />
          <div className="store-identity">
            <div className="store-monogram">
              {store.logo_url ? (
                <Image
                  src={store.logo_url}
                  alt={store.name}
                  fill
                  sizes="108px"
                />
              ) : (
                <Storefront weight="duotone" />
              )}
            </div>
            <div>
              <span className="verified">
                <CheckCircle weight="fill" /> Tienda verificada
              </span>
              <h1>{store.name}</h1>
              <p>{store.category ?? "Tienda local"}</p>
            </div>
          </div>
          <div className="store-cover-meta">
            <span>
              <Truck weight="duotone" /> Envíos coordinados
            </span>
            <span>
              <ShieldCheck weight="duotone" /> Compra protegida
            </span>
            {store.address ? (
              <span>
                <MapPin weight="duotone" /> {store.address}
              </span>
            ) : null}
          </div>
          <div className="store-cover-actions">
            <button type="button">
              <ShareNetwork /> Compartir
            </button>
            {whatsappUrl ? (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <WhatsappLogo weight="fill" /> Contactar por WhatsApp
              </a>
            ) : null}
          </div>
          {store.store_json?.profile_settings?.businessHours?.length ? (
            <div className="store-cover-hours">
              <button
                type="button"
                className="store-hours-toggle"
                onClick={() => setShowHours(!showHours)}
                aria-expanded={showHours}
              >
                <Clock weight="duotone" />
                <span>{getHoursStatus(store.store_json?.profile_settings?.businessHours)}</span>
                <span className={`hours-arrow${showHours ? " open" : ""}`}>▾</span>
              </button>
              {showHours && (
                <div className="store-hours-list">
                  {(store.store_json?.profile_settings?.businessHours ?? []).map(
                    (entry) => (
                      <div
                        key={entry.day}
                        className={`store-hours-row${
                          !entry.open ? " closed" : ""
                        }`}
                      >
                        <span className="hours-day">{entry.label}</span>
                        <span className="hours-time">
                          {entry.open
                            ? `${formatHour(entry.opensAt)} – ${formatHour(entry.closesAt)}`
                            : "Cerrado"}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}
        </section>
        <div className="store-catalog-layout" id="products">
          <button
            type="button"
            className="category-toggle"
            onClick={() => setShowCategories(!showCategories)}
            aria-expanded={showCategories}
          >
            <Package weight="duotone" /> {showCategories ? "Ocultar categorías" : "Categorías"}
          </button>
          <aside className={`catalog-sidebar catalog-sidebar--simple${showCategories ? " sidebar-open" : ""}`}>
            <div className="catalog-filter catalog-categories">
              <h3>Categorías</h3>
              {categories.map((category) => (
                <button
                  key={category}
                  className={activeCategory === category ? "active" : ""}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                >
                  {category === "Todos" ? (
                    <Package weight="duotone" />
                  ) : (
                    <Storefront weight="duotone" />
                  )}{" "}
                  {category === "Todos" ? "Todos los productos" : category}
                  <span>
                    {category === "Todos"
                      ? products.length
                      : products.filter(
                          (product) => product.category?.trim() === category,
                        ).length}
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <section className="catalog-main">
            <div className="catalog-heading">
              <div>
                <span>CATÁLOGO</span>
                <h2>Productos de {store.name}</h2>
                <p>
                  {visibleProducts.length}{" "}
                  {visibleProducts.length === 1 ? "producto" : "productos"}{" "}
                  disponibles
                </p>
              </div>
              <label className="catalog-sort">
                <SortAscending />
                <select
                  aria-label="Ordenar productos"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="featured">Destacados</option>
                  <option value="price-low">Menor precio</option>
                  <option value="price-high">Mayor precio</option>
                  <option value="stock">Más disponibles</option>
                </select>
              </label>
            </div>
            {visibleProducts.length ? (
              <div className="store-products-grid">
                       {visibleProducts.map((product) => (
                   <article className="store-product-card" key={product.id}>
                     <div className="store-product-image">
                       {product.image ? (
                         <Image
                           src={product.image}
                           alt={product.name}
                           fill
                           sizes="(max-width: 760px) 50vw, 25vw"
                         />
                       ) : (
                         <div className="product-image-fallback">
                           <Package weight="duotone" />
                         </div>
                       )}
<div className="product-badges">
                          {product.stock < 1 ? (
                            <span className="product-badge product-badge--out">Agotado</span>
                          ) : product.stock <= 5 ? (
                            <span className="product-badge product-badge--sale">Últimas {product.stock}</span>
                          ) : null}
                          {isProductNew(product.created_at) ? (
                            <span className="product-badge product-badge--new">Nuevo</span>
                          ) : null}
                        </div>
                       <button
                         type="button"
                         className="product-preview-trigger"
                         onClick={() => setSelectedProduct(product)}
                         aria-label={`Ver detalles de ${product.name}`}
                       />
                       <button
                         type="button"
                         onClick={() =>
                           setFavorites((current) =>
                             current.includes(product.id)
                               ? current.filter((id) => id !== product.id)
                               : [...current, product.id],
                           )
                         }
                         aria-label="Guardar producto"
                         className={
                           favorites.includes(product.id) ? "favorite" : ""
                         }
                       >
                         <Heart
                           weight={
                             favorites.includes(product.id) ? "fill" : "regular"
                           }
                         />
                       </button>
                     </div>
                     <div className="store-product-copy">
                       <span className="product-store-name">{store.name}</span>
                       <h3 className="product-title">{product.name}</h3>
                       <div className="product-price-row">
                         <strong>
                           C$ {product.price.toLocaleString("es-NI")}
                         </strong>
                         <span
                           className={
                             product.stock > 2 ? "in-stock" : "low-stock"
                           }
                         >
                           {product.stock > 2 ? "En stock" : "Últimas unidades"}
                         </span>
                       </div>
                       <AddToCartButton
                         product={product}
                         storeId={store.id}
                         storeName={store.name}
                         storeSlug={store.slug}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="catalog-empty">
                  <SlidersHorizontal />
                  <h3>No encontramos productos</h3>
                  <p>Prueba con otra búsqueda.</p>
                  <button type="button" onClick={() => setQuery("")}>
                    Limpiar búsqueda
                  </button>
                </div>
              )}
          </section>
        </div>
        <section className="store-benefits">
          <div>
            <Truck weight="duotone" />
            <span>
              <strong>Envíos coordinados</strong>
              <small>Recibe tu pedido donde estés</small>
            </span>
          </div>
          <div>
            <WhatsappLogo weight="duotone" />
            <span>
              <strong>Atención rápida</strong>
              <small>Habla directamente con el negocio</small>
            </span>
          </div>
          <div>
            <ShieldCheck weight="duotone" />
            <span>
              <strong>Compra segura</strong>
              <small>Tu pedido queda protegido</small>
            </span>
          </div>
        </section>
        <Link href="/cart" className="mobile-cart-link">
          Ver carrito <ArrowRight />
        </Link>
      </div>
      {selectedProduct ? (
        <div
          className="product-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedProduct(null)}
        >
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="product-modal-close"
              onClick={() => setSelectedProduct(null)}
              aria-label="Cerrar detalles"
            >
              <X weight="bold" />
            </button>
            <div className="product-modal-image">
              {selectedProduct.image ? (
                <Image
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  fill
                  sizes="(max-width: 760px) 100vw, 55vw"
                  priority
                />
              ) : (
                <div className="product-image-fallback">
                  <Package weight="duotone" />
                </div>
              )}
            </div>
            <div className="product-modal-copy">
              <span className="product-store-name">{store.name}</span>
              <h2 id="product-modal-title">{selectedProduct.name}</h2>
              <p>{selectedProduct.description ?? "Producto de catálogo"}</p>
              <div className="product-modal-price">
                <strong>
                  C$ {selectedProduct.price.toLocaleString("es-NI")}
                </strong>
                <span
                  className={
                    selectedProduct.stock > 2 ? "in-stock" : "low-stock"
                  }
                >
                  {selectedProduct.stock > 2 ? "En stock" : "Últimas unidades"}
                </span>
              </div>
              <AddToCartButton
                product={selectedProduct}
                storeId={store.id}
                storeName={store.name}
                storeSlug={store.slug}
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
