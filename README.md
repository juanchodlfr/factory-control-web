# Factory Control Web v0.2.0

Read-only internal control plane for Agent Factory.

## Stack
React + TypeScript + Vite + TanStack Query + Zod + Supabase Auth session.

## Runtime configuration
Copy `.env.example` to `.env.local` and set the public Supabase project URL and publishable key. The browser never receives `service_role` and never reads `factory_lite` tables directly.

Factory data uses the JWT-authenticated, admin-only `factory-control-read-v0.1.1` Edge Function routes under `/functions/v1/factory/*`. The source deployed to Supabase is versioned in `supabase/functions/factory/`.

## Commands
- `npm install`
- `npm test`
- `npm run build`

## Scope
WorkBoard is the default view: real features as rows, agents as columns, work items at their intersections. Legacy work items without a feature appear under “Sin feature”, grouped by their stored product. Missing feature references stay visible. Search, product filtering, active/all filtering, sticky headings and horizontal scrolling work on desktop and mobile.

The current cloud store has no features yet; the UI does not create or infer them. Empty registered features are shown too.

“Editar agentes” changes a short name and text/emoji icon. These presentation preferences are saved only in the signed-in user's `factory_control_agents` Auth metadata, available across their devices; they are never used for authorization and do not mutate Factory agent identities, work items or handoffs.

Manual refresh refetches active views with progress and error feedback. Auto refresh runs every 30 seconds while the page is visible, and data also refreshes on focus. Elapsed clocks tick every second independently, using the accepted handoff timestamp. They indicate time since acceptance, not proof that a model/process is executing; missing timestamps produce no fabricated clock. Terminal/blocked work stops counting.

Overview, Pipelines, Agents, Blockers and History remain available. No Factory mutations, merge/tag/release actions or autonomous runner controls are exposed.
