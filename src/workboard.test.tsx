import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { boardResponse } from './contracts'
import { assignedWork, groupFeatures, elapsedLabel } from './workboard-model'
import { parsePreferences } from './agent-presentation'
import { WorkBoard } from './WorkBoard'
import { buildBoard } from '../supabase/functions/factory/board'

const featureId = '00000000-0000-4000-8000-000000000010'
const workId = '00000000-0000-4000-8000-000000000020'
const handoffId = '00000000-0000-4000-8000-000000000030'
const start = '2026-10-01T18:00:00.000Z'
const agents = [{ id: 'po', code: 'PO_APC', name: 'Product Owner', status: 'ACTIVE' }, { id: 'sa', code: 'SOLUTION_ARCHITECT', name: 'Architect', status: 'ACTIVE' }]
const work = [{ id: workId, work_key: 'W0001', short_code: 'W1', title: 'Cerrar arquitectura', status: 'IN_PROGRESS', owner_agent_id: 'po', current_executor_agent_id: 'sa', feature_id: featureId, payload: { product: 'APC', private_secret: 'never exposed' }, updated_at: start }]
const handoffs = [{ id: handoffId, work_item_id: workId, from_agent_id: 'po', to_agent_id: 'sa', status: 'ACCEPTED', accepted_at: start }]
const features = [{ id: featureId, feature_key: 'APC-V1', short_code: 'F1', title: 'APC V1', product: 'APC', application: 'Web', archived: false }]
function fixture(withFeatures = true) {
  return boardResponse.parse({ status: 'ok', contract_version: 'factory-control-read-v0.1.1', request_id: 'r', ...buildBoard(work, agents, handoffs, withFeatures ? features : []) })
}
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('feature x agent projection', () => {
  it('uses real feature identifiers, including empty features, without merging by title', () => {
    const data = fixture()
    data.features.push({ ...data.features[0], id: '00000000-0000-4000-8000-000000000011' })
    const groups = groupFeatures(data)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(1)
    expect(groups[1].rows).toHaveLength(0)
  })
  it('keeps legacy and unresolved feature references visible without inventing features', () => {
    const data = fixture(false)
    data.rows[0].feature_id = null
    const groups = groupFeatures(data)
    expect(groups[0].title).toBe('Sin feature')
    expect(groups[0].product).toBe('APC')
    expect(data.features).toEqual([])
  })
  it('times only the receiving agent and never exposes the work payload', () => {
    const row = fixture().rows[0]
    expect(row.cells.find(c => c.agent_code === 'PO_APC')?.state).toBe('completed')
    expect(row.cells.find(c => c.agent_code === 'SOLUTION_ARCHITECT')).toMatchObject({ state: 'working', started_at: start })
    expect(JSON.stringify(row)).not.toContain('never exposed')
  })
  it('stops clocks for terminal or capability-blocked work even with a stale accepted handoff', () => {
    const done = buildBoard([{ ...work[0], status: 'DONE' }], agents, handoffs, features).rows[0]
    expect(done.cells.every(c => c.state !== 'working' && !c.started_at)).toBe(true)
    const blocked = buildBoard([{ ...work[0], workflow_stage: 'CAPABILITY_BLOCKED' }], agents, handoffs, features).rows[0]
    expect(blocked.blocked).toBe(true)
    expect(blocked.cells.find(c => c.agent_code === 'SOLUTION_ARCHITECT')).toMatchObject({ state: 'blocked', started_at: null })
  })
  it('shows work assigned to an agent before its first handoff', () => {
    const row = buildBoard(work, agents, [], features).rows[0]
    expect(row.cells.find(c => c.agent_code === 'SOLUTION_ARCHITECT')?.state).toBe('working')
  })
})

