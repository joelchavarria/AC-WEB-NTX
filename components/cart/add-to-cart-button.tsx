"use client";

import { Minus, Plus, ShoppingCartSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { addToCart, readCart, subscribeToCart, updateCartQuantity } from "@/lib/cart";
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
  const [quantity, setQuantity] = useState(0);
  const unavailable = product.fulfillment_mode === "inmediato" && product.stock < 1;

  useEffect(() => {
    const sync = () => setQuantity(readCart().find((item) => item.id === product.id && item.storeId === storeId)?.quantity ?? 0);
    sync();
    return subscribeToCart(sync);
  }, [product.id, storeId]);

  if (quantity > 0) return <div className="product-quantity-control" aria-label={`Cantidad de ${product.name}`}>
    <button type="button" aria-label="Reducir cantidad" onClick={() => updateCartQuantity(product.id, storeId, quantity - 1)}><Minus weight="bold" /></button>
    <span><small>En carrito</small><strong>{quantity}</strong></span>
    <button type="button" aria-label="Aumentar cantidad" disabled={product.fulfillment_mode === "inmediato" && quantity >= product.stock} onClick={() => addToCart({ ...product, storeId, storeName, storeSlug, quantity: 1 })}><Plus weight="bold" /></button>
  </div>;

  return (
    <button
      className="button add-to-cart-button"
      disabled={unavailable}
      onClick={() => {
        addToCart({ ...product, storeId, storeName, storeSlug, quantity: 1 });
      }}
      aria-live="polite"
    >
      {unavailable ? "Agotado" : <><span className="cart-button-icon"><ShoppingCartSimple weight="bold" /></span><span>Agregar al carrito</span></>}
    </button>
  );
}
