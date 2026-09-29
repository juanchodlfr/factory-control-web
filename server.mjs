import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FACTORY_CONTROL_OPERATIONS = Object.freeze(new Set([
  "factory_control_v020_board_read",
  "factory_control_v020_overview_read",
  "factory_control_v020_work_item_drawer_read",
  "factory_control_v020_agent_presentation_update",
  "factory_control_v020_agent_icon_put",
]));
const SESSION_COOKIE = "fc_session";
const CSRF_COOKIE = "fc_csrf";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_LIMIT = 20;
const LOGIN_WINDOW_MS = 60_000;
const DEFAULT_JSON_LIMIT = 65_536;
const ICON_JSON_LIMIT = 786_432;
const ICON_OPERATION = "factory_control_v020_agent_icon_put";
const STATIC_TYPES = Object.freeze({ ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" });

function base64url(value) { return Buffer.from(value).toString("base64url"); }
function fromBase64url(value) { return Buffer.from(value, "base64url"); }
function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left)), b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim(), value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}
function cookie(name, value, { httpOnly = false, maxAge = null } = {}) {
  const parts = [`${name}=${value}`, "Path=/", "Secure", "SameSite=Strict"];
  if (httpOnly) parts.push("HttpOnly");
  if (Number.isInteger(maxAge)) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}
