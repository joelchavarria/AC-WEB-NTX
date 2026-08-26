"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCart, subscribeToCart, type CartItem } from "@/lib/cart";

export function CartSummary() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const syncCart = () => setItems(readCart());
    syncCart();

    return subscribeToCart(syncCart);
  }, []);

  const count = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <Link href="/checkout" className="button secondary">
      Carrito {count > 0 ? `(${count})` : ""}
    </Link>
  );
}
