import { FormEvent, useMemo, useState } from 'react'
import type { BoardData } from './contracts'
import { agentDisplay, displayAgent, type AgentPreferences } from './agent-presentation'
import { assignedWork, groupFeatures } from './workboard-model'
import { LiveElapsed } from './LiveElapsed'

const states = {
  blocked: ['!', 'Bloqueado'], working: ['●', 'En curso'], pending: ['→', 'Pendiente'],
  completed: ['✓', 'Completado'], not_applicable: ['·', 'Sin actividad']
} as const
const terminal = new Set(['DONE', 'CANCELLED', 'CANCELED', 'CLOSED'])
const icons = ['📋', '📐', '⚙️', '🖥️', '🌐', '📱', '🧪', '🛡️', '🚀', '🔎', '🎛️', '🤖']

type Props = {
  data: BoardData
  preferences: AgentPreferences
  onSave: (patch: AgentPreferences) => Promise<void>
  onOpen: (id: string) => void
}

export function WorkBoard({ data, preferences, onSave, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [product, setProduct] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState('')
  const [shortName, setShortName] = useState('')
  const [icon, setIcon] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const groups = useMemo(() => groupFeatures(data), [data])
  const columns = [...data.agents]
  if (data.rows.some(row => !data.agents.some(a => a.code === assignedWork(row).agentCode))) {
    columns.push({ code: '__UNASSIGNED__', name: 'Sin asignar', status: '' })
  }
  const products = [...new Set(groups.map(g => g.product))].sort()
  const visible = groups.filter(g => !g.archived || !activeOnly).filter(g => !product || g.product === product).map(g => ({
    ...g,
    rows: g.rows.filter(r => !activeOnly || !terminal.has(r.status)).filter(r =>
      (g.title + ' ' + g.code + ' ' + r.work_key + ' ' + r.title).toLowerCase().includes(query.toLowerCase()))
  })).filter(g => g.rows.length || (!g.unassigned && !query && (!activeOnly || !g.rows.length)))

  function editAgent(code: string) {
    const display = displayAgent(code, preferences)
    setSelected(code); setShortName(display.shortName); setIcon(display.icon)
    setError(''); setNotice(''); setEditing(true)
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    const parsed = agentDisplay.safeParse({ shortName, icon })
    if (!parsed.success) { setError('Escribe un nombre corto de 1 a 24 caracteres y un icono de hasta 16 caracteres.'); return }
    setBusy(true); setError(''); setNotice('')
    try { await onSave({ [selected]: parsed.data }); setNotice('Apariencia guardada en tu cuenta.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setBusy(false) }
  }
  const total = visible.reduce((n, g) => n + g.rows.length, 0)
  return <section className="panel workboard">
    <div className="section-head">
      <div><span className="eyebrow">VISIÓN DE LA FACTORÍA</span><h2>WorkBoard</h2><p>Cada work item aparece solo en su agente asignado actualmente.</p></div>
      <button className="secondary-action" aria-pressed={editing} onClick={() => {
        if (editing) setEditing(false)
        else if (data.agents[0]) editAgent(data.agents[0].code)
      }}>{editing ? 'Cerrar edición' : '✎ Editar agentes'}</button>
    </div>
    {editing && <form className="agent-editor" onSubmit={save}>
      <div className="editor-heading"><strong>Apariencia de los agentes</strong><small>Se guarda en tu cuenta y se aplica en tus dispositivos.</small></div>
      <label>Agente<select value={selected} disabled={busy} onChange={e => editAgent(e.target.value)}>
        {data.agents.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
      </select></label>
      <label>Nombre corto<input value={shortName} disabled={busy} maxLength={24} required onChange={e => setShortName(e.target.value)}/></label>
      <label>Icono<input value={icon} disabled={busy} maxLength={16} placeholder="📐" onChange={e => setIcon(e.target.value)}/></label>
      <div className="icon-options" aria-label="Elegir un icono">{icons.map(i => <button key={i} type="button" disabled={busy} aria-label={'Usar ' + i} onClick={() => setIcon(i)}>{i}</button>)}</div>
      <button className="primary-action" disabled={busy || !selected}>{busy ? 'Guardando…' : 'Guardar apariencia'}</button>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="save-notice" role="status">{notice}</div>}
    </form>}
    <div className="workboard-filters">
      <label className="sr-only" htmlFor="workboard-search">Buscar feature o work item</label>
      <input id="workboard-search" className="search" placeholder="Buscar feature o work item…" value={query} onChange={e => setQuery(e.target.value)}/>
      <label><span className="sr-only">Producto</span><select value={product} onChange={e => setProduct(e.target.value)}>
        <option value="">Todos los productos</option>{products.map(p => <option key={p}>{p}</option>)}
      </select></label>
      <label className="check-label"><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}/> Solo activos</label>
      <small>{data.features.length} features · {total} WI visibles · {data.agents.length} agentes</small>
    </div>
    {!data.features.length && <div className="board-note">Todavía no hay features registradas. Los work items existentes aparecen en “Sin feature”, sin cambiar sus asignaciones.</div>}
    {data.limited && <div className="error-banner" role="status">La API ha alcanzado su límite de lectura. Esta vista puede ser parcial.</div>}
    <div className="workboard-scroll" tabIndex={0} role="region" aria-label="Matriz de features y agentes">
      <table className="feature-matrix">
        <caption className="sr-only">WorkBoard: features por filas y agentes por columnas</caption>
        <thead><tr><th className="feature-column" scope="col">Feature / producto</th>{columns.map(a => {
          const display = a.code === '__UNASSIGNED__' ? { shortName: 'Sin asignar', icon: '—' } : displayAgent(a.code, preferences)
          return <th key={a.code} scope="col" title={a.code + ' · ' + a.name}>
            <span className="column-icon" aria-hidden="true">{display.icon || '🤖'}</span>
            <span className="column-name">{display.shortName}</span><small className="column-code">{a.code}</small>
            <small>{a.status}</small>
            {editing && a.code !== '__UNASSIGNED__' && <button className="column-edit" onClick={() => editAgent(a.code)} disabled={busy} aria-label={'Editar ' + a.code}>✎</button>}
          </th>
        })}</tr></thead>
        <tbody>{visible.map(group => <tr key={group.id}>
          <th scope="row" className="feature-column"><span className="product-label">{group.product}</span><strong>{group.title}</strong><small>{group.code}</small><span className="feature-count">{group.rows.length} work items{group.archived ? ' · Archivada' : ''}</span></th>
          {columns.map(agent => {
            const items = group.rows.map(row => ({ row, assignment: assignedWork(row) })).filter(({ assignment }) =>
              (data.agents.some(a => a.code === assignment.agentCode) ? assignment.agentCode : '__UNASSIGNED__') === agent.code)
            return <td key={agent.code}>{items.length ? <div className="intersection">{items.map(({ row, assignment }) => {
              const [symbol, label] = states[assignment.state]
              return <button className={'wi-tile tile-' + assignment.state} key={row.work_item_id} onClick={() => onOpen(row.work_item_id)}
                aria-label={row.work_key + ' · ' + row.title + ' · ' + label}
                title={row.work_key + ' · ' + row.title + ' · ' + label + ' · ' + (row.workflow_stage || row.status)}>
                <span className="wi-heading"><b>{row.short_code || row.work_key}</b><span className="wi-title">{row.title}</span></span>
                <span className="sr-only">{symbol} {label}</span>
                {assignment.state === 'working' && assignment.startedAt && <LiveElapsed start={assignment.startedAt}/>}
                <small>{row.workflow_stage || row.status}</small>
                {row.waiting_for_juancho && <em>Espera a Juancho</em>}
              </button>
            })}</div> : <span className="empty-cross" aria-label="Sin work items">·</span>}</td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
    {!visible.length && <div className="empty">No hay work items que coincidan con estos filtros.</div>}
    <div className="board-legend"><span className="legend-working">Azul · En curso</span><span className="legend-pending">Amarillo · Pendiente</span><span className="legend-blocked">Rojo · Bloqueado</span><span className="legend-completed">Verde · Terminado</span><small>El contador avanza cada segundo desde la aceptación del handoff.</small></div>
  </section>
}
