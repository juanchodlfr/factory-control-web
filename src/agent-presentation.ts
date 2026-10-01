import { z } from 'zod'

export const agentDisplay = z.object({
  shortName: z.string().trim().min(1).max(24),
  icon: z.string().trim().max(16)
})
export type AgentDisplay = z.infer<typeof agentDisplay>
export type AgentPreferences = Record<string, AgentDisplay>

export function parsePreferences(value: unknown): AgentPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: AgentPreferences = {}
  for (const [code, item] of Object.entries(value).slice(0, 200)) {
    if (!/^[A-Z0-9_-]{1,80}$/.test(code)) continue
    const parsed = agentDisplay.safeParse(item)
    if (parsed.success) result[code] = parsed.data
  }
  return result
}

export function displayAgent(code: string, prefs: AgentPreferences): AgentDisplay {
  if (prefs[code]) return prefs[code]
  const known: Record<string, AgentDisplay> = {
    FACTORY_DIRECTOR: { shortName: 'Director', icon: '🎛️' },
    SOLUTION_ARCHITECT: { shortName: 'Arquitecto', icon: '📐' },
    DEV_BACKEND_SUPABASE: { shortName: 'Backend', icon: '⚙️' },
    DEV_FRONTEND: { shortName: 'Frontend', icon: '🖥️' },
    DEV_FRONTEND_WEB: { shortName: 'Web', icon: '🌐' },
    DEV_FRONTEND_IOS: { shortName: 'iOS', icon: '📱' },
    DEV_IOS_XCODE: { shortName: 'Xcode', icon: '🛠️' },
    DEV_JAVA_NATIVE_WINDOWS: { shortName: 'Java Windows', icon: '☕' },
    QA: { shortName: 'QA', icon: '🧪' },
    SECURITY: { shortName: 'Seguridad', icon: '🛡️' },
    RELEASE_DEPLOYMENT: { shortName: 'Despliegue', icon: '🚀' },
    PRODUCTION_VERIFICATION: { shortName: 'Verificación', icon: '🔎' }
  }
  if (known[code]) return known[code]
  if (code.startsWith('PO_')) return { shortName: code.replace('PO_', 'PO ').slice(0, 24), icon: '📋' }
  return { shortName: code.replaceAll('_', ' ').slice(0, 24), icon: '🤖' }
}
