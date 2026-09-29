import { createFactoryControlHandler } from "../server.mjs";

const CONSENT_TARGET = "https://hgrinvdxkbqggwgbzpge.supabase.co/functions/v1/factory-mcp-oauth/authorize";
const STATIC_ASSET_PATHS = new Set([
  "/",
  "/index.html",
  "/src/app.mjs",
  "/src/api.mjs",
  "/src/model.mjs",
  "/src/styles.css",
]);

const STATIC_SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "cache-control": "no-store",
});

let handler;

function v020Handler(env) {
  if (!handler) handler = createFactoryControlHandler({ env });
  return handler;
}

export function shouldFallbackToAsset(request, response) {
  if (response.status !== 404) return false;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return STATIC_ASSET_PATHS.has(new URL(request.url).pathname);
}

function secureAssetResponse(assetResponse) {
  const headers = new Headers(assetResponse.headers);
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) headers.set(key, value);
  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/oauth/consent") {
      const target = new URL(CONSENT_TARGET);
      target.search = url.search;
      return Response.redirect(target.toString(), 302);
    }

    let response;
    try {
      response = await v020Handler(env)(request);
    } catch {
      return new Response(JSON.stringify({ error: "FACTORY_CONTROL_DEPLOYMENT_CONFIG_INVALID" }), {
        status: 503,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (shouldFallbackToAsset(request, response)) {
      return secureAssetResponse(await env.ASSETS.fetch(request));
    }
    return response;
  },
};
