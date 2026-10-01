// Read-only projection. No payloads, instructions, credentials or mutations.
export function buildBoard(work: any[], agents: any[], handoffs: any[], features: any[]) {
  const byId = new Map(agents.map(a => [a.id, a]));
  const safeText = (value: unknown, max = 160) =>
    typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').slice(0, max) : null;
  const featureById = new Map(features.map(f => [f.id, f]));
  return {
    agents: agents.map(a => ({ code: a.code, name: a.name, status: a.status })),
    features: features.map(f => ({
      id: f.id, feature_key: f.feature_key, short_code: f.short_code,
      title: f.title, product: f.product, application: f.application, archived: f.archived
    })),
    rows: work.map(w => {
      const hs = handoffs.filter(h => h.work_item_id === w.id);
      const latest = hs.at(-1);
      const terminal = ['DONE', 'CANCELLED', 'CANCELED', 'CLOSED'].includes(w.status);
      const executor = w.current_executor_agent_id || w.owner_agent_id;
      const blocked = !terminal && (w.payload?.blocked === true || String(w.workflow_stage || '').includes('BLOCKED') || w.status === 'BLOCKED');
      const ids = new Set<string>();
      hs.forEach(h => { if (h.from_agent_id) ids.add(h.from_agent_id); if (h.to_agent_id) ids.add(h.to_agent_id); });
      if (w.owner_agent_id) ids.add(w.owner_agent_id);
      if (executor) ids.add(executor);
      const feature = featureById.get(w.feature_id);
      return {
        work_item_id: w.id, work_key: w.work_key, short_code: w.short_code,
        title: w.title, status: w.status, feature_id: w.feature_id,
        product: safeText(feature?.product || w.payload?.product || w.payload?.product_code),
        workflow_stage: safeText(w.workflow_stage),
        owner_agent_code: byId.get(w.owner_agent_id)?.code ?? null,
        executor_agent_code: byId.get(executor)?.code ?? null,
        blocked, waiting_for_juancho: !terminal && w.payload?.waiting_for_juancho === true,
        updated_at: w.updated_at,
        cells: [...ids].map(id => {
          const last = hs.filter(h => h.from_agent_id === id || h.to_agent_id === id).at(-1);
          const currentTarget = last?.id === latest?.id && last?.to_agent_id === id;
          const executing = !w.current_executor_agent_id || executor === id;
          let state = last ? 'completed' : (executor === id ? (terminal ? 'completed' : 'pending') : 'not_applicable');
          let started_at = null;
          if (!terminal && currentTarget) {
            if (last.status === 'PENDING') state = 'pending';
            if (last.status === 'REJECTED') state = 'blocked';
            if (last.status === 'ACCEPTED' && executing) { state = 'working'; started_at = last.accepted_at ?? null; }
          }
          if (!terminal && executor === id && !latest && w.status === 'IN_PROGRESS') state = 'working';
          if (blocked && executor === id) { state = 'blocked'; started_at = null; }
          return {
            agent_code: byId.get(id)?.code ?? null, state, started_at,
            latest_handoff_id: last?.id ?? null,
            origin: last?.from_agent_id === id, destination: last?.to_agent_id === id
          };
        })
      };
    })
  };
}
