import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { boardResponse } from './contracts'

let handler: (req: Request) => Promise<Response>
const id = '00000000-0000-4000-8000-000000000010'
const env = {
  SUPABASE_URL: 'https://preview.invalid', SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-test-key', FACTORY_CONTROL_ADMIN_USER_IDS: 'admin'
}
let admin = true
const network = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input))
  let body: unknown = []
  if (url.pathname === '/auth/v1/user') body = { id: admin ? 'admin' : 'viewer', app_metadata: {} }
  else if (url.pathname === '/rest/v1/features') body = [{ id, feature_key: 'F1', short_code: 'F1', title: 'Feature real', product: 'APC', application: 'Web', archived: false }]
  else if (url.pathname === '/rest/v1/agents') body = [{ id: 'agent', code: 'QA', name: 'QA', status: 'ACTIVE' }]
  else if (url.pathname === '/rest/v1/work_items') body = [{ id: '00000000-0000-4000-8000-000000000020', work_key: 'W1', title: 'Review', status: 'OPEN', owner_agent_id: 'agent', current_executor_agent_id: 'agent', feature_id: id, updated_at: null, payload: { secret: 'hidden' } }]
  return new Response(JSON.stringify(body), { status: 200 })
})
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: keyof typeof env) => env[key] }, serve: (fn: typeof handler) => { handler = fn } })
  vi.stubGlobal('fetch', network)
  await import('../supabase/functions/factory/index')
})
afterAll(() => vi.unstubAllGlobals())

it('keeps the WorkBoard behind the existing admin authentication and origin boundary', async () => {
  admin = true
  const unauth = await handler(new Request('https://preview.invalid/functions/v1/factory/board'))
  expect(unauth.status).toBe(401)
  const wrongOrigin = await handler(new Request('https://preview.invalid/functions/v1/factory/board', { headers: { origin: 'https://other.invalid', authorization: 'Bearer preview' } }))
  expect(wrongOrigin.status).toBe(403)
  admin = false
  const viewer = await handler(new Request('https://preview.invalid/functions/v1/factory/board', { headers: { authorization: 'Bearer preview' } }))
  expect(viewer.status).toBe(403)
  admin = true
  const response = await handler(new Request('https://preview.invalid/functions/v1/factory/board', { headers: { origin: 'https://factory-control-web.juancho-dlfr.workers.dev', authorization: 'Bearer preview' } }))
  expect(response.status).toBe(200)
  const board = boardResponse.parse(await response.json())
  expect(board.features[0].title).toBe('Feature real')
  expect(board.rows[0].feature_id).toBe(id)
  expect(board.rows[0].cells[0].state).toBe('pending')
  expect(JSON.stringify(board)).not.toContain('hidden')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

it('continues rejecting Factory mutations', async () => {
  const response = await handler(new Request('https://preview.invalid/functions/v1/factory/board', { method: 'POST', headers: { authorization: 'Bearer preview' } }))
  expect(response.status).toBe(405)
})
