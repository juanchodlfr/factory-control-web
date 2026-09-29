import { api } from "./api.mjs";
import {
  WORK_STATES, boardAgentColumns, boardFeatures, drawerSections, executorColumnId,
  iconPublicUrl, makeIdempotencyKey, overviewCards, shortWorkCode
} from "./model.mjs";

const $ = id => document.getElementById(id);
const config = {
  apiBase: document.querySelector('meta[name="factory-control-api-base"]')?.content || "/api/factory-control",
  iconBase: document.querySelector('meta[name="factory-control-icon-base"]')?.content || "/agent-icons"
};
const apiOptions = () => ({ base: config.apiBase, origin: location.origin });
const state = {
  board: null,
  overview: null,
  view: "board",
  boardFilter: "",
  drawer: { id: null, data: null, status: "idle", message: "" }
};

function node(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value ?? "";
    else if (key.startsWith("aria-")) el.setAttribute(key, value);
    else if (key === "disabled") el.disabled = Boolean(value);
    else if (key === "value") el.value = value ?? "";
    else if (value !== undefined && value !== null) el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function setError(message = "") {
  const el = $("global-error");
  el.hidden = !message;
  el.textContent = message;
}
function setSyncLabel(text) { $("sync-label").textContent = text; }
function stateClass(value = "") {
  return `state state-${String(value).toLowerCase().replaceAll("_", "-")}`;
}

function iconNode(agent, size = "md") {
  const wrap = node("span", { class: `agent-icon agent-icon-${size}`, "aria-hidden": "true" });
  const url = iconPublicUrl(config.iconBase, agent?.icon_object_path || agent?.iconPath, location.origin);
  const fallback = () => {
    wrap.replaceChildren();
    wrap.textContent = String(agent?.display_name || agent?.displayName || agent?.agent_code || agent?.code || "?")
      .slice(0, 1).toUpperCase();
  };
  if (url) {
    const img = node("img", { src: url, alt: "" });
    img.addEventListener("error", fallback, { once: true });
    wrap.append(img);
  } else fallback();
  return wrap;
}

function populateStateFilter() {
  const select = $("board-state-filter");
  if (select.options.length > 1) return;
  for (const value of WORK_STATES) select.append(node("option", { value, text: value }));
}

function renderBoard() {
  const grid = $("board-grid");
  const loading = $("board-loading");
  const empty = $("board-empty");
  loading.hidden = Boolean(state.board);
  grid.replaceChildren();
  if (!state.board) { grid.hidden = true; empty.hidden = true; return; }
  const features = boardFeatures(state.board, state.boardFilter);
  const agents = boardAgentColumns(state.board);
  if (!features.length) {
    grid.hidden = true;
    empty.hidden = false;
    empty.textContent = state.boardFilter ? `No Work Items in ${state.boardFilter}.` : "No features returned by the v0.2 projection.";
    return;
  }
  empty.hidden = true;
  grid.hidden = false;
  grid.style.setProperty("--agent-count", agents.length);
  grid.append(node("div", { class: "board-row board-header", role: "row" },
    node("div", { class: "feature-cell feature-cell-header", text: "Feature", role: "columnheader" }),
    ...agents.map(agent => node("div", { class: "agent-header", role: "columnheader" },
      iconNode(agent, "sm"),
      node("span", { class: "agent-header-name", text: agent.displayName }),
      node("span", { class: "agent-header-code", text: agent.code })
    ))
  ));
  for (const feature of features) {
    const row = node("div", { class: "board-row", role: "row" });
    row.append(node("div", { class: "feature-cell", role: "rowheader" },
      node("div", { class: "feature-title-line" },
        node("span", { class: "feature-code", text: feature.short_code || feature.feature_key }),
        node("span", { class: stateClass(feature.feature_status), text: feature.feature_status })
      ),
      node("strong", { text: feature.title }),
      node("span", { class: "feature-description", text: [feature.product, feature.target_version].filter(Boolean).join(" · ") })
    ));
    for (const agent of agents) {
      const cell = node("div", { class: "work-cell", role: "cell" });
      for (const item of (feature.work_items || []).filter(x => executorColumnId(x) === agent.id)) {
        const pill = node("button", {
          class: `work-pill ${stateClass(item.operational_state)}`,
          type: "button",
          "aria-label": `Open ${shortWorkCode(item)} ${item.operational_state}`
        },
          node("span", { class: "work-code", text: shortWorkCode(item) }),
          node("span", { class: "work-state", text: item.operational_state })
        );
        pill.addEventListener("click", () => openDrawer(item.work_item_id));
        cell.append(pill);
      }
      row.append(cell);
    }
    grid.append(row);
  }
}

function activateView(view) {
  state.view = view;
  for (const name of ["board", "overview", "agents"]) $(`${name}-view`).hidden = name !== view;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.view === view));
  if (view === "overview" && !state.overview) loadOverview();
}

