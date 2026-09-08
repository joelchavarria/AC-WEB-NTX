"use client";

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
      className="button"
      disabled={unavailable}
      onClick={() => {
        addToCart({ ...product, storeId, storeName, storeSlug, quantity: 1 });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
    >
      {unavailable ? "Agotado" : added ? "Agregado" : "Agregar al carrito"}
    </button>
  );
}
