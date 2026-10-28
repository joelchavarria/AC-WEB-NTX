"use client";

import { Minus, Plus, ShoppingCartSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { addToCart, readCart, subscribeToCart, updateCartQuantity, variantKey } from "@/lib/cart";
import { getProductAvailability, normalizeFulfillmentMode } from "@/lib/product-availability";
import type { Product } from "@/lib/supabase";

export function AddToCartButton({
  product,
  storeId,
  storeName,
  storeSlug,
  variantOptions,
  disabled = false,
  disabledLabel = "Selecciona las opciones",
}: {
  product: Product;
  storeId: string;
  storeName: string;
  storeSlug?: string;
  variantOptions?: Record<string, string>;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const [quantity, setQuantity] = useState(0);
  const availability = getProductAvailability(
    product.stock,
    product.fulfillment_mode,
  );
  const variantStock = product.variant_inventory?.length
    ? product.variant_inventory.find(
        (entry) =>
          entry.enabled !== false &&
          variantKey(entry.options) === variantKey(variantOptions),
      )?.stock ?? 0
    : product.stock;
  const variantAvailable =
    normalizeFulfillmentMode(product.fulfillment_mode) !== "inmediato" ||
    variantStock > 0;
  const cartProduct = {
    ...product,
    image: product.thumbnail ?? product.image,
  };

  useEffect(() => {
    const sync = () => setQuantity(readCart().find((item) => item.id === product.id && item.storeId === storeId && variantKey(item.variantOptions) === variantKey(variantOptions))?.quantity ?? 0);
    sync();
    return subscribeToCart(sync);
  }, [product.id, storeId, variantOptions]);

  if (quantity > 0) return <div className="product-quantity-control" aria-label={`Cantidad de ${product.name}`}>
    <button type="button" aria-label="Reducir cantidad" onClick={() => updateCartQuantity(product.id, storeId, quantity - 1, variantOptions)}><Minus weight="bold" /></button>
    <span><small>En carrito</small><strong>{quantity}</strong></span>
    <button type="button" aria-label="Aumentar cantidad" disabled={normalizeFulfillmentMode(product.fulfillment_mode) === "inmediato" && quantity >= variantStock} onClick={() => addToCart({ ...cartProduct, storeId, storeName, storeSlug, variantOptions, quantity: 1 })}><Plus weight="bold" /></button>
  </div>;

  return (
    <button
      className="button add-to-cart-button"
      disabled={!availability.canAdd || !variantAvailable || disabled}
      aria-disabled={!availability.canAdd || !variantAvailable || disabled}
      onClick={() => {
        addToCart({ ...cartProduct, storeId, storeName, storeSlug, variantOptions, quantity: 1 });
      }}
      aria-live="polite"
    >
      {!availability.canAdd || !variantAvailable ? "Agotado" : disabled ? disabledLabel : <><span className="cart-button-icon"><ShoppingCartSimple weight="bold" /></span><span>{availability.kind === "on-demand" ? "Pedir por encargo" : "Agregar al carrito"}</span></>}
    </button>
  );
}
