export type FulfillmentMode = "inmediato" | "encargo";

export type ProductAvailability = {
  kind: "on-demand" | "out-of-stock" | "low-stock" | "in-stock";
  label: string;
  canAdd: boolean;
  badgeClass:
    | "product-badge--order"
    | "product-badge--out"
    | "product-badge--sale"
    | null;
  statusClass: "order-mode" | "out-of-stock" | "low-stock" | "in-stock";
};

/** Normalize the legacy `posterior` value used by older web records. */
export function normalizeFulfillmentMode(
  value: string | null | undefined,
): FulfillmentMode {
  return value?.trim().toLowerCase() === "inmediato" ? "inmediato" : "encargo";
}

export function getProductAvailability(
  stock: number,
  fulfillmentMode: string | null | undefined,
): ProductAvailability {
  if (normalizeFulfillmentMode(fulfillmentMode) === "encargo") {
    return {
      kind: "on-demand",
      label: "Por encargo",
      canAdd: true,
      badgeClass: "product-badge--order",
      statusClass: "order-mode",
    };
  }

  if (stock < 1) {
    return {
      kind: "out-of-stock",
      label: "Agotado",
      canAdd: false,
      badgeClass: "product-badge--out",
      statusClass: "out-of-stock",
    };
  }

  if (stock <= 5) {
    return {
      kind: "low-stock",
      label: `Últimas ${stock}`,
      canAdd: true,
      badgeClass: "product-badge--sale",
      statusClass: "low-stock",
    };
  }

  return {
    kind: "in-stock",
    label: "En stock",
    canAdd: true,
    badgeClass: null,
    statusClass: "in-stock",
  };
}
