export const WORK_STATES = Object.freeze([
  "BACKLOG", "QUEUED", "IN_PROGRESS", "HUMAN_ACTION", "BLOCKED",
  "READY_FOR_PRODUCTION", "PRODUCTION", "DONE", "CANCELLED", "ORPHANED"
]);

export function shortWorkCode(item) {
  return item?.short_code || String(item?.work_key || "").match(/W\d+(?:\.\d+)*/)?.[0] || "W?";
}

export function workPillLabel(item) {
  return `${shortWorkCode(item)} · ${item?.operational_state || "ORPHANED"}`;
}

export function boardFeatures(board, stateFilter = "") {
  const features = Array.isArray(board?.features) ? board.features : [];
  return features.map(feature => {
    const allItems = Array.isArray(feature.work_items) ? feature.work_items : [];
    const workItems = stateFilter ? allItems.filter(item => item.operational_state === stateFilter) : allItems;
    return { ...feature, work_items: workItems };
  }).filter(feature => !stateFilter || feature.work_items.length > 0);
}

export function boardAgentColumns(board) {
  const agents = Array.isArray(board?.agents) ? board.agents : [];
  const columns = agents.map(agent => ({
    id: agent.agent_id,
    code: agent.agent_code,
    displayName: agent.display_name || agent.agent_code,
    iconPath: agent.icon_object_path || null,
    status: agent.status,
    executionSurfaceStatus: agent.execution_surface_status
  }));
  return [...columns, { id: "__unassigned__", code: "UNASSIGNED", displayName: "Unassigned", iconPath: null }];
}

export function executorColumnId(item) {
  return item?.current_executor_agent_id || "__unassigned__";
}

export function overviewCards(overview) {
  const workStates = overview?.snapshot?.work_item_states || {};
  const featureStates = overview?.snapshot?.feature_states || {};
  return [
    ...Object.entries(workStates).map(([state, count]) => ({ kind: "work", state, count: Number(count) || 0 })),
    ...Object.entries(featureStates).map(([state, count]) => ({ kind: "feature", state, count: Number(count) || 0 }))
  ].sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function drawerSections(drawer) {
  if (!drawer?.found) return [];
  const work = drawer.work_item || {};
  const handoffs = Array.isArray(drawer.handoffs) ? drawer.handoffs : [];
  const requests = Array.isArray(drawer.workflow_requests) ? drawer.workflow_requests : [];
  const gates = Array.isArray(drawer.gates) ? drawer.gates : [];
  const dependencies = Array.isArray(drawer.dependencies) ? drawer.dependencies : [];

  const reasons = [];
  if (work.state_reason) reasons.push({ label: "Operational reason", value: work.state_reason });
  if (work.control_plane_conflict) reasons.push({ label: "Control-plane conflict", value: "Multiple active handoffs" });
  if (work.orphaned) reasons.push({ label: "Orphaned", value: "No valid forward control signal" });
  if (work.open_workflow_request_type) reasons.push({ label: "Open request", value: work.open_workflow_request_type });

  const humanAction = requests.filter(r => r.request_type === "HUMAN_ACTION" || r.human_action_class);
  const evidence = gates.map(g => ({
    gate: g.gate_code || g.code || "Gate",
    status: g.status || "UNKNOWN",
    required: Boolean(g.required),
    evidence: g.evidence ?? null
  }));

  return [
    { key: "history", title: "History", rows: handoffs },
    { key: "reasons", title: "Reasons", rows: reasons },
    { key: "dependencies", title: "Dependencies", rows: dependencies },
    { key: "human-action", title: "Human Action", rows: humanAction },
    { key: "evidence", title: "Evidence", rows: evidence }
  ];
}

const ICON_OBJECT_PATH = /^agents\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{64}\.(png|webp)$/i;

export function iconPublicUrl(base, objectPath, origin) {
  if (!objectPath || !ICON_OBJECT_PATH.test(String(objectPath))) return null;
  const safe = String(objectPath).split("/").map(encodeURIComponent).join("/");
  const cleanBase = String(base || "/agent-icons").replace(/\/+$/, "");
  const url = new URL(`${cleanBase}/${safe}`, origin);
  if (url.origin !== new URL(origin).origin) return null;
  return url.href;
}

export function makeIdempotencyKey(prefix, randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  const token = randomUUID ? randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}`.slice(0, 200);
}
