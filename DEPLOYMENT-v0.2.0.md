# Factory Control v0.2.0 — Cloudflare deployment adapter

This branch reuses the existing production Worker:

- Worker: `factory-control-web`
- Origin: `https://factory-control-web.juancho-dlfr.workers.dev`
- Provider: Cloudflare Workers

The product candidate remains immutable:

- Repository: `juanchodlfr/agent-factory`
- SHA: `c6c1ff98fad9749e2313e2d553aeb1154686bc66`
- Source: `factory-control-web/**`

The v0.2 product files in this branch are exact candidate bytes. The deployment-only delta is limited to the Worker adapter, Wrangler configuration, build script and adapter test.

## Security invariants

- `run_worker_first=true` so static assets cannot bypass v0.2 authentication.
- Static fallback is restricted to the exact candidate asset paths and only occurs after the validated handler returns 404.
- Security/CSP headers remain enforced by the validated handler and are reapplied on asset-binding fallback.
- Existing `/oauth/consent` behavior is preserved.
- No privileged secret is committed or exposed to browser assets.
- No merge, tag or GitHub Release is authorized by this branch.

## Cloudflare runtime configuration

Variables:
- `FACTORY_CONTROL_PUBLIC_ORIGIN=https://factory-control-web.juancho-dlfr.workers.dev`
- `FACTORY_CONTROL_GATEWAY_URL=https://hgrinvdxkbqggwgbzpge.supabase.co/functions/v1/factory-control-gateway`
- `FACTORY_CONTROL_ICON_PUBLIC_BASE_URL=<approved existing public icon base>`

Secrets:
- `FACTORY_CONTROL_ADMIN_TOKEN_SHA256`
- `FACTORY_CONTROL_SESSION_SECRET`
- `FACTORY_CONTROL_KEY`

QA/Security must validate this deployment adapter before production replacement.


<!-- cloudflare-build-config-recheck: 2026-09-29 -->

<!-- cloudflare-version-command-recheck: 2026-09-29T19:54+02 -->

<!-- cloudflare-build-and-version-recheck: 2026-09-29T20:20+02 -->