function securityHeaders(extra = {}) {
  return {
    "content-security-policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; script-src 'self'; style-src 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    ...extra,
  };
}
function response(status, body = "", headers = {}) { return new Response(body, { status, headers: securityHeaders(headers) }); }
function json(status, payload, headers = {}) { return response(status, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }); }
function redirect(location) { return response(303, "", { location, "cache-control": "no-store" }); }
function exactOriginAllowed(request, config) {
  if (request.headers.get("origin") !== config.publicOrigin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}
async function readBoundedBody(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) { const error = new Error("REQUEST_TOO_LARGE"); error.status = 413; throw error; }
  if (!request.body) return "";
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { try { await reader.cancel(); } catch {} const error = new Error("REQUEST_TOO_LARGE"); error.status = 413; throw error; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}
function validateConfig(env) {
  const publicOrigin = String(env.FACTORY_CONTROL_PUBLIC_ORIGIN || "").replace(/\/+$/, "");
  const gatewayUrl = String(env.FACTORY_CONTROL_GATEWAY_URL || "").replace(/\/+$/, "");
  const iconPublicBaseUrl = String(env.FACTORY_CONTROL_ICON_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const adminHash = String(env.FACTORY_CONTROL_ADMIN_TOKEN_SHA256 || "").toLowerCase();
  const sessionSecret = String(env.FACTORY_CONTROL_SESSION_SECRET || "");
  const controlKey = String(env.FACTORY_CONTROL_KEY || "");
  let publicUrl, gateway, iconBase = null;
  try { publicUrl = new URL(publicOrigin); } catch { throw new Error("FACTORY_CONTROL_PUBLIC_ORIGIN_INVALID"); }
  try { gateway = new URL(gatewayUrl); } catch { throw new Error("FACTORY_CONTROL_GATEWAY_URL_INVALID"); }
  if (publicUrl.protocol !== "https:" || publicUrl.origin !== publicOrigin) throw new Error("FACTORY_CONTROL_PUBLIC_ORIGIN_INVALID");
  if (gateway.protocol !== "https:" || gateway.username || gateway.password) throw new Error("FACTORY_CONTROL_GATEWAY_URL_INVALID");
  if (!/^[0-9a-f]{64}$/.test(adminHash)) throw new Error("FACTORY_CONTROL_ADMIN_TOKEN_SHA256_INVALID");
  if (sessionSecret.length < 32) throw new Error("FACTORY_CONTROL_SESSION_SECRET_INVALID");
  if (controlKey.length < 24 || controlKey.length > 512) throw new Error("FACTORY_CONTROL_KEY_INVALID");
  if (safeEqual(sha256Hex(controlKey), adminHash)) throw new Error("FACTORY_CONTROL_AUTH_SECRETS_MUST_BE_DISTINCT");
  if (iconPublicBaseUrl) {
    try { iconBase = new URL(iconPublicBaseUrl); } catch { throw new Error("FACTORY_CONTROL_ICON_PUBLIC_BASE_URL_INVALID"); }
    if (iconBase.protocol !== "https:" || iconBase.username || iconBase.password) throw new Error("FACTORY_CONTROL_ICON_PUBLIC_BASE_URL_INVALID");
  }
  return { publicOrigin, gatewayUrl, iconPublicBaseUrl: iconBase ? iconPublicBaseUrl : "", adminHash, sessionSecret, controlKey };
}
function signSession(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}
function verifySession(value, secret, nowMs) {
  if (!value || !value.includes(".")) return null;
  const [encoded, signature, ...extra] = value.split(".");
  if (extra.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(fromBase64url(encoded).toString("utf8"));
    if (payload?.v !== 1 || typeof payload?.exp !== "number" || payload.exp <= nowMs || typeof payload?.nonce !== "string" || !/^[0-9a-f]{64}$/.test(payload?.csrf_sha256 || "")) return null;
    return payload;
  } catch { return null; }
}
function csrfValid(request, cookies, session) {
  const cookieValue = cookies[CSRF_COOKIE] || "", headerValue = request.headers.get("x-csrf-token") || "";
  return cookieValue.length >= 32 && safeEqual(cookieValue, headerValue) && safeEqual(sha256Hex(cookieValue), session?.csrf_sha256 || "");
}
function loginHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Factory Control sign in</title></head><body><main><h1>Factory Control</h1><p>Owner/admin authentication is required.</p><form method="post" action="/auth/login"><label>Admin token <input type="password" name="token" autocomplete="current-password" required></label><button type="submit">Sign in</button></form></main></body></html>`;
}
function staticPath(root, pathname) {
  const target = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!(target === "index.html" || target.startsWith("src/"))) return null;
  const normalized = normalize(target).replace(/^(\.\.(\/|\\|$))+/, "");
  if (normalized !== target || target.includes("\\") || target.includes("\0")) return null;
  return join(root, normalized);
}
function createLoginLimiter(now) {
  let startedAt = 0, count = 0;
  return { consume() {
    const current = now();
    if (!startedAt || current - startedAt >= LOGIN_WINDOW_MS) { startedAt = current; count = 1; return; }
    if (++count > LOGIN_LIMIT) { const error = new Error("LOGIN_RATE_LIMITED"); error.status = 429; throw error; }
  } };
}

export function createFactoryControlHandler({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), random = (size) => randomBytes(size), staticRoot = dirname(fileURLToPath(import.meta.url)) } = {}) {
  const config = validateConfig(env);
  if (typeof fetchImpl !== "function") throw new Error("FETCH_REQUIRED");
  const loginLimiter = createLoginLimiter(now);
  return async function handle(request) {
    let url;
    try { url = new URL(request.url); } catch { return json(400, { error: "INVALID_URL" }); }
    const cookies = parseCookies(request.headers.get("cookie"));
    const session = verifySession(cookies[SESSION_COOKIE], config.sessionSecret, now());
    const pathname = url.pathname;
    if (pathname === "/healthz" && request.method === "GET") return json(200, { ok: true, service: "factory-control-web" });
    if (pathname === "/login" && request.method === "GET") {
      if (session) return redirect("/");
      return response(200, loginHtml(), { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    }
    if (pathname === "/auth/login" && request.method === "POST") {
      try { loginLimiter.consume(); } catch { return json(429, { error: "LOGIN_RATE_LIMITED" }, { "retry-after": "60" }); }
      if (!exactOriginAllowed(request, config)) return json(403, { error: "ORIGIN_DENIED" });
      let raw;
      try { raw = await readBoundedBody(request, 8_192); } catch (error) { return json(error.status || 400, { error: error.message }); }
      const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      let token = "";
      if (type === "application/x-www-form-urlencoded") token = new URLSearchParams(raw).get("token") || "";
      else if (type === "application/json") { try { token = String(JSON.parse(raw)?.token || ""); } catch { return json(400, { error: "INVALID_JSON" }); } }
      else return json(415, { error: "UNSUPPORTED_MEDIA_TYPE" });
      if (token.length < 24 || token.length > 512 || !safeEqual(sha256Hex(token), config.adminHash)) return json(401, { error: "ADMIN_AUTH_DENIED" });
      const csrf = random(24).toString("base64url");
      const sessionValue = signSession({ v: 1, exp: now() + SESSION_TTL_MS, nonce: random(18).toString("base64url"), csrf_sha256: sha256Hex(csrf) }, config.sessionSecret);
      const headers = new Headers(securityHeaders({ location: "/", "cache-control": "no-store" }));
      headers.append("set-cookie", cookie(SESSION_COOKIE, sessionValue, { httpOnly: true, maxAge: Math.floor(SESSION_TTL_MS / 1000) }));
      headers.append("set-cookie", cookie(CSRF_COOKIE, csrf, { maxAge: Math.floor(SESSION_TTL_MS / 1000) }));
      return new Response("", { status: 303, headers });
    }
    if (pathname === "/auth/logout" && request.method === "POST") {
      if (!session) return json(401, { error: "AUTH_REQUIRED" });
      if (!exactOriginAllowed(request, config) || !csrfValid(request, cookies, session)) return json(403, { error: "CSRF_ORIGIN_DENIED" });
      const headers = new Headers(securityHeaders({ location: "/login", "cache-control": "no-store" }));
      headers.append("set-cookie", cookie(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 }));
      headers.append("set-cookie", cookie(CSRF_COOKIE, "", { maxAge: 0 }));
      return new Response("", { status: 303, headers });
    }
    if (pathname.startsWith("/api/factory-control/")) {
      if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
      if (!session) return json(401, { error: "AUTH_REQUIRED" });
      if (!exactOriginAllowed(request, config)) return json(403, { error: "ORIGIN_DENIED" });
      if (!csrfValid(request, cookies, session)) return json(403, { error: "CSRF_DENIED" });
      const operation = decodeURIComponent(pathname.slice("/api/factory-control/".length));
      if (!FACTORY_CONTROL_OPERATIONS.has(operation) || operation.includes("/")) return json(404, { error: "OPERATION_NOT_ALLOWED" });
      const type = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (type !== "application/json") return json(415, { error: "UNSUPPORTED_MEDIA_TYPE" });
      let raw;
      try { raw = await readBoundedBody(request, operation === ICON_OPERATION ? ICON_JSON_LIMIT : DEFAULT_JSON_LIMIT); } catch (error) { return json(error.status || 400, { error: error.message }); }
      try { if (raw) JSON.parse(raw); } catch { return json(400, { error: "INVALID_JSON" }); }
      let upstream;
      try {
        upstream = await fetchImpl(`${config.gatewayUrl}/${encodeURIComponent(operation)}`, { method: "POST", headers: { "content-type": "application/json", "accept": "application/json", "x-factory-control-key": config.controlKey }, body: raw || "{}", redirect: "error", signal: AbortSignal.timeout(10_000) });
      } catch { return json(502, { error: "UPSTREAM_UNAVAILABLE" }); }
      return response(upstream.status, await upstream.text(), { "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8", "cache-control": "no-store" });
    }
    if (pathname.startsWith("/agent-icons/")) {
      if (request.method !== "GET") return response(405, "");
      if (!session) return response(401, "");
      if (!config.iconPublicBaseUrl) return response(404, "");
      const objectPath = pathname.slice("/agent-icons/".length);
      if (!objectPath || objectPath.includes("..") || objectPath.includes("\\") || objectPath.includes("\0")) return response(400, "");
      const iconUrl = new URL(objectPath.split("/").map(encodeURIComponent).join("/"), `${config.iconPublicBaseUrl}/`);
      let upstream;
      try { upstream = await fetchImpl(iconUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000) }); } catch { return response(502, ""); }
      if (!upstream.ok) return response(upstream.status, "");
      const mediaType = upstream.headers.get("content-type") || "";
      if (!(mediaType.startsWith("image/png") || mediaType.startsWith("image/webp"))) return response(502, "");
      return response(200, await upstream.arrayBuffer(), { "content-type": mediaType, "cache-control": "private, max-age=300" });
    }
    if (!session) return redirect("/login");
    if (request.method !== "GET" && request.method !== "HEAD") return response(405, "");
    const filePath = staticPath(staticRoot, pathname);
    if (!filePath) return response(404, "");
    try { const data = await readFile(filePath); return response(200, request.method === "HEAD" ? "" : data, { "content-type": STATIC_TYPES[extname(filePath)] || "application/octet-stream", "cache-control": "no-store" }); }
    catch { return response(404, ""); }
  };
}
function requestFromNode(req) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`), init = { method: req.method, headers: req.headers };
  if (req.method !== "GET" && req.method !== "HEAD") { init.body = req; init.duplex = "half"; }
  return new Request(url, init);
}
async function sendNodeResponse(nodeResponse, webResponse) {
  nodeResponse.statusCode = webResponse.status;
  for (const [key, value] of webResponse.headers) nodeResponse.setHeader(key, value);
  const setCookies = webResponse.headers.getSetCookie?.();
  if (setCookies?.length) nodeResponse.setHeader("set-cookie", setCookies);
  nodeResponse.end(Buffer.from(await webResponse.arrayBuffer()));
}
export function startFactoryControlServer(options = {}) {
  const handler = createFactoryControlHandler(options), port = Number(options.port ?? process.env.PORT ?? 8787), host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const server = createServer(async (req, res) => { try { await sendNodeResponse(res, await handler(requestFromNode(req))); } catch { await sendNodeResponse(res, json(500, { error: "INTERNAL_ERROR" })); } });
  server.listen(port, host, () => console.log(`factory-control-web listening on ${host}:${port}`));
  return server;
}
const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) startFactoryControlServer();
