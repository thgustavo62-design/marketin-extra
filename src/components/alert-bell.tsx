import Link from 'next/link'
import { Bell } from 'lucide-react'
import { maybeSyncAlerts } from '@/lib/alerts/sync'
import { countUnreadAlerts } from '@/lib/data'
import type { SessionUser } from '@/lib/session'

// Sino do cabeçalho: reavalia os alertas se passou o intervalo mínimo (uma consulta barata) e mostra quantos ainda não foram lidos.
export async function AlertBell({ user }: { user: SessionUser }) {
  let n = 0
  try {
    await maybeSyncAlerts()
    n = await countUnreadAlerts(user)
  } catch (e) {
    // o sino nunca derruba a página, mas a falha precisa aparecer no log do servidor (sem dados sensíveis)
    console.error('[alertas] falha ao reavaliar/contar:', e instanceof Error ? e.message : 'erro')
  }
  return (
    <Link href="/alertas" className="bell" aria-label={n > 0 ? `Alertas: ${n} não lidos` : 'Alertas'}>
      <Bell size={18} />
      {n > 0 && <span className="bell-count">{n > 99 ? '99+' : n}</span>}
    </Link>
  )
}
