# Factory Control Web v0.1.0

Read-only internal control plane for Agent Factory.

## Stack
React + TypeScript + Vite + TanStack Query + Zod + Supabase Auth session.

## Runtime configuration
Copy `.env.example` to `.env.local` and set the public Supabase project URL and publishable key. The browser never receives `service_role` and never reads `factory_lite` tables directly.

The app calls only the documented `factory-control-read-v0.1.0` Edge Function routes under `/functions/v1/factory/*` with the current authenticated user's JWT.

## Commands
- `npm install`
- `npm test`
- `npm run build`

## Scope
v0.1.0 is strictly read-only: Overview, Board, Pipelines, Agents, Blockers/Waiting for Juancho, History/Search. No Factory mutations, merge/tag/release actions or autonomous runner controls.
