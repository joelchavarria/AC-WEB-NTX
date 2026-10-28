"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Check,
  Info,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Money,
  Package,
  ShieldCheck,
  Storefront,
  Truck,
  UserCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { CartSummary } from "@/components/cart/cart-summary";
import { useNoticeCenter } from "@/components/page/feedback/notice-center";
import {
  readCartStoreOptions,
  clearCart,
  readCart,
  readExclusiveStoreContext,
  subscribeToCart,
  variantKey,
  writeCart,
  type CartItem,
  type ExclusiveStoreContext,
} from "@/lib/cart";
import { toWhatsAppNumber, whatsAppMessageUrl } from "@/lib/whatsapp";

type Contacts = Record<
  string,
  {
    slug: string;
    phone: string;
    category: string;
    cashEnabled: boolean;
    deliveryMethods: Array<{
      id: string;
      name: string;
      enabled: boolean;
      fee: string;
    }>;
    pickupEnabled: boolean;
    pickupAddress: string;
  }
>;
type DeliveryMethod = "pickup" | "own_delivery" | "store_delivery";
type OrderGroup = { storeId: string; storeName: string; items: CartItem[] };
type PreparedOrder = { id: string; orderNumber: number; storeId: string };
type OpenedReceipt = { orderNumber: number; storeName: string; openedAt: number };
type CheckoutError = Error & { reportable?: boolean };
const LAST_OPENED_ORDER_KEY = "ondie-last-opened-order";
const CHECKOUT_DEVICE_ID_KEY = "ondie-checkout-device-id";

