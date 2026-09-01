"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, LockKey, MagnifyingGlass, Minus, Package, Plus, ShieldCheck, Storefront, Trash, Truck, UserCircle, WhatsappLogo, X } from "@phosphor-icons/react";
import { CartSummary } from "@/components/cart-summary";
import { clearCart, readCart, removeFromCart, subscribeToCart, updateCartQuantity, type CartItem } from "@/lib/cart";

export function CartPageClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => { const sync = () => setItems(readCart()); sync(); return subscribeToCart(sync); }, []);
  const groups = useMemo(() => {
    const map = new Map<string, { storeId: string; storeName: string; items: CartItem[] }>();
    for (const item of items) {
      const group = map.get(item.storeId) ?? { storeId: item.storeId, storeName: item.storeName, items: [] };
      group.items.push(item); map.set(item.storeId, group);
    }
    return [...map.values()];
  }, [items]);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return <main className="ondie-cart-page">
    <header className="cart-page-header"><Link href="/"><Image src="/ondie-logo.svg" alt="ONDIE" width={176} height={58} priority /></Link><label><MagnifyingGlass /><input aria-label="Buscar productos o tiendas" placeholder="Buscar productos o tiendas..." /></label><nav><Link href="/">Tiendas</Link></nav><div><CartSummary /><Link href="/checkout" aria-label="Mi cuenta"><UserCircle /></Link></div></header>
    <div className="cart-page-shell">
      <section className="cart-page-intro"><div><span>TU COMPRA</span><h1>Mi carrito <small>{groups.length} {groups.length === 1 ? "tienda" : "tiendas"}</small></h1><p>Revisa los productos que agregaste. Cada pedido se gestiona con la tienda correspondiente.</p></div>{items.length ? <button type="button" onClick={clearCart}><Trash /> Vaciar carrito</button> : null}</section>
      {items.length ? <div className="cart-page-layout">
        <div className="cart-store-list">{groups.map((group) => {
          const subtotal = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
          return <section className="cart-store-group" key={group.storeId}><header><div className="cart-store-avatar"><Storefront weight="duotone" /></div><div><h2>{group.storeName}</h2><p>{group.items.length} {group.items.length === 1 ? "producto" : "productos"}</p></div><Link href={`/stores/${group.items[0]?.storeSlug ?? group.storeName.toLowerCase().replace(/\s+/g, "-")}`}>Ver tienda <ArrowRight /></Link></header>
            {group.items.map((item) => <article className="cart-line-item" key={`${item.storeId}-${item.id}`}><div className="cart-item-image">{item.image ? <Image src={item.image} alt={item.name} fill sizes="100px" /> : <Package />}</div><div className="cart-item-copy"><h3>{item.name}</h3><p>{item.description ?? "Producto de catálogo"}</p><strong>C$ {item.price.toLocaleString("es-NI")}</strong></div><div className="quantity-control"><button aria-label="Reducir cantidad" onClick={() => updateCartQuantity(item.id, item.storeId, item.quantity - 1)}><Minus /></button><span>{item.quantity}</span><button aria-label="Aumentar cantidad" onClick={() => updateCartQuantity(item.id, item.storeId, item.quantity + 1)}><Plus /></button></div><strong className="cart-line-total">C$ {(item.price * item.quantity).toLocaleString("es-NI")}</strong><button className="remove-line" aria-label={`Eliminar ${item.name}`} onClick={() => removeFromCart(item.id, item.storeId)}><X /></button></article>)}
            <footer><span>Subtotal {group.storeName}</span><strong>C$ {subtotal.toLocaleString("es-NI")}</strong></footer></section>;
        })}<div className="cart-whatsapp-note"><div><WhatsappLogo weight="fill" /></div><span><strong>Comunicación directa con cada tienda</strong><small>Al generar tu pedido podrás coordinar entrega y pago con cada negocio.</small></span><Storefront weight="duotone" /></div></div>
        <aside className="cart-summary-panel"><h2>Resumen del carrito</h2>{groups.map((group) => <div className="summary-store" key={group.storeId}><span><strong>{group.storeName}</strong><small>{group.items.length} {group.items.length === 1 ? "producto" : "productos"}</small></span><strong>C$ {group.items.reduce((sum, item) => sum + item.price * item.quantity, 0).toLocaleString("es-NI")}</strong></div>)}<div className="summary-row"><span>Subtotal ({groups.length} {groups.length === 1 ? "tienda" : "tiendas"})</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="summary-row"><span>Envío</span><strong className="free-shipping">A coordinar</strong></div><div className="summary-total"><span>Total</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="secure-note"><ShieldCheck weight="duotone" /><span><strong>Compra segura</strong><small>Tus datos están protegidos y cada tienda recibe únicamente su pedido.</small></span></div><Link className="continue-order" href="/checkout">Continuar y generar pedido <ArrowRight /></Link><p className="no-charge"><LockKey /> ONDIE no realiza cobros en la plataforma</p></aside>
      </div> : <section className="empty-cart-page"><div><Package weight="duotone" /></div><h2>Tu carrito está vacío</h2><p>Explora el colectivo y agrega productos de tus tiendas favoritas.</p><Link href="/">Explorar tiendas <ArrowRight /></Link></section>}
      <section className="cart-benefits"><div><Truck /><span><strong>Envíos coordinados</strong><small>Recibe tu pedido donde estés</small></span></div><div><WhatsappLogo /><span><strong>Atención por WhatsApp</strong><small>Habla directamente con cada tienda</small></span></div><div><ShieldCheck /><span><strong>Pago directo</strong><small>Coordina con el negocio</small></span></div></section>
    </div>
  </main>;
}