describe('WorkBoard interactions', () => {
  it('advances elapsed time without a data refresh and opens the exact work item', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(start).getTime() + 9000)
    const onOpen = vi.fn()
    render(<WorkBoard data={fixture()} preferences={{}} onSave={vi.fn()} onOpen={onOpen}/>)
    expect(screen.getByText('◷ 0:09')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('◷ 0:11')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('W1')[0])
    expect(onOpen).toHaveBeenCalledWith(workId)
  })
  it('edits presentation separately and leaves the work item unchanged', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const data = fixture()
    render(<WorkBoard data={data} preferences={{}} onSave={save} onOpen={vi.fn()}/>)
    fireEvent.click(screen.getByText('✎ Editar agentes'))
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'SOLUTION_ARCHITECT' } })
    fireEvent.change(screen.getByLabelText('Nombre corto'), { target: { value: 'SA' } })
    fireEvent.change(screen.getByLabelText('Icono'), { target: { value: '📐' } })
    fireEvent.click(screen.getByText('Guardar apariencia'))
    await screen.findByText('Apariencia guardada en tu cuenta.')
    expect(save).toHaveBeenCalledWith({ SOLUTION_ARCHITECT: { shortName: 'SA', icon: '📐' } })
    expect(data.rows[0].title).toBe('Cerrar arquitectura')
  })
  it('preserves an unsaved draft on failure and offers a retry', async () => {
    render(<WorkBoard data={fixture()} preferences={{}} onSave={vi.fn().mockRejectedValue(new Error('Sin conexión'))} onOpen={vi.fn()}/>)
    fireEvent.click(screen.getByText('✎ Editar agentes'))
    fireEvent.change(screen.getByLabelText('Nombre corto'), { target: { value: 'Producto' } })
    fireEvent.click(screen.getByText('Guardar apariencia'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(screen.getByLabelText('Nombre corto')).toHaveValue('Producto')
    expect(screen.getByText('Guardar apariencia')).toBeEnabled()
  })
})

it('handles invalid/future timestamps and validates account presentation metadata', () => {
  expect(elapsedLabel('invalid', Date.now())).toBeNull()
  expect(elapsedLabel(start, Date.parse(start) - 5000)).toBe('0:00')
  expect(elapsedLabel(start, Date.parse(start) + 3661000)).toBe('1:01:01')
  expect(parsePreferences({ QA: { shortName: 'QA', icon: '🧪' }, bad: { shortName: '' } })).toEqual({ QA: { shortName: 'QA', icon: '🧪' } })
})


describe('current assignment only', () => {
  it('renders once at the current executor despite historical senders and receivers', () => {
    const data = fixture()
    data.agents.push({ code: 'SECURITY', name: 'Security', status: 'ACTIVE' })
    data.rows[0].executor_agent_code = 'SECURITY'
    data.rows[0].cells.push({ agent_code: 'SECURITY', state: 'pending', latest_handoff_id: handoffId, origin: false, destination: true })
    render(<WorkBoard data={data} preferences={{}} onSave={vi.fn()} onOpen={vi.fn()}/>)
    const tile = screen.getByRole('button', { name: /W0001 · Cerrar arquitectura · Pendiente/ })
    expect(screen.getAllByText('W1')).toHaveLength(1)
    const cell = tile.closest('td')!
    const index = Array.from(cell.parentElement!.children).indexOf(cell)
    expect(screen.getAllByRole('columnheader')[index]).toHaveTextContent('SECURITY')
    expect(tile).toHaveClass('tile-pending')
    expect(tile.querySelector('.status')).toBeNull()
  })
  it('uses the assigned owner if no executor exists, never a historical destination', () => {
    const data = fixture()
    data.rows[0].executor_agent_code = null
    data.rows[0].status = 'OPEN'
    expect(assignedWork(data.rows[0])).toMatchObject({ agentCode: 'PO_APC', state: 'pending' })
  })
  it('prioritizes whole-work completion and blocking over historical cell completion', () => {
    const row = fixture().rows[0]
    row.blocked = true
    expect(assignedWork(row)).toMatchObject({ state: 'blocked', startedAt: null })
    row.status = 'DONE'
    expect(assignedWork(row)).toMatchObject({ state: 'completed', startedAt: null })
  })
  it('keeps missing assignments visible once in Sin asignar', () => {
    const data = fixture()
    data.rows[0].executor_agent_code = 'UNKNOWN_AGENT'
    render(<WorkBoard data={data} preferences={{}} onSave={vi.fn()} onOpen={vi.fn()}/>)
    expect(screen.getAllByText('W1')).toHaveLength(1)
    const tile = screen.getByRole('button', { name: /W0001 · Cerrar arquitectura/ })
    const cell = tile.closest('td')!
    const index = Array.from(cell.parentElement!.children).indexOf(cell)
    expect(screen.getAllByRole('columnheader')[index]).toHaveTextContent('Sin asignar')
  })
})
