"use client";

import { Check, ShoppingCartSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { addToCart } from "@/lib/cart";
import type { Product } from "@/lib/supabase";

export function AddToCartButton({
  product,
  storeId,
  storeName,
  storeSlug,
}: {
  product: Product;
  storeId: string;
  storeName: string;
  storeSlug?: string;
}) {
  const [added, setAdded] = useState(false);
  const unavailable = product.fulfillment_mode === "inmediato" && product.stock < 1;

  return (
    <button
      className={`button add-to-cart-button${added ? " is-added" : ""}`}
      disabled={unavailable}
      onClick={() => {
        addToCart({ ...product, storeId, storeName, storeSlug, quantity: 1 });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1500);
      }}
      aria-live="polite"
    >
      {unavailable ? "Agotado" : <><span className="cart-button-icon"><ShoppingCartSimple weight="bold" />{added ? <Check weight="bold" /> : null}</span><span>{added ? "Producto en carrito" : "Agregar al carrito"}</span></>}
    </button>
  );
}