function renderOverview() {
  const container = $("overview-content");
  const meta = $("overview-meta");
  container.replaceChildren();
  if (!state.overview) { meta.textContent = ""; return; }
  const generated = state.overview.generated_at ? new Date(state.overview.generated_at).toLocaleString() : "unknown";
  const start = state.overview.window?.start ? new Date(state.overview.window.start).toLocaleString() : "unknown";
  const end = state.overview.window?.end ? new Date(state.overview.window.end).toLocaleString() : "unknown";
  meta.textContent = `Snapshot generated ${generated} · Window ${start} → ${end}`;
  const cards = node("div", { class: "metric-grid" });
  for (const card of overviewCards(state.overview)) {
    const metric = node("button", { type: "button", class: "metric-card" },
      node("span", { class: "metric-kind", text: card.kind === "work" ? "Work Items" : "Features" }),
      node("strong", { text: String(card.count) }),
      node("span", { class: stateClass(card.state), text: card.state }),
      card.kind === "work" ? node("span", { class: "metric-action", text: "View on Board →" }) : null
    );
    if (card.kind === "work") metric.addEventListener("click", () => {
      state.boardFilter = card.state;
      $("board-state-filter").value = card.state;
      activateView("board");
      renderBoard();
    }); else metric.disabled = true;
    cards.append(metric);
  }
  const drills = state.overview.drill_downs || {};
  const drillSection = node("section", { class: "overview-section" }, node("h3", { text: "Operational drill-downs" }));
  const drillGrid = node("div", { class: "drill-grid" });
  for (const [label, ids] of [
    ["Blocked", drills.blocked_work_item_ids || []],
    ["Orphaned", drills.orphaned_work_item_ids || []],
    ["Control-plane conflicts", drills.control_plane_conflict_work_item_ids || []]
  ]) {
    drillGrid.append(node("div", { class: "drill-card" },
      node("span", { class: "drill-label", text: label }),
      node("strong", { text: String(ids.length) }),
      node("p", { text: ids.length ? ids.join(", ") : "None" })
    ));
  }
  drillSection.append(drillGrid);
  const events = node("section", { class: "overview-section" }, node("h3", { text: "Window events" }));
  const list = node("ol", { class: "event-list" });
  for (const event of state.overview.source_events || []) {
    list.append(node("li", {},
      node("time", { text: event.created_at ? new Date(event.created_at).toLocaleString() : "—" }),
      node("strong", { text: event.operation || "event" }),
      node("span", { text: event.phase || "" })
    ));
  }
  if (!list.children.length) list.append(node("li", { class: "empty compact", text: "No gateway events in this window." }));
  events.append(list);
  container.append(cards, drillSection, events);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the icon file."));
    reader.onload = () => resolve(String(reader.result).split(",").at(-1) || "");
    reader.readAsDataURL(file);
  });
}

