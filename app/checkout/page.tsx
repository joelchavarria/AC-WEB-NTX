import Link from "next/link";
import { CheckoutClient } from "@/components/checkout-client";

export default function CheckoutPage() {
  return (
    <main className="page">
      <div className="shell stack">
        <div className="row">
          <Link href="/" className="button secondary">
            Volver al inicio
          </Link>
        </div>
        <section className="hero split">
          <div className="stack">
            <span className="eyebrow">Checkout</span>
            <h1>Una salida limpia, confiable y enfocada en cerrar la compra.</h1>
            <p className="muted">La exploracion del catalogo sigue siendo publica. La autenticacion aparece solo cuando ya existe intencion real de compra.</p>
          </div>
          <div className="hero-panel stack">
            <span className="eyebrow">Confianza</span>
            <h3>Menos friccion arriba, control total abajo.</h3>
            <p className="muted">Este flujo mejora descubrimiento sin sacrificar seguridad en ordenes, direcciones y pagos.</p>
          </div>
        </section>
        <CheckoutClient />
      </div>
    </main>
  );
}
