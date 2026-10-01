import { useEffect, useState } from 'react'
import { elapsedLabel } from './workboard-model'

export function LiveElapsed({ start }: { start: string }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick) }
  }, [start])
  const label = elapsedLabel(start, now)
  return label ? <span className="elapsed" title="Tiempo transcurrido desde la aceptación del handoff">◷ {label}</span> : null
}
