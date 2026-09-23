"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
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
import { getProductAvailability } from "@/lib/product-availability";

const DEFAULT_ACCENT = "#142fe3";
const PRODUCTS_PER_PAGE = 12;
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
  const m = parts[1].padStart(2, "0");
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

function isStoreOpenNow(businessHours: Array<{ day: string; label: string; open: boolean; opensAt: string; closesAt: string }> | undefined): boolean | null {
  if (!businessHours?.length) return null;
  const todayEntry = getTodayEntry(businessHours);
  if (!todayEntry) return null;
  if (!todayEntry.open) return false;
  const now = new Date();
  const [openH, openM] = todayEntry.opensAt.split(":").map(Number);
  const [closeH, closeM] = todayEntry.closesAt.split(":").map(Number);
  const openTime = openH * 60 + openM;
  const closeTime = closeH * 60 + closeM;
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= openTime && current < closeTime;
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
  const businessHours = store.store_json?.profile_settings?.businessHours;
  const storeOpen = isStoreOpenNow(businessHours);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<
    NonNullable<Store["products"]>[number] | null
  >(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [currentPage, setCurrentPage] = useState(1);
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
  const totalPages = Math.max(
    1,
    Math.ceil(visibleProducts.length / PRODUCTS_PER_PAGE),
  );
  const pageForDisplay = Math.min(currentPage, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (Math.min(currentPage, totalPages) - 1) * PRODUCTS_PER_PAGE;
    return visibleProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [currentPage, totalPages, visibleProducts]);
  const updateQuery = (value: string) => {
    setQuery(value);
    setCurrentPage(1);
  };
  const updateCategory = (category: string) => {
    setActiveCategory(category);
    setCurrentPage(1);
  };
  const updateSort = (value: string) => {
    setSort(value);
    setCurrentPage(1);
  };
  const whatsappNumber = toWhatsAppNumber(store.whatsapp_phone);
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;
  const coverImage =
    store.store_json?.heroImage ??
    store.store_json?.profile_settings?.coverImage ??
    null;
  const storeAccent = getStoreAccent(store);
  const storeDescription =
    store.description?.trim() || store.store_json?.description?.trim() || null;
  const selectedImages = selectedProduct?.images?.length
    ? selectedProduct.images
    : selectedProduct?.image
      ? [{ image_url: selectedProduct.image, alt_text: null }]
      : [];
  const selectedImage = selectedImages[selectedImageIndex] ?? selectedImages[0];
  const variantGroups = (selectedProduct?.variant_options ?? []).filter(
    (group) => group.name.trim() && group.values.length,
  );
  const variantsReady = variantGroups.every((group) =>
    Boolean(selectedVariants[group.name]),
  );
  const missingVariantGroups = variantGroups.filter(
    (group) => !selectedVariants[group.name],
  );
  const variantSelectionSummary = variantGroups
    .filter((group) => selectedVariants[group.name])
    .map((group) => `${group.name}: ${selectedVariants[group.name]}`)
    .join(" · ");

  const openProductDetails = (
    product: NonNullable<Store["products"]>[number],
  ) => {
    setSelectedProduct(product);
    setSelectedImageIndex(0);
    setSelectedVariants({});
  };

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

    setSelectedImageIndex(0);
    setSelectedVariants({});

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
              onChange={(event) => updateQuery(event.target.value)}
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
              onChange={(event) => updateQuery(event.target.value)}
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
              {storeDescription ? (
                <p className="store-identity-description">
                  {storeDescription}
                </p>
              ) : null}
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
        </section>
        {storeOpen === false ? (
          <div className="store-closed-banner">
            <Clock weight="duotone" />
            <div>
              <strong>Tienda cerrada</strong>
              <p>No estamos atendiendo en este momento. Visítanos en horario de atención.</p>
            </div>
          </div>
        ) : null}
        {store.store_json?.profile_settings?.businessHours?.length ? (
          <div className="store-hours-card">
            <button
              type="button"
              className="store-hours-toggle"
              onClick={() => setShowHours(!showHours)}
              aria-expanded={showHours}
            >
              <Clock weight="duotone" size={18} />
              <span className="hours-toggle-text">
                <span className="hours-toggle-label">Horario de atención</span>
                <span className="hours-toggle-status">{getHoursStatus(store.store_json?.profile_settings?.businessHours)}</span>
              </span>
              <span className={`hours-arrow${showHours ? " open" : ""}`}>▲</span>
            </button>
            {showHours && (
              <div className="store-hours-grid">
                {(store.store_json?.profile_settings?.businessHours ?? []).map(
                  (entry) => {
                    const isToday = entry.day.toLowerCase() === new Date().toLocaleDateString("es-ES", { weekday: "long" }).toLowerCase();
                    return (
                      <div
                        key={entry.day}
                        className={`store-hours-cell${
                          !entry.open ? " closed" : ""
                        }${isToday ? " today" : ""}`}
                      >
                        <span className="cell-day">{entry.label}</span>
                        {entry.open ? (
                          <span className="cell-time">{formatHour(entry.opensAt)} – {formatHour(entry.closesAt)}</span>
                        ) : (
                          <span className="cell-time">Cerrado</span>
                        )}
                        {isToday && entry.open ? (
                          <span className="cell-badge-open">Abierto</span>
                        ) : null}
                        {isToday && !entry.open ? (
                          <span className="cell-badge-closed">Cerrado hoy</span>
                        ) : null}
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        ) : null}
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
                  onClick={() => updateCategory(category)}
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
                  {visibleProducts.length === 1 ? "producto" : "productos"} en
                  el catálogo
                </p>
              </div>
              <label className="catalog-sort">
                <SortAscending />
                <select
                  aria-label="Ordenar productos"
                  value={sort}
                  onChange={(event) => updateSort(event.target.value)}
                >
                  <option value="featured">Destacados</option>
                  <option value="price-low">Menor precio</option>
                  <option value="price-high">Mayor precio</option>
                  <option value="stock">Más disponibles</option>
                </select>
              </label>
            </div>
            {visibleProducts.length ? (
              <>
                <div className="store-products-grid">
                       {paginatedProducts.map((product) => (
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
                          {(() => {
                            const availability = getProductAvailability(
                              product.stock,
                              product.fulfillment_mode,
                            );
                            return availability.badgeClass ? (
                              <span
                                className={`product-badge ${availability.badgeClass}`}
                              >
                                {availability.label}
                              </span>
                            ) : null;
                          })()}
                          {isProductNew(product.created_at) ? (
                            <span className="product-badge product-badge--new">Nuevo</span>
                          ) : null}
                        </div>
                       <button
                         type="button"
                         className="product-preview-trigger"
                         onClick={() => openProductDetails(product)}
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
                       {product.description?.trim() ? (
                         <p className="product-description">
                           {product.description.trim()}
                         </p>
                       ) : null}
                       <div className="product-price-row">
                         <strong>
                           C$ {product.price.toLocaleString("es-NI")}
                         </strong>
                         <span
                           className={getProductAvailability(
                             product.stock,
                             product.fulfillment_mode,
                           ).statusClass}
                         >
                           {getProductAvailability(
                             product.stock,
                             product.fulfillment_mode,
                           ).label}
                         </span>
                       </div>
                       {product.variant_options?.length ? (
                         <button
                           type="button"
                           className="button add-to-cart-button variant-select-button"
                           onClick={() => openProductDetails(product)}
                         >
                           Elegir opciones
                         </button>
                       ) : (
                         <AddToCartButton
                           product={product}
                           storeId={store.id}
                           storeName={store.name}
                           storeSlug={store.slug}
                         />
                       )}
                      </div>
                    </article>
                  ))}
                </div>
                {totalPages > 1 ? (
                  <nav className="catalog-pagination" aria-label="Paginación de productos">
                    <button
                      type="button"
                      className="catalog-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={pageForDisplay === 1}
                      aria-label="Página anterior"
                    >
                      <CaretLeft weight="bold" />
                      <span>Anterior</span>
                    </button>
                    <span className="catalog-pagination-status" aria-live="polite">
                      Página {pageForDisplay} de {totalPages}
                    </span>
                    <button
                      type="button"
                      className="catalog-pagination-button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={pageForDisplay === totalPages}
                      aria-label="Página siguiente"
                    >
                      <span>Siguiente</span>
                      <CaretRight weight="bold" />
                    </button>
                  </nav>
                ) : null}
              </>
              ) : (
                <div className="catalog-empty">
                  <SlidersHorizontal />
                  <h3>No encontramos productos</h3>
                  <p>Prueba con otra búsqueda.</p>
                  <button type="button" onClick={() => updateQuery("")}>
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
            <div className="product-modal-gallery">
              <div className="product-modal-image">
                {selectedImage?.image_url ? (
                  <Image
                    src={selectedImage.image_url}
                    alt={selectedImage.alt_text ?? selectedProduct.name}
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
              {selectedImages.length > 1 ? (
                <div
                  className="product-modal-thumbnails"
                  aria-label="Fotos del producto"
                >
                  {selectedImages.map((image, index) => (
                    <button
                      type="button"
                      key={image.id ?? image.image_url}
                      className={index === selectedImageIndex ? "active" : ""}
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`Ver foto ${index + 1}`}
                    >
                      <Image src={image.image_url} alt="" fill sizes="76px" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="product-modal-copy">
              <span className="product-store-name">{store.name}</span>
              <h2 id="product-modal-title">{selectedProduct.name}</h2>
              {selectedProduct.description?.trim() ? (
                <p className="product-description product-description--detail">
                  {selectedProduct.description.trim()}
                </p>
              ) : null}
              <div className="product-modal-price">
                <strong>
                  C$ {selectedProduct.price.toLocaleString("es-NI")}
                </strong>
                <span
                  className={getProductAvailability(
                    selectedProduct.stock,
                    selectedProduct.fulfillment_mode,
                  ).statusClass}
                >
                  {getProductAvailability(
                    selectedProduct.stock,
                    selectedProduct.fulfillment_mode,
                  ).label}
                </span>
              </div>
              {variantGroups.length ? (
                <div className="product-variant-options">
                  {variantGroups.map((group) => (
                    <div className="product-variant-group" key={group.name}>
                      <strong>{group.name}</strong>
                      <div className="product-variant-values">
                        {group.values.map((value) => (
                          <button
                            type="button"
                            key={value}
                            className={
                              selectedVariants[group.name] === value
                                ? "active"
                                : ""
                            }
                            aria-pressed={selectedVariants[group.name] === value}
                            aria-label={`${group.name}: ${value}`}
                            onClick={() =>
                              setSelectedVariants((current) => ({
                                ...current,
                                [group.name]: value,
                              }))
                            }
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {variantGroups.length ? (
                <p
                  className={`product-selection-status ${variantsReady ? "ready" : "pending"}`}
                  role="status"
                >
                  {variantsReady
                    ? `Seleccionado · ${variantSelectionSummary}`
                    : `Falta seleccionar: ${missingVariantGroups.map((group) => group.name).join(" y ")}`}
                </p>
              ) : null}
              <AddToCartButton
                product={selectedProduct}
                storeId={store.id}
                storeName={store.name}
                storeSlug={store.slug}
                variantOptions={selectedVariants}
                disabled={!variantsReady}
                disabledLabel={
                  missingVariantGroups.length
                    ? `Selecciona ${missingVariantGroups.map((group) => group.name).join(" y ")}`
                    : undefined
                }
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