function renderAgents() {
  const grid = $("agents-grid");
  grid.replaceChildren();
  for (const agent of state.board?.agents || []) {
    const nameInput = node("input", { type: "text", maxlength: "80", value: agent.display_name || agent.agent_code, "aria-label": `Display name for ${agent.agent_code}` });
    const nameButton = node("button", { type: "button", class: "button button-primary", text: "Save name" });
    const fileInput = node("input", { type: "file", accept: "image/png,image/webp", "aria-label": `Icon for ${agent.agent_code}` });
    const iconButton = node("button", { type: "button", class: "button button-secondary", text: "Upload icon" });
    const feedback = node("span", { class: "form-feedback", "aria-live": "polite" });
    nameButton.addEventListener("click", async () => {
      feedback.textContent = "Saving…"; nameButton.disabled = true;
      try {
        await api.updateDisplayName(agent.agent_id, nameInput.value, makeIdempotencyKey("fc-name"), apiOptions());
        feedback.textContent = "Saved."; await loadBoard({ quiet: true });
      } catch (error) { feedback.textContent = error.message; }
      finally { nameButton.disabled = false; }
    });
    iconButton.addEventListener("click", async () => {
      const file = fileInput.files?.[0];
      if (!file) { feedback.textContent = "Choose a PNG or WebP file."; return; }
      if (!["image/png", "image/webp"].includes(file.type)) { feedback.textContent = "Only PNG or WebP is accepted."; return; }
      if (file.size > 512 * 1024) { feedback.textContent = "Icon must be 512 KiB or smaller."; return; }
      iconButton.disabled = true; feedback.textContent = "Uploading…";
      try {
        const base64 = await fileToBase64(file);
        await api.putIcon(agent.agent_id, file.type, base64, makeIdempotencyKey("fc-icon"), apiOptions());
        feedback.textContent = "Icon updated."; await loadBoard({ quiet: true });
      } catch (error) { feedback.textContent = error.message; }
      finally { iconButton.disabled = false; }
    });
    grid.append(node("article", { class: "agent-card" },
      node("div", { class: "agent-card-header" },
        iconNode(agent, "lg"), node("div", {}, node("h3", { text: agent.display_name || agent.agent_code }), node("code", { text: agent.agent_code }))
      ),
      node("dl", { class: "readonly-meta" },
        node("dt", { text: "Agent ID" }), node("dd", { text: agent.agent_id }),
        node("dt", { text: "Status" }), node("dd", { text: agent.status || "—" }),
        node("dt", { text: "Execution surface" }), node("dd", { text: agent.execution_surface_status || "—" })
      ),
      node("div", { class: "agent-form" },
        node("label", {}, node("span", { text: "Display name" }), nameInput), nameButton,
        node("label", {}, node("span", { text: "Icon · PNG/WebP · ≤512 KiB" }), fileInput), iconButton, feedback
      )
    ));
  }
}

function renderDrawerValue(value) {
  if (value === null || value === undefined || value === "") return node("span", { class: "muted", text: "—" });
  if (typeof value === "object") return node("pre", { class: "json-block", text: JSON.stringify(value, null, 2) });
  return node("span", { text: String(value) });
}

function renderDrawer() {
  const { data, status, id, message } = state.drawer;
  $("drawer-loading").hidden = status !== "loading";
  $("drawer-error").hidden = status !== "error";
  $("drawer-refresh").disabled = status === "loading";
  $("drawer-refresh").textContent = status === "loading" ? "Refreshing…" : "Refresh";
  const content = $("drawer-content"); content.replaceChildren();
  if (status === "error") {
    $("drawer-error").textContent = message || "Refresh failed. Stale Work Item data has been cleared; retry to load current state.";
    $("drawer-title").textContent = "Work Item unavailable";
    $("drawer-code").textContent = id ? "WORK ITEM" : "";
    $("drawer-state").textContent = ""; $("drawer-state").className = "state-chip";
    return;
  }
  if (!data) return;
  if (!data.found) {
    $("drawer-title").textContent = "Work Item not found"; $("drawer-code").textContent = "WORK ITEM";
    $("drawer-state").textContent = ""; $("drawer-state").className = "state-chip";
    content.append(node("p", { class: "empty", text: "The v0.2 projection did not find this Work Item." })); return;
  }
  const work = data.work_item || {};
  $("drawer-title").textContent = work.title || work.work_key || "Work Item";
  $("drawer-code").textContent = shortWorkCode(work);
  $("drawer-state").className = `state-chip ${stateClass(work.operational_state)}`;
  $("drawer-state").textContent = work.operational_state || "ORPHANED";
  content.append(node("section", { class: "drawer-section" },
    node("h3", { text: "Current state" }),
    node("dl", { class: "drawer-summary" },
      node("dt", { text: "Work key" }), node("dd", { text: work.work_key || "—" }),
      node("dt", { text: "Workflow stage" }), node("dd", { text: work.workflow_stage || "—" }),
      node("dt", { text: "Executor" }), node("dd", { text: work.current_executor?.display_name || work.current_executor?.agent_code || "Unassigned" }),
      node("dt", { text: "Feature" }), node("dd", { text: work.feature_key || "—" })
    )
  ));
  for (const section of drawerSections(data)) {
    const block = node("section", { class: "drawer-section" }, node("h3", { text: section.title }));
    if (!section.rows.length) block.append(node("p", { class: "empty compact", text: "No records." }));
    else if (section.key === "history") {
      const list = node("ol", { class: "history-list" });
      for (const row of section.rows) list.append(node("li", {},
        node("div", { class: "history-topline" },
          node("strong", { text: row.handoff_status || row.status || "handoff" }),
          node("time", { text: row.created_at ? new Date(row.created_at).toLocaleString() : "—" })
        ),
        node("p", { text: [row.from_agent_code, row.target_agent_code].filter(Boolean).join(" → ") || "History event" })
      ));
      block.append(list);
    } else if (section.key === "reasons") {
      const dl = node("dl", { class: "drawer-summary" });
      for (const row of section.rows) dl.append(node("dt", { text: row.label }), node("dd", { text: row.value }));
      block.append(dl);
    } else if (section.key === "dependencies") {
      const list = node("ul", { class: "detail-list" });
      for (const row of section.rows) list.append(node("li", {},
        node("strong", { text: row.depends_on_work_key || row.depends_on_work_item_id || "Dependency" }),
        node("span", { class: stateClass(row.depends_on_operational_state), text: row.depends_on_operational_state || "UNKNOWN" }),
        node("span", { text: row.dependency_type || "" })
      ));
      block.append(list);
    } else if (section.key === "human-action") {
      const list = node("ul", { class: "detail-list" });
      for (const row of section.rows) list.append(node("li", {},
        node("strong", { text: row.human_action_class || row.request_type || "Human Action" }),
        node("span", { class: stateClass(row.status), text: row.status || "OPEN" }),
        node("span", { text: row.reason || row.request_reason || "Human action requested." })
      ));
      block.append(list);
    } else {
      for (const row of section.rows) block.append(node("div", { class: "evidence-card" },
        node("div", { class: "history-topline" }, node("strong", { text: row.gate || "Gate" }), node("span", { class: stateClass(row.status), text: row.status })),
        node("span", { class: "muted", text: row.required ? "Required" : "Optional" }), renderDrawerValue(row.evidence)
      ));
    }
    content.append(block);
  }
}

