const DEFAULT_WEB_ORIGIN = "https://ondie.devtester.lat";

export function getCorsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store",
    Vary: "Origin",
  };
  const origin = request.headers.get("origin");
  const configured = Deno.env.get("APP_WEB_ORIGINS") ?? DEFAULT_WEB_ORIGIN;
  const allowed = configured.split(",").map((value) => {
    try {
      return new URL(value.trim()).origin;
    } catch {
      return null;
    }
  });
  try {
    const normalized = origin ? new URL(origin).origin : null;
    if (normalized && allowed.includes(normalized)) {
      headers["Access-Control-Allow-Origin"] = normalized;
    }
  } catch {
    // Invalid Origin is simply not reflected.
  }
  return headers;
}