function getCheckoutDeviceId() {
  const current = window.localStorage.getItem(CHECKOUT_DEVICE_ID_KEY);
  if (current) return current;
  const deviceId = crypto.randomUUID();
  window.localStorage.setItem(CHECKOUT_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function OrderGenerationClient({ contacts }: { contacts: Contacts }) {
  const { showNotice } = useNoticeCenter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState("transfer");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("store_delivery");
  const [storeDeliveryMethods, setStoreDeliveryMethods] = useState<
    Record<string, string>
  >({});
  const [storeOptions, setStoreOptions] = useState(readCartStoreOptions);
  const [submitted, setSubmitted] = useState(false);
  const [preparedGroups, setPreparedGroups] = useState<OrderGroup[]>([]);
  const [preparedOrders, setPreparedOrders] = useState<PreparedOrder[]>([]);
  const [openedStoreIds, setOpenedStoreIds] = useState<string[]>([]);
  const [lastOpened, setLastOpened] = useState<OpenedReceipt | null>(null);
  const [exclusiveStore, setExclusiveStore] =
    useState<ExclusiveStoreContext | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const submissionLock = useRef(false);
  useEffect(() => {
    const sync = () => {
      const context = readExclusiveStoreContext();
      const cart = readCart();
      const scopedCart = context
        ? cart.filter((item) => item.storeId === context.storeId)
        : cart;

      if (context && scopedCart.length !== cart.length) {
        writeCart(scopedCart);
      }

      setExclusiveStore(context);
      setItems(scopedCart);
      setStoreOptions(readCartStoreOptions());
    };
    sync();
    const saved = window.localStorage.getItem(LAST_OPENED_ORDER_KEY);
    if (saved) {
      try {
        const receipt = JSON.parse(saved) as OpenedReceipt;
        if (Date.now() - receipt.openedAt < 24 * 60 * 60 * 1000)
          setLastOpened(receipt);
        else window.localStorage.removeItem(LAST_OPENED_ORDER_KEY);
      } catch {
        window.localStorage.removeItem(LAST_OPENED_ORDER_KEY);
      }
    }
    return subscribeToCart(sync);
  }, []);
  const groups = useMemo(() => {
    const map = new Map<string, OrderGroup>();
    for (const item of items) {
      const group = map.get(item.storeId) ?? {
        storeId: item.storeId,
        storeName: item.storeName,
        items: [],
      };
      group.items.push(item);
      map.set(item.storeId, group);
    }
    return [...map.values()];
  }, [items]);
  const displayGroups = submitted ? preparedGroups : groups;
  const openedStoreIdSet = useMemo(
    () => new Set(openedStoreIds),
    [openedStoreIds],
  );
  const allOpened =
    submitted &&
    preparedGroups.length > 0 &&
    openedStoreIdSet.size === preparedGroups.length;
  const subtotal = displayGroups.reduce(
    (sum, group) =>
      sum +
      group.items.reduce(
        (groupSum, item) => groupSum + item.price * item.quantity,
        0,
      ),
    0,
  );
  const selectedStoreMethod = (storeId: string) => {
    const methods = contacts[storeId]?.deliveryMethods ?? [];
    return (
      methods.find((method) => method.id === storeDeliveryMethods[storeId]) ??
      methods[0]
    );
  };
  const shippingFee =
    deliveryMethod === "store_delivery"
      ? displayGroups.reduce(
          (sum, group) =>
            sum + (Number(selectedStoreMethod(group.storeId)?.fee) || 0),
          0,
        )
      : 0;
  const total = subtotal + shippingFee;
  const pickupAvailable =
    groups.length > 0 &&
    groups.every((group) => contacts[group.storeId]?.pickupEnabled === true);
  const cashAvailable =
    groups.length > 0 &&
    groups.every((group) => contacts[group.storeId]?.cashEnabled !== false);
  const deliverySelectionReady =
    deliveryMethod !== "store_delivery" ||
    groups.every((group) => {
      const methods = contacts[group.storeId]?.deliveryMethods ?? [];
      return methods.length === 0 || Boolean(selectedStoreMethod(group.storeId)?.id);
    });
  const storesWithoutWhatsApp = groups.filter(
    (group) => !toWhatsAppNumber(contacts[group.storeId]?.phone),
  );
  const valid = Boolean(
    name.trim() &&
      phone.trim() &&
      (deliveryMethod !== "store_delivery" || address.trim()) &&
      (deliveryMethod !== "pickup" || pickupAvailable) &&
      (payment !== "cash" || cashAvailable) &&
      deliverySelectionReady &&
      storesWithoutWhatsApp.length === 0 &&
      items.length,
  );
  const catalogHref = exclusiveStore
    ? `/catalogo/${exclusiveStore.storeSlug}`
    : "/";

  function messageFor(group: OrderGroup) {
    const lines = group.items
      .map(
        (item) =>
          `• ${item.name} x${item.quantity}${Object.entries(item.variantOptions ?? {}).map(([name, value]) => ` · ${name}: ${value}`).join("")} — C$ ${(item.price * item.quantity).toLocaleString("es-NI")}`,
      )
      .join("\n");
    const subtotal = group.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const orderNumber = preparedOrders.find(
      (order) => order.storeId === group.storeId,
    )?.orderNumber;
    const deliveryOption = selectedStoreMethod(group.storeId);
    const deliveryLabel =
      deliveryMethod === "pickup"
        ? `Pick up${contacts[group.storeId]?.pickupAddress ? ` en ${contacts[group.storeId].pickupAddress}` : ""}`
        : deliveryMethod === "own_delivery"
          ? "El cliente coordinará su propio delivery"
          : `${deliveryOption?.name ?? "Delivery de la tienda"} a ${address}${reference ? ` (${reference})` : ""}`;
    const fee =
      deliveryMethod === "store_delivery"
        ? Number(deliveryOption?.fee) || 0
        : 0;
    const options = storeOptions[group.storeId];
    const requestDetails = options?.notes?.trim()
      ? `Nota: ${options.notes.trim()}`
      : "";
    return `Hola ${group.storeName}, quiero confirmar mi pedido${orderNumber ? ` ORD-${orderNumber}` : ""} generado desde ONDIE:\n\n${lines}\n\nSubtotal: C$ ${subtotal.toLocaleString("es-NI")}\nEnvío: C$ ${fee.toLocaleString("es-NI")}\nTotal: C$ ${(subtotal + fee).toLocaleString("es-NI")}\nCliente: ${name}\nWhatsApp: ${phone}\nEntrega: ${deliveryLabel}\nPago: ${payment === "transfer" ? "Transferencia / depósito" : "Efectivo"}${requestDetails ? `\n${requestDetails}` : ""}`;
  }

  function markWhatsAppOpened(group: OrderGroup) {
    if (openedStoreIdSet.has(group.storeId)) return;
    const order = preparedOrders.find((item) => item.storeId === group.storeId);
    const receipt = {
      orderNumber: order?.orderNumber ?? 0,
      storeName: group.storeName,
      openedAt: Date.now(),
    };
    setOpenedStoreIds([...openedStoreIds, group.storeId]);
    setLastOpened(receipt);
    window.localStorage.setItem(LAST_OPENED_ORDER_KEY, JSON.stringify(receipt));
    showNotice({
      tone: "success",
      title: order?.orderNumber
        ? `Pedido ORD-${order.orderNumber} generado`
        : "Pedido generado",
      description: `Tu pedido para ${group.storeName} quedó registrado y fue retirado del carrito.`,
    });
  }

  function dismissReceipt() {
    setLastOpened(null);
    window.localStorage.removeItem(LAST_OPENED_ORDER_KEY);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!valid || submissionLock.current) {
      return;
    }

    submissionLock.current = true;
    setIsSaving(true);
    const retryStorageKey = "ondie-checkout-attempt";

    try {
      const requestBody = JSON.stringify({
        website: "",
        customer: {
          name,
          phone,
          address: deliveryMethod === "store_delivery" ? address : "",
          reference: deliveryMethod === "store_delivery" ? reference : "",
        },
        paymentMethod: payment,
        deliveryMethod,
        groups: groups.map((group) => ({
          storeId: group.storeId,
          deliveryOptionId: selectedStoreMethod(group.storeId)?.id,
          notes: storeOptions[group.storeId]?.notes?.trim() ?? "",
          items: group.items.map((item) => ({
            id: item.id,
            price: item.price,
            quantity: item.quantity,
            variantOptions: item.variantOptions ?? {},
          })),
        })),
      });
      // Keep the same key after a timeout or page reload. A changed cart gets a new key.
      const signature = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(requestBody),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      let previous: { signature?: string; key?: string } | null = null;
      try {
        previous = JSON.parse(
          window.sessionStorage.getItem(retryStorageKey) ?? "null",
        );
      } catch {
        /* Ignore invalid local state. */
      }
      let requestKey =
        previous?.signature === signature && previous.key
          ? previous.key
          : crypto.randomUUID();
      let data: {
        orders?: PreparedOrder[];
        message?: string;
        reportable?: boolean;
        code?: string;
      } | null = null;

      // A previous browser tab can leave an idempotency key tied to an older
      // payload. The database rejects that key before creating any order, so
      // it is safe to retry once with a fresh key instead of making the
      // customer recover manually.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        window.sessionStorage.setItem(
          retryStorageKey,
          JSON.stringify({ signature, key: requestKey }),
        );
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestKey,
            "X-Device-ID": getCheckoutDeviceId(),
          },
          body: requestBody,
        });
        const responseData: {
          orders?: PreparedOrder[];
          message?: string;
          reportable?: boolean;
          code?: string;
          error?: string;
        } | null = await response.json().catch(() => null);
        data = responseData;

        if (response.ok) break;

        if (
          responseData?.code === "CHECKOUT_IDEMPOTENCY_PAYLOAD_MISMATCH" &&
          attempt === 0
        ) {
          window.sessionStorage.removeItem(retryStorageKey);
          requestKey = crypto.randomUUID();
          continue;
        }

        const checkoutError = new Error(
          responseData?.error ?? "No fue posible guardar el pedido.",
        ) as CheckoutError;
        checkoutError.reportable = responseData?.reportable === true;
        checkoutError.name = responseData?.code ?? "CHECKOUT_REQUEST_FAILED";
        throw checkoutError;
      }

      if (!data?.orders || data.orders.length !== groups.length) {
        const checkoutError = new Error(
          "No pudimos confirmar la respuesta. Intenta de nuevo para recuperar tu pedido.",
        ) as CheckoutError;
        checkoutError.name = "CHECKOUT_RESPONSE_INVALID";
        throw checkoutError;
      }
      window.sessionStorage.removeItem(retryStorageKey);
      setPreparedGroups(groups);
      setPreparedOrders(data?.orders ?? []);
      setOpenedStoreIds([]);
      setSubmitted(true);
      clearCart();
      showNotice({
        tone: "success",
        title: "Pedido listo",
        description:
          data?.message ??
          "Tu pedido ya esta listo para enviarse por WhatsApp.",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "CHECKOUT_IDEMPOTENCY_PAYLOAD_MISMATCH",
          "CHECKOUT_INVENTORY_CONFLICT",
        ].includes(error.name)
      ) {
        window.sessionStorage.removeItem(retryStorageKey);
      }
      showNotice({
        tone: "error",
        category: "checkout",
        reportable:
          error instanceof Error && "reportable" in error
            ? (error as CheckoutError).reportable !== false
            : true,
        code:
          error instanceof Error && error.name.startsWith("CHECKOUT_")
            ? error.name
            : "CHECKOUT_NETWORK_ERROR",
        title: "No pudimos preparar tu pedido",
        description:
          error instanceof Error
            ? error.message
            : "Intenta nuevamente en unos minutos.",
      });
    } finally {
      submissionLock.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="order-page">
      <header className="order-header">
        <Link href={catalogHref}>
          <Image
            src="/ondie-logo.png"
            alt="ONDIE"
            width={1051}
            height={310}
            priority
          />
        </Link>
        <label>
          <MagnifyingGlass />
          <input
            aria-label="Buscar productos o tiendas"
            placeholder={
              exclusiveStore
                ? `Buscar en ${exclusiveStore.storeName}...`
                : "Buscar productos o tiendas..."
            }
          />
        </label>
        {!exclusiveStore ? (
          <nav>
            <Link href="/">Tiendas</Link>
          </nav>
        ) : null}
        <div>
          <CartSummary />
          <Link href="/account" aria-label="Mi cuenta">
            <UserCircle />
          </Link>
        </div>
      </header>
      <div className="order-shell">
        <div className="order-breadcrumb">
          <Link href={catalogHref}>
            {exclusiveStore ? exclusiveStore.storeName : "Inicio"}
          </Link>
          <span>/</span>
          <Link href="/cart">Mi carrito</Link>
          <span>/</span>
          <strong>Generar pedido</strong>
        </div>
        <Link href="/cart" className="back-to-cart">
          <ArrowLeft /> Volver al carrito
        </Link>
        <h1>Generar pedido</h1>
        {displayGroups.length ? (
          <form className="order-layout" onSubmit={submit}>
            <div className="order-form-column">
              <section className="order-card">
                <h2>Datos de entrega y contacto</h2>
                <div className="order-field">
                  <label htmlFor="order-name">Nombre completo</label>
                  <input
                    id="order-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Tu nombre y apellido"
                    required
                    disabled={submitted}
                  />
                </div>
                <div className="order-field">
                  <label htmlFor="order-phone">Teléfono / WhatsApp</label>
                  <div>
                    <WhatsappLogo />
                    <input
                      id="order-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="8888 8888"
                      required
                      disabled={submitted}
                    />
                  </div>
                </div>
                <div className="delivery-options">
                  <button
                    type="button"
                    className={deliveryMethod === "pickup" ? "active" : ""}
                    onClick={() => setDeliveryMethod("pickup")}
                    disabled={!pickupAvailable || submitted}
                    title={!pickupAvailable ? "No disponible para todas las tiendas" : undefined}
                  >
                    <Package /> Pick up
                  </button>
                  <button
                    type="button"
                    className={
                      deliveryMethod === "own_delivery" ? "active" : ""
                    }
                    onClick={() => setDeliveryMethod("own_delivery")}
                    disabled={submitted}
                  >
                    <Truck /> Yo enviaré al delivery
                  </button>
                  <button
                    type="button"
                    className={
                      deliveryMethod === "store_delivery" ? "active" : ""
                    }
                    onClick={() => setDeliveryMethod("store_delivery")}
                    disabled={submitted}
                  >
                    <Storefront /> Delivery de tienda
                  </button>
                </div>
                {deliveryMethod === "store_delivery" ? (
                  <>
                    {displayGroups.map((group) =>
                      contacts[group.storeId]?.deliveryMethods?.length ? (
                        <div
                          className="order-field"
                          key={`${group.storeId}-delivery-method`}
                        >
                          <label htmlFor={`delivery-method-${group.storeId}`}>
                            Método de {group.storeName}
                          </label>
                          <select
                            id={`delivery-method-${group.storeId}`}
                            value={selectedStoreMethod(group.storeId)?.id ?? ""}
                            onChange={(event) =>
                              setStoreDeliveryMethods((current) => ({
                                ...current,
                                [group.storeId]: event.target.value,
                              }))
                            }
                            disabled={submitted}
                          >
                            {contacts[group.storeId].deliveryMethods.map(
                              (method) => (
                                <option key={method.id} value={method.id}>
                                  {method.name} · C${" "}
                                  {(Number(method.fee) || 0).toLocaleString(
                                    "es-NI",
                                  )}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      ) : null,
                    )}
                    <div className="order-field">
                      <label htmlFor="order-address">
                        Dirección de entrega
                      </label>
                      <div>
                        <MapPin />
                        <input
                          id="order-address"
                          value={address}
                          onChange={(event) => setAddress(event.target.value)}
                          placeholder="Ciudad, barrio y dirección"
                          required
                          disabled={submitted}
                        />
                      </div>
                    </div>
                    <div className="order-field">
                      <label htmlFor="order-reference">
                        Referencia (opcional)
                      </label>
                      <input
                        id="order-reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Casa, edificio o punto de referencia"
                        disabled={submitted}
                      />
                    </div>
                  </>
                ) : null}
                <p className="order-info">
                  <Info /> Cada tienda se pondrá en contacto contigo para
                  confirmar disponibilidad y entrega.
                </p>
              </section>
              <section className="order-card">
                <h2>Forma de pago</h2>
                <p className="section-helper">
                  El pago se coordina directamente con cada negocio.
                </p>
                <div className="payment-options">
                  <button
                    type="button"
                    className={payment === "transfer" ? "active" : ""}
                    onClick={() => setPayment("transfer")}
                    disabled={submitted}
                  >
                    <Bank /> Transferencia / depósito
                  </button>
                  <button
                    type="button"
                    className={payment === "cash" ? "active" : ""}
                    onClick={() => setPayment("cash")}
                    disabled={!cashAvailable || submitted}
                    title={!cashAvailable ? "No disponible para todas las tiendas" : undefined}
                  >
                    <Money /> Efectivo
                  </button>
                </div>
                <div className="payment-explainer">
                  <ShieldCheck />
                  <span>
                    <strong>Pago directo y transparente</strong>
                    <small>
                      ONDIE no procesa cobros. La tienda te compartirá las
                      instrucciones de pago y confirmará tu pedido.
                    </small>
                  </span>
                </div>
              </section>
            </div>
            <aside className="order-summary-column">
              <section className="order-summary-card">
                <h2>Resumen de tu pedido</h2>
                {displayGroups.map((group) => (
                  <div className="order-store-summary" key={group.storeId}>
                    <header>
                      <div>
                        <Storefront weight="duotone" />
                      </div>
                      <span>
                        <strong>{group.storeName}</strong>
                        <small>
                          {contacts[group.storeId]?.category ?? "Tienda local"}
                        </small>
                      </span>
                      <Link
                        href={
                          exclusiveStore
                            ? catalogHref
                            : `/stores/${contacts[group.storeId]?.slug ?? ""}`
                        }
                      >
                        Ver tienda
                      </Link>
                    </header>
                    {group.items.map((item) => (
                      <div
                        className="order-product"
                        key={`${item.storeId}-${item.id}-${variantKey(item.variantOptions)}`}
                      >
                        <div>
                          {item.image ? (
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              sizes="65px"
                              unoptimized={item.image.includes("/thumbnails/")}
                            />
                          ) : (
                            <Package />
                          )}
                        </div>
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {item.description ?? "Producto de catálogo"}
                          </small>
                          {Object.entries(item.variantOptions ?? {}).map(
                            ([name, value]) => (
                              <small key={`${name}-${value}`}>
                                {name}: {value}
                              </small>
                            ),
                          )}
                          <b>C$ {item.price.toLocaleString("es-NI")}</b>
                        </span>
                        <em>x{item.quantity}</em>
                      </div>
                    ))}
                    {storeOptions[group.storeId]?.notes ? (
                      <div className="order-store-request">
                        <span>📝 {storeOptions[group.storeId].notes}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="order-total-row">
                  <span>
                    Subtotal (
                    {displayGroups.reduce(
                      (count, group) => count + group.items.length,
                      0,
                    )}{" "}
                    productos)
                  </span>
                  <strong>
                    C${" "}
                    {displayGroups
                      .reduce(
                        (sum, group) =>
                          sum +
                          group.items.reduce(
                            (groupSum, item) =>
                              groupSum + item.price * item.quantity,
                            0,
                          ),
                        0,
                      )
                      .toLocaleString("es-NI")}
                  </strong>
                </div>
                <div className="order-total-row">
                  <span>Envío</span>
                  <strong className="coordinate">
                    {shippingFee
                      ? `C$ ${shippingFee.toLocaleString("es-NI")}`
                      : "Sin costo"}
                  </strong>
                </div>
                <div className="order-grand-total">
                  <span>Total a pagar</span>
                  <strong>C$ {total.toLocaleString("es-NI")}</strong>
                </div>
                <div className="important-note">
                  <ShieldCheck />
                  <span>
                    <strong>Importante</strong>
                    <small>
                      La tienda confirmará disponibilidad, entrega y pago por
                      WhatsApp.
                    </small>
                  </span>
                </div>
              </section>
              <section className="whatsapp-submit-card">
                <h2>
                  {allOpened ? "Chats abiertos" : "Enviar pedido por WhatsApp"}
                </h2>
                <p>
                  {allOpened
                    ? "Ya quitamos estos productos del carrito para evitar pedidos duplicados."
                    : "Se preparará un mensaje independiente para cada tienda."}
                </p>
                {!submitted && storesWithoutWhatsApp.length > 0 ? (
                  <p role="alert" className="checkout-whatsapp-warning">
                    No se puede enviar el pedido porque falta un número de
                    WhatsApp válido de Nicaragua (+505 y ocho dígitos) en: {storesWithoutWhatsApp
                      .map((group) => group.storeName)
                      .join(", ")}.
                  </p>
                ) : null}
                {submitted ? (
                  <div className="ready-order">
                    <Check />
                    <span>
                      <strong>
                        {allOpened
                          ? "WhatsApp abierto"
                          : "¡Tu pedido está listo!"}
                      </strong>
                      <small>
                        {allOpened
                          ? "Pulsa Enviar en cada conversación para compartir el pedido."
                          : "Abre cada conversación y pulsa Enviar en WhatsApp."}
                      </small>
                    </span>
                  </div>
                ) : null}
                {submitted ? (
                  displayGroups.map((group) => {
                    const opened = openedStoreIdSet.has(group.storeId);
                    const href = whatsAppMessageUrl(
                      contacts[group.storeId]?.phone,
                      messageFor(group),
                    );
                    if (!href)
                      return (
                        <p
                          role="alert"
                          className="checkout-whatsapp-warning"
                          key={group.storeId}
                        >
                          No hay un WhatsApp válido con +505 para {group.storeName}.
                        </p>
                      );
                    return (
                      <a
                        key={group.storeId}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="send-whatsapp"
                        onClick={() => markWhatsAppOpened(group)}
                      >
                        <WhatsappLogo weight="fill" />{" "}
                        {opened
                          ? "Volver a abrir WhatsApp de"
                          : "Abrir WhatsApp de"}{" "}
                        {group.storeName}
                      </a>
                    );
                  })
                ) : (
                  <button
                    className="prepare-order"
                    type="submit"
                    disabled={!valid || isSaving}
                  >
                    <WhatsappLogo weight="fill" />{" "}
                    {isSaving ? "Guardando pedido..." : "Preparar pedido"}{" "}
                    <ArrowRight />
                  </button>
                )}
                {allOpened ? (
                  <Link href={catalogHref} className="continue-shopping">
                    Seguir comprando <ArrowRight />
                  </Link>
                ) : null}
                <p className="privacy-order">
                  <LockKey /> Tus datos se usan para gestionar tu pedido
                  conforme a nuestra{" "}
                  <Link href="/privacidad">Política de privacidad</Link>.
                  Consulta los{" "}
                  <Link href="/terminos">Términos y condiciones</Link>.
                </p>
              </section>
            </aside>
          </form>
        ) : (
          <section className="order-empty">
            {lastOpened ? (
              <>
                <Check />
                <h2>Pedido ORD-{lastOpened.orderNumber || "—"} generado</h2>
                <p>
                  Abriste WhatsApp de {lastOpened.storeName}. Confirma que hayas
                  enviado el mensaje. El carrito quedó limpio.
                </p>
                <Link href={catalogHref}>
                  Seguir comprando <ArrowRight />
                </Link>
              </>
            ) : (
              <>
                <Package />
                <h2>No hay productos para generar un pedido</h2>
                <Link href={catalogHref}>
                  {exclusiveStore ? "Volver al catálogo" : "Explorar tiendas"}{" "}
                  <ArrowRight />
                </Link>
              </>
            )}
          </section>
        )}
        <section className="order-benefits">
          <div>
            <ShieldCheck />
            <span>
              <strong>Compra segura</strong>
              <small>Tus datos están protegidos</small>
            </span>
          </div>
          <div>
            <Truck />
            <span>
              <strong>Envíos coordinados</strong>
              <small>Acuerda la entrega con la tienda</small>
            </span>
          </div>
          <div>
            <WhatsappLogo />
            <span>
              <strong>Atención directa</strong>
              <small>Comunícate por WhatsApp</small>
            </span>
          </div>
        </section>
      </div>
      {lastOpened ? (
        <div
          className="order-return-confirmation"
          role="status"
          aria-live="polite"
        >
          <span>
            <Check weight="bold" />
          </span>
          <div>
            <strong>
              {lastOpened.orderNumber
                ? `Pedido ORD-${lastOpened.orderNumber} generado correctamente`
                : "Pedido generado correctamente"}
            </strong>
            <small>
              Abriste WhatsApp de {lastOpened.storeName}. Pulsa Enviar allí para
              compartir el pedido. Limpiamos el carrito.
            </small>
          </div>
          <button
            type="button"
            aria-label="Cerrar confirmación del pedido"
            onClick={dismissReceipt}
          >
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
