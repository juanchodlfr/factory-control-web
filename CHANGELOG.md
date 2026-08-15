# Changelog

## 0.1.0
- Initial Factory Control Web read-only frontend.
- Added JWT-authenticated access to `factory-control-read-v0.1.0`.
- Added Overview KPIs, Board, Pipeline, Agents, Blockers/Waiting for Juancho, History/Search.
- Added responsive desktop/iPad/iPhone layouts and accessible status labels.
- Added runtime Zod validation against the exact deployed `factory@1` response contract.

## v0.1.0-candidate.2 — CI remediation
- Added Vite client type reference for `import.meta.env`.
- Narrowed public Supabase configuration to definite strings before use in fetch headers.
- Removed incompatible `allowImportingTsExtensions` from Node TypeScript config.
- Functional scope and backend contract unchanged.
