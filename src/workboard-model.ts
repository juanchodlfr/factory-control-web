import type { BoardData } from './contracts'

export type FeatureGroup = {
  id: string; title: string; code: string; product: string; archived: boolean; unassigned: boolean
  rows: BoardData['rows']
}

export function groupFeatures(data: BoardData): FeatureGroup[] {
  const groups = new Map<string, FeatureGroup>(data.features.map(f => [f.id, {
    id: f.id, title: f.title, code: f.short_code || f.feature_key,
    product: f.product || 'Sin producto', archived: f.archived, unassigned: false, rows: []
  }]))
  for (const row of data.rows) {
    if (row.feature_id && groups.has(row.feature_id)) { groups.get(row.feature_id)!.rows.push(row); continue }
    // Preserve unlinked and unresolved references instead of inventing features.
    const product = row.product || 'Sin producto'
    const id = row.feature_id || 'unassigned:' + product
    if (!groups.has(id)) groups.set(id, {
      id, title: row.feature_id ? 'Feature no disponible' : 'Sin feature',
      code: row.feature_id ? 'Referencia pendiente' : 'Sin asignación',
      product, archived: false, unassigned: true, rows: []
    })
    groups.get(id)!.rows.push(row)
  }
  return [...groups.values()]
}

export function elapsedLabel(start: string, now: number): string | null {
  const timestamp = Date.parse(start)
  if (!Number.isFinite(timestamp)) return null
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor(seconds % 3600 / 60)
  const s = seconds % 60
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0')
}

// WorkBoard is current assignment, while pipeline/history retain participation.
export function assignedWork(row: BoardData['rows'][number]) {
  const agentCode = row.executor_agent_code || row.owner_agent_code || null
  const cell = row.cells.find(c => c.agent_code === agentCode)
  const terminal = ['DONE', 'CANCELLED', 'CANCELED', 'CLOSED'].includes(row.status)
  const state = terminal ? 'completed' : row.blocked ? 'blocked'
    : cell?.state === 'pending' ? 'pending'
    : cell?.state === 'working' ? 'working'
    : row.status === 'IN_PROGRESS' ? 'working' : 'pending'
  return { agentCode, state, startedAt: state === 'working' ? cell?.started_at : null } as const
}
