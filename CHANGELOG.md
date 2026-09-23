# Changelog

## 0.1.0-candidate.5
- Added the `/oauth/consent` Worker route required by the Supabase OAuth 2.1 Server used by the private FA_DB MCP pilot.
- The route preserves the OAuth query string (including `authorization_id`) and redirects only that path to the deployed `factory-mcp-oauth/authorize` consent surface.
- Added explicit Cloudflare Workers static-assets configuration for the existing React/Vite SPA, including SPA fallback and selective Worker-first routing for `/oauth/consent`.
- No Factory mutation capability, Supabase secret, merge, tag, release, or production deployment is included in this candidate.

## 0.1.0-candidate.4
- Added visible Supabase Auth invitation/password-setup handling for authenticated invite callbacks using `auth.updateUser({ password })`.
- Added explicit invite/callback error states so consumed, invalid, or expired links never render a blank page.
- Preserved normal password login and persistent sessions.
- Updated frontend runtime validation to the current `factory-control-read-v0.1.1` backend contract without changing the read-only data model.
- Added callback-routing tests; no backend, service-role, write capability, or product-scope change.

## 0.1.0-candidate.3
- Fixed Vitest configuration typing by importing `defineConfig` from `vitest/config`.
- No functional scope or runtime behavior changes.

## 0.1.0
- Initial Factory Control Web read-only frontend.
- Added JWT-authenticated access to `factory-control-read-v0.1.0`.
- Added Overview KPIs, Board, Pipeline, Agents, Blockers/Waiting for Juancho, History/Search.
- Added responsive desktop/iPad/iPhone layouts and accessible status labels.
- Added runtime Zod validation against the exact deployed `factory@1` response contract.
