const OPERATIONS = Object.freeze({
  board: "factory_control_v020_board_read",
  overview: "factory_control_v020_overview_read",
  drawer: "factory_control_v020_work_item_drawer_read",
  displayName: "factory_control_v020_agent_presentation_update",
  icon: "factory_control_v020_agent_icon_put"
});

export class ApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function operationUrl(base, operation, origin) {
  const cleanBase = String(base || "/api/factory-control").replace(/\/+$/, "");
  const url = new URL(`${cleanBase}/${encodeURIComponent(operation)}`, origin);
  if (url.origin !== new URL(origin).origin) {
    throw new ApiError("Factory Control API must remain same-origin.", { code: "CROSS_ORIGIN_API_REJECTED" });
  }
  return url;
}

export function csrfToken(cookieString = globalThis.document?.cookie || "") {
  for (const part of String(cookieString).split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "fc_csrf") return rest.join("=");
  }
  return "";
}

export async function callOperation(operation, payload = {}, {
  base = "/api/factory-control",
  origin = globalThis.location?.origin || "http://localhost",
  fetchImpl = globalThis.fetch,
  signal,
  csrf = csrfToken()
} = {}) {
  if (typeof fetchImpl !== "function") throw new ApiError("Fetch is unavailable.");
  if (!csrf) throw new ApiError("Factory Control session is missing CSRF state.", { code: "CSRF_REQUIRED" });
  const url = operationUrl(base, operation, origin);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(payload),
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Factory Control gateway is unavailable.", { code: "NETWORK_ERROR" });
  }
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok || body?.error) {
    const code = body?.error || `HTTP_${response.status}`;
    throw new ApiError(`Gateway request failed: ${code}`, { status: response.status, code });
  }
  if (body?.ok === false) throw new ApiError("Gateway returned an unsuccessful result.", { status: response.status });
  return body?.result ?? body;
}

export const api = {
  board(options) { return callOperation(OPERATIONS.board, {}, options); },
  overview({ start, end, limit = 100 }, options) {
    return callOperation(OPERATIONS.overview, { window_start: start, window_end: end, limit }, options);
  },
  drawer(workItemId, options) {
    return callOperation(OPERATIONS.drawer, { work_item_id: workItemId }, options);
  },
  updateDisplayName(agentId, displayName, idempotencyKey, options) {
    return callOperation(OPERATIONS.displayName, {
      agent_id: agentId, display_name: displayName, idempotency_key: idempotencyKey
    }, options);
  },
  putIcon(agentId, mediaType, dataBase64, idempotencyKey, options) {
    return callOperation(OPERATIONS.icon, {
      agent_id: agentId, media_type: mediaType, data_base64: dataBase64, idempotency_key: idempotencyKey
    }, options);
  }
};
