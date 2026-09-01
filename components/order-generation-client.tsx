"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bank, Check, CircleNotch, Info, LockKey, MagnifyingGlass, MapPin, Money, Package, ShieldCheck, Storefront, Truck, UserCircle, WhatsappLogo } from "@phosphor-icons/react";
import { CartSummary } from "@/components/cart-summary";
import { readCart, subscribeToCart, type CartItem } from "@/lib/cart";

type Contacts = Record<string, { slug: string; phone: string; category: string }>;

export function OrderGenerationClient({ contacts }: { contacts: Contacts }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState("transfer");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { const sync = () => setItems(readCart()); sync(); return subscribeToCart(sync); }, []);
  const groups = useMemo(() => {
    const map = new Map<string, { storeId: string; storeName: string; items: CartItem[] }>();
    for (const item of items) { const group = map.get(item.storeId) ?? { storeId: item.storeId, storeName: item.storeName, items: [] }; group.items.push(item); map.set(item.storeId, group); }
    return [...map.values()];
  }, [items]);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const valid = name.trim() && phone.trim() && address.trim() && items.length;

  function messageFor(group: (typeof groups)[number]) {
    const lines = group.items.map((item) => `• ${item.name} x${item.quantity} — C$ ${(item.price * item.quantity).toLocaleString("es-NI")}`).join("\n");
    const subtotal = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return `Hola ${group.storeName}, quiero generar este pedido desde ONDIE:\n\n${lines}\n\nSubtotal: C$ ${subtotal.toLocaleString("es-NI")}\nCliente: ${name}\nWhatsApp: ${phone}\nEntrega: ${address}${reference ? `\nReferencia: ${reference}` : ""}\nPago: ${payment === "transfer" ? "Transferencia / depósito" : "A coordinar con la tienda"}`;
  }

  function submit(event: FormEvent) { event.preventDefault(); if (valid) setSubmitted(true); }

  return <main className="order-page">
    <header className="order-header"><Link href="/"><Image src="/ondie-logo.svg" alt="ONDIE" width={176} height={58} priority /></Link><label><MagnifyingGlass /><input aria-label="Buscar productos o tiendas" placeholder="Buscar productos o tiendas..." /></label><nav><Link href="/">Tiendas</Link><Link href="/#categories">Categorías</Link><Link href="/#discover">Descubrir</Link></nav><div><CartSummary /><Link href="/checkout" aria-label="Mi cuenta"><UserCircle /></Link></div></header>
    <div className="order-shell"><div className="order-breadcrumb"><Link href="/">Inicio</Link><span>/</span><Link href="/cart">Mi carrito</Link><span>/</span><strong>Generar pedido</strong></div><Link href="/cart" className="back-to-cart"><ArrowLeft /> Volver al carrito</Link><h1>Generar pedido</h1>
      <div className="order-steps"><div className="active"><span>1</span><strong>Datos de entrega<small>Completa tu información</small></strong></div><i /><div><span>2</span><strong>Resumen del pedido<small>Revisa tu compra</small></strong></div><i /><div><span>3</span><strong>Enviar por WhatsApp<small>Confirma y envía</small></strong></div></div>
      {items.length ? <form className="order-layout" onSubmit={submit}><div className="order-form-column"><section className="order-card"><h2>Datos de entrega y contacto</h2><div className="order-field"><label htmlFor="order-name">Nombre completo</label><input id="order-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre y apellido" required /></div><div className="order-field"><label htmlFor="order-phone">Teléfono / WhatsApp</label><div><WhatsappLogo /><input id="order-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8888 8888" required /></div></div><div className="order-field"><label htmlFor="order-address">Dirección de entrega</label><div><MapPin /><input id="order-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ciudad, barrio y dirección" required /></div></div><div className="order-field"><label htmlFor="order-reference">Referencia (opcional)</label><input id="order-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Casa, edificio o punto de referencia" /></div><p className="order-info"><Info /> Cada tienda se pondrá en contacto contigo para confirmar disponibilidad y entrega.</p></section>
          <section className="order-card"><h2>Forma de pago</h2><p className="section-helper">El pago se coordina directamente con cada negocio.</p><div className="payment-options"><button type="button" className={payment === "transfer" ? "active" : ""} onClick={() => setPayment("transfer")}><Bank /> Transferencia / depósito</button><button type="button" className={payment === "coordinate" ? "active" : ""} onClick={() => setPayment("coordinate")}><Money /> Coordinar con la tienda</button></div><div className="payment-explainer"><ShieldCheck /><span><strong>Pago directo y transparente</strong><small>ONDIE no procesa cobros. La tienda te compartirá sus datos y confirmará tu pago.</small></span></div></section>
        </div><aside className="order-summary-column"><section className="order-summary-card"><h2>Resumen de tu pedido</h2>{groups.map((group) => <div className="order-store-summary" key={group.storeId}><header><div><Storefront weight="duotone" /></div><span><strong>{group.storeName}</strong><small>{contacts[group.storeId]?.category ?? "Tienda local"}</small></span><Link href={`/stores/${contacts[group.storeId]?.slug ?? ""}`}>Ver tienda</Link></header>{group.items.map((item) => <div className="order-product" key={item.id}><div>{item.image ? <Image src={item.image} alt={item.name} fill sizes="65px" /> : <Package />}</div><span><strong>{item.name}</strong><small>{item.description ?? "Producto de catálogo"}</small><b>C$ {item.price.toLocaleString("es-NI")}</b></span><em>x{item.quantity}</em></div>)}</div>)}<div className="order-total-row"><span>Subtotal ({items.length} productos)</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="order-total-row"><span>Envío</span><strong className="coordinate">A coordinar</strong></div><div className="order-grand-total"><span>Total a pagar</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="important-note"><ShieldCheck /><span><strong>Importante</strong><small>La tienda confirmará disponibilidad, entrega y pago por WhatsApp.</small></span></div></section>
          <section className="whatsapp-submit-card"><h2>Enviar pedido por WhatsApp</h2><p>Se preparará un mensaje independiente para cada tienda.</p>{submitted ? <div className="ready-order"><Check /><span><strong>¡Tu pedido está listo!</strong><small>Abre cada conversación para enviarlo.</small></span></div> : null}{submitted ? groups.map((group) => { const number = contacts[group.storeId]?.phone.replace(/\D/g, ""); const href = number ? `https://wa.me/${number}?text=${encodeURIComponent(messageFor(group))}` : `https://wa.me/?text=${encodeURIComponent(messageFor(group))}`; return <a key={group.storeId} href={href} target="_blank" rel="noreferrer" className="send-whatsapp"><WhatsappLogo weight="fill" /> Enviar a {group.storeName}</a>; }) : <button className="prepare-order" type="submit" disabled={!valid}><WhatsappLogo weight="fill" /> Preparar pedido <ArrowRight /></button>}<p className="privacy-order"><LockKey /> Tus datos se usan únicamente para coordinar este pedido.</p></section>
        </aside></form> : <section className="order-empty"><Package /><h2>No hay productos para generar un pedido</h2><Link href="/">Explorar tiendas <ArrowRight /></Link></section>}
      <section className="order-benefits"><div><ShieldCheck /><span><strong>Compra segura</strong><small>Tus datos están protegidos</small></span></div><div><Truck /><span><strong>Envíos coordinados</strong><small>Acuerda la entrega con la tienda</small></span></div><div><WhatsappLogo /><span><strong>Atención directa</strong><small>Comunícate por WhatsApp</small></span></div></section>
    </div>
  </main>;
}
