"use client";

import { useEffect, useState } from "react";
import { readCart, subscribeToCart, type CartItem } from "@/lib/cart";
import { supabase } from "@/lib/supabase";
import { LoginGate } from "@/components/login-gate";

export function CheckoutClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const syncCart = () => setItems(readCart());
    syncCart();

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    return subscribeToCart(syncCart);
  }, []);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div className="checkout-grid">
      <div className="card stack">
        <span className="eyebrow">Tu pedido</span>
        <h2>Resumen</h2>
        {items.length === 0 ? <p className="muted">Tu carrito esta vacio.</p> : null}
        <div className="list">
          {items.map((item) => (
            <div key={`${item.storeId}-${item.id}`} className="line">
              <div className="stack">
                <strong>{item.name}</strong>
                <span className="muted">{item.storeName} · x{item.quantity}</span>
              </div>
              <span className="price">${item.price * item.quantity}</span>
            </div>
          ))}
        </div>
        <div className="line">
          <strong>Total</strong>
          <strong className="price">${total}</strong>
        </div>
      </div>

      {userEmail ? (
        <div className="card stack">
          <span className="eyebrow">Cliente autenticado</span>
          <h3>Sesion activa</h3>
          <p className="muted">Continuas como {userEmail}. Aqui luego conectamos ordenes/pagos.</p>
          <button className="button">Continuar al pago</button>
        </div>
      ) : (
        <LoginGate />
      )}
    </div>
  );
}
