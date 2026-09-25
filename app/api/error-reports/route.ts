import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_TEXT_LENGTH = 1200;
const recentReports = new Map<string, number>();
const categories = new Set([
  "checkout",
  "auth",
  "catalog",
  "cart",
  "system",
]);
const categoryLabels: Record<string, string> = {
  checkout: "Pedidos y checkout",
  auth: "Acceso y cuentas",
  catalog: "Catálogo",
  cart: "Carrito",
  system: "Sistema web",
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "frame-ancestors 'none'",
    },
  });
}

function text(value: unknown, max = MAX_TEXT_LENGTH) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max)
    : "";
}

function clientKey(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey || !supabaseUrl.startsWith("https://")) {
    return response({ error: "El registro de reportes no está disponible." }, 503);
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return response({ error: "Origen no permitido." }, 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return response({ error: "Origen no permitido." }, 403);
  }

  const key = clientKey(request);
  const now = Date.now();
  const lastReport = recentReports.get(key) ?? 0;
  if (now - lastReport < 15_000) {
    return response(
      { error: "Espera unos segundos antes de enviar otro reporte." },
      429,
    );
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8_000) return response({ error: "Reporte demasiado grande." }, 413);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return response({ error: "Reporte inválido." }, 400);
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return response({ error: "Reporte inválido." }, 400);
  }

  const title = text(payload.title, 180);
  const description = text(payload.description);
  const category = categories.has(String(payload.category))
    ? String(payload.category)
    : "system";
  const code = /^[A-Z0-9_.-]{1,80}$/.test(String(payload.code))
    ? String(payload.code)
    : "USER_REPORTED_ERROR";
  let pageUrl = "desconocida";
  try {
    const submittedUrl = new URL(text(payload.pageUrl, 500), request.url);
    const requestUrl = new URL(request.url);
    if (submittedUrl.origin === requestUrl.origin) {
      pageUrl = `${submittedUrl.pathname}${submittedUrl.search}`;
    }
  } catch {
    // Keep only a normalized fallback for malformed client data.
  }
  const userAgent = text(payload.userAgent, 500);
  if (!title) return response({ error: "El reporte no tiene un título." }, 400);

  recentReports.set(key, now);
  for (const [storedKey, timestamp] of recentReports) {
    if (now - timestamp > 60_000) recentReports.delete(storedKey);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const referenceId = randomUUID();
  const { error } = await supabase.from("app_errors").insert({
    reference_id: referenceId,
    scope: `web.${category}`,
    action: "user_report",
    message: title,
    details: {
      schema_version: 1,
      module: categoryLabels[category],
      layer: "Web",
      error_code: code,
      description,
      category,
      page_url: pageUrl,
      user_agent: userAgent,
      source: "web-notification",
      reported_at: new Date(now).toISOString(),
    },
  });

  if (error) {
    console.error("Could not save user error report", { code: error.code });
    return response({ error: "No pudimos registrar el reporte." }, 500);
  }

  return response({ referenceId });
}
