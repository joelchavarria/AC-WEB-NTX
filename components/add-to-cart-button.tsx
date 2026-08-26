"use client";

import { useState } from "react";
import { addToCart } from "@/lib/cart";
import type { Product } from "@/lib/supabase";

export function AddToCartButton({
  product,
  storeId,
  storeName,
}: {
  product: Product;
  storeId: string;
  storeName: string;
}) {
  const [added, setAdded] = useState(false);

  return (
    <button
      className="button"
      onClick={() => {
        addToCart({ ...product, storeId, storeName, quantity: 1 });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
    >
      {added ? "Agregado" : "Agregar al carrito"}
    </button>
  );
}