async function loadBoard({ quiet = false } = {}) {
  if (!quiet) { $("board-loading").hidden = false; $("board-grid").hidden = true; }
  try {
    const board = await api.board(apiOptions()); state.board = board; setError("");
    setSyncLabel(`Board snapshot · ${board.generated_at ? new Date(board.generated_at).toLocaleTimeString() : "current"}`);
    populateStateFilter(); renderBoard(); renderAgents();
  } catch (error) {
    if (!quiet) state.board = null; setError(error.message); setSyncLabel("Board unavailable"); renderBoard();
  }
}

async function loadOverview() {
  $("overview-loading").hidden = false; $("overview-content").replaceChildren();
  const hours = Number($("overview-window").value) || 24;
  const end = new Date(); const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  try {
    state.overview = await api.overview({ start: start.toISOString(), end: end.toISOString(), limit: 100 }, apiOptions());
    setError(""); renderOverview();
  } catch (error) { state.overview = null; setError(error.message); renderOverview(); }
  finally { $("overview-loading").hidden = true; }
}

async function openDrawer(workItemId) {
  state.drawer = { id: workItemId, data: null, status: "loading", message: "" };
  $("drawer").hidden = false; document.body.classList.add("drawer-open"); renderDrawer(); await refreshDrawer();
}

async function refreshDrawer() {
  const id = state.drawer.id; if (!id) return;
  state.drawer = { id, data: null, status: "loading", message: "" }; renderDrawer();
  try {
    const data = await api.drawer(id, apiOptions());
    if (state.drawer.id !== id) return;
    state.drawer = { id, data, status: "ready", message: "" };
  } catch (error) {
    if (state.drawer.id !== id) return;
    state.drawer = { id, data: null, status: "error", message: error.message };
  }
  renderDrawer();
}

function closeDrawer() {
  state.drawer = { id: null, data: null, status: "idle", message: "" };
  $("drawer").hidden = true; document.body.classList.remove("drawer-open");
}

async function refreshCurrent() {
  $("global-refresh").disabled = true; setSyncLabel("Refreshing…");
  try {
    await loadBoard({ quiet: false });
    if (state.view === "overview") await loadOverview();
    if (state.drawer.id) await refreshDrawer();
  } finally { $("global-refresh").disabled = false; }
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => activateView(tab.dataset.view)));
$("board-state-filter").addEventListener("change", event => { state.boardFilter = event.target.value; renderBoard(); });
$("overview-window").addEventListener("change", loadOverview);
$("overview-refresh").addEventListener("click", loadOverview);
$("global-refresh").addEventListener("click", refreshCurrent);
$("drawer-refresh").addEventListener("click", refreshDrawer);
$("drawer-close").addEventListener("click", closeDrawer);
document.querySelectorAll("[data-drawer-close]").forEach(el => el.addEventListener("click", closeDrawer));
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("drawer").hidden) closeDrawer(); });

loadBoard();
