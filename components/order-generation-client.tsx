"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bank, Check, Copy, Info, LockKey, MagnifyingGlass, MapPin, Money, Package, ShieldCheck, Storefront, Truck, UserCircle, WhatsappLogo } from "@phosphor-icons/react";
import { CartSummary } from "@/components/cart-summary";
import { readCart, subscribeToCart, type CartItem } from "@/lib/cart";
import { toWhatsAppNumber } from "@/lib/whatsapp";

type Contacts = Record<string, {
  slug: string;
  phone: string;
  category: string;
  paymentMethods: string[];
  paymentAccounts: Array<{
    bankName: string;
    accountHolder?: string;
    accountNumber?: string;
    cci?: string;
    accountType?: string;
    walletLabel?: string;
    walletNumber?: string;
  }>;
}>;

export function OrderGenerationClient({ contacts }: { contacts: Contacts }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState("transfer");
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { const sync = () => setItems(readCart()); sync(); return subscribeToCart(sync); }, []);
  const groups = useMemo(() => {
    const map = new Map<string, { storeId: string; storeName: string; items: CartItem[] }>();
    for (const item of items) { const group = map.get(item.storeId) ?? { storeId: item.storeId, storeName: item.storeName, items: [] }; group.items.push(item); map.set(item.storeId, group); }
    return [...map.values()];
  }, [items]);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const valid = name.trim() && phone.trim() && address.trim() && items.length;

  async function copyValue(value: string) {
    if (!value.trim()) {
      return;
    }

    await navigator.clipboard.writeText(value);
  }

  function messageFor(group: (typeof groups)[number]) {
    const lines = group.items.map((item) => `• ${item.name} x${item.quantity} — C$ ${(item.price * item.quantity).toLocaleString("es-NI")}`).join("\n");
    const subtotal = group.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return `Hola ${group.storeName}, quiero generar este pedido desde ONDIE:\n\n${lines}\n\nSubtotal: C$ ${subtotal.toLocaleString("es-NI")}\nCliente: ${name}\nWhatsApp: ${phone}\nEntrega: ${address}${reference ? `\nReferencia: ${reference}` : ""}\nPago: ${payment === "transfer" ? "Transferencia / depósito" : "A coordinar con la tienda"}`;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!valid || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name, phone, address, reference },
          paymentMethod: payment,
          groups: groups.map((group) => ({
            storeId: group.storeId,
            items: group.items.map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              image: item.image,
              price: item.price,
              quantity: item.quantity,
            })),
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No fue posible guardar el pedido.");
      }

      setSubmitted(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No fue posible guardar el pedido.");
    } finally {
      setIsSaving(false);
    }
  }

  return <main className="order-page">
    <header className="order-header"><Link href="/"><Image src="/ondie-logo.svg" alt="ONDIE" width={176} height={58} priority /></Link><label><MagnifyingGlass /><input aria-label="Buscar productos o tiendas" placeholder="Buscar productos o tiendas..." /></label><nav><Link href="/">Tiendas</Link></nav><div><CartSummary /><Link href="/checkout" aria-label="Mi cuenta"><UserCircle /></Link></div></header>
    <div className="order-shell"><div className="order-breadcrumb"><Link href="/">Inicio</Link><span>/</span><Link href="/cart">Mi carrito</Link><span>/</span><strong>Generar pedido</strong></div><Link href="/cart" className="back-to-cart"><ArrowLeft /> Volver al carrito</Link><h1>Generar pedido</h1>
      {items.length ? <form className="order-layout" onSubmit={submit}><div className="order-form-column"><section className="order-card"><h2>Datos de entrega y contacto</h2><div className="order-field"><label htmlFor="order-name">Nombre completo</label><input id="order-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Tu nombre y apellido" required /></div><div className="order-field"><label htmlFor="order-phone">Teléfono / WhatsApp</label><div><WhatsappLogo /><input id="order-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8888 8888" required /></div></div><div className="order-field"><label htmlFor="order-address">Dirección de entrega</label><div><MapPin /><input id="order-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ciudad, barrio y dirección" required /></div></div><div className="order-field"><label htmlFor="order-reference">Referencia (opcional)</label><input id="order-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Casa, edificio o punto de referencia" /></div><p className="order-info"><Info /> Cada tienda se pondrá en contacto contigo para confirmar disponibilidad y entrega.</p></section>
          <section className="order-card"><h2>Forma de pago</h2><p className="section-helper">El pago se coordina directamente con cada negocio.</p><div className="payment-options"><button type="button" className={payment === "transfer" ? "active" : ""} onClick={() => setPayment("transfer")}><Bank /> Transferencia / depósito</button><button type="button" className={payment === "coordinate" ? "active" : ""} onClick={() => setPayment("coordinate")}><Money /> Coordinar con la tienda</button></div><div className="payment-explainer"><ShieldCheck /><span><strong>Pago directo y transparente</strong><small>ONDIE no procesa cobros. La tienda te compartirá sus datos y confirmará tu pago.</small></span></div></section>
          {payment === "transfer" ? groups.map((group) => {
            const paymentAccounts = contacts[group.storeId]?.paymentAccounts ?? [];
            const paymentMethods = contacts[group.storeId]?.paymentMethods ?? [];

            if (!paymentAccounts.length && !paymentMethods.length) {
              return null;
            }

            return <section className="order-card" key={`${group.storeId}-payment-accounts`}><h2>Cuentas del negocio para tu pago</h2><p className="section-helper">Datos registrados por {group.storeName} para recibir transferencias o pagos directos.</p><div className="payment-store-heading"><strong>{group.storeName}</strong><small>{contacts[group.storeId]?.category ?? "Tienda local"}</small></div>{paymentMethods.length ? <div className="payment-method-tags">{paymentMethods.map((method) => <span key={method}>{method}</span>)}</div> : null}<div className="payment-account-list">{paymentAccounts.map((account, index) => <article className="payment-account-card" key={`${group.storeId}-account-${index}`}><div className="payment-account-copy"><strong>{account.bankName}</strong>{account.accountHolder ? <span>Titular: {account.accountHolder}</span> : null}{account.accountType ? <span>Tipo: {account.accountType}</span> : null}{account.accountNumber ? <span>N de cuenta: {account.accountNumber}</span> : null}{account.cci ? <span>CCI: {account.cci}</span> : null}{account.walletLabel || account.walletNumber ? <span>{account.walletLabel ?? "Billetera"}: {account.walletNumber ?? ""}</span> : null}</div><div className="payment-account-actions">{account.accountType ? <small>{account.accountType}</small> : null}{account.accountNumber ? <button type="button" aria-label={`Copiar cuenta de ${account.bankName}`} onClick={() => void copyValue(account.accountNumber!)}><Copy /></button> : null}</div></article>)}</div></section>;
          }) : null}
        </div><aside className="order-summary-column"><section className="order-summary-card"><h2>Resumen de tu pedido</h2>{groups.map((group) => <div className="order-store-summary" key={group.storeId}><header><div><Storefront weight="duotone" /></div><span><strong>{group.storeName}</strong><small>{contacts[group.storeId]?.category ?? "Tienda local"}</small></span><Link href={`/stores/${contacts[group.storeId]?.slug ?? ""}`}>Ver tienda</Link></header>{group.items.map((item) => <div className="order-product" key={item.id}><div>{item.image ? <Image src={item.image} alt={item.name} fill sizes="65px" /> : <Package />}</div><span><strong>{item.name}</strong><small>{item.description ?? "Producto de catálogo"}</small><b>C$ {item.price.toLocaleString("es-NI")}</b></span><em>x{item.quantity}</em></div>)}</div>)}<div className="order-total-row"><span>Subtotal ({items.length} productos)</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="order-total-row"><span>Envío</span><strong className="coordinate">A coordinar</strong></div><div className="order-grand-total"><span>Total a pagar</span><strong>C$ {total.toLocaleString("es-NI")}</strong></div><div className="important-note"><ShieldCheck /><span><strong>Importante</strong><small>La tienda confirmará disponibilidad, entrega y pago por WhatsApp.</small></span></div></section>
          <section className="whatsapp-submit-card"><h2>Enviar pedido por WhatsApp</h2><p>Se preparará un mensaje independiente para cada tienda.</p>{saveError ? <p className="order-save-error">{saveError}</p> : null}{submitted ? <div className="ready-order"><Check /><span><strong>¡Tu pedido está listo!</strong><small>Abre cada conversación para enviarlo.</small></span></div> : null}{submitted ? groups.map((group) => { const number = toWhatsAppNumber(contacts[group.storeId]?.phone); const href = number ? `https://wa.me/${number}?text=${encodeURIComponent(messageFor(group))}` : `https://wa.me/?text=${encodeURIComponent(messageFor(group))}`; return <a key={group.storeId} href={href} target="_blank" rel="noreferrer" className="send-whatsapp"><WhatsappLogo weight="fill" /> Enviar a {group.storeName}</a>; }) : <button className="prepare-order" type="submit" disabled={!valid || isSaving}><WhatsappLogo weight="fill" /> {isSaving ? "Guardando pedido..." : "Preparar pedido"} <ArrowRight /></button>}<p className="privacy-order"><LockKey /> Tus datos se usan únicamente para coordinar este pedido.</p></section>
        </aside></form> : <section className="order-empty"><Package /><h2>No hay productos para generar un pedido</h2><Link href="/">Explorar tiendas <ArrowRight /></Link></section>}
      <section className="order-benefits"><div><ShieldCheck /><span><strong>Compra segura</strong><small>Tus datos están protegidos</small></span></div><div><Truck /><span><strong>Envíos coordinados</strong><small>Acuerda la entrega con la tienda</small></span></div><div><WhatsappLogo /><span><strong>Atención directa</strong><small>Comunícate por WhatsApp</small></span></div></section>
    </div>
  </main>;
}
