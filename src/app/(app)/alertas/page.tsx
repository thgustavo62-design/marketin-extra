import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { maybeSyncAlerts } from '@/lib/alerts/sync'
import { listAlerts } from '@/lib/data'
import { ALERT_TYPES, SEVERITIES, isAlertStatus, isAlertType, isSeverity, type AlertStatusFilter } from '@/lib/domain'
import { getScope, scopeLabel } from '@/lib/scope'
import { AlertList } from './alert-list'

const TABS: [AlertStatusFilter, string][] = [['ativos', 'Ativos'], ['lidos', 'Lidos'], ['dispensados', 'Dispensados'], ['resolvidos', 'Resolvidos']]

export default async function Alertas({ searchParams }: { searchParams: Promise<{ s?: string; tipo?: string; sev?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  await maybeSyncAlerts() // reavalia se passou o intervalo mínimo
  const scope = await getScope()
  const status = isAlertStatus(sp.s) ? sp.s : 'ativos'
  const type = isAlertType(sp.tipo) ? sp.tipo : undefined
  const severity = isSeverity(sp.sev) ? sp.sev : undefined
  const rows = await listAlerts(user, { status, type, severity, brand: scope.brand?.slug, branchId: scope.branch?.id })
  const q = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    const m = { s: status === 'ativos' ? undefined : status, tipo: type, sev: severity, ...over }
    for (const [k, v] of Object.entries(m)) if (v) u.set(k, v)
    return `/alertas${u.size ? '?' + u : ''}`
  }

  return (
    <>
      <header className="page-head">
        <h1>Alertas</h1>
        <p>
          {scopeLabel(scope)} · {rows.length} {rows.length === 1 ? 'alerta' : 'alertas'}. Cada alerta é calculado sobre registros reais e leva ao item que precisa de ação; quando a causa some, ele é resolvido sozinho.
          Ler e dispensar valem só para você.
        </p>
      </header>
      <nav className="tabs" aria-label="Situação">
        {TABS.map(([k, label]) => <Link key={k} href={q({ s: k === 'ativos' ? undefined : k })} className={`tab${status === k ? ' active' : ''}`}>{label}</Link>)}
      </nav>
      <form className="filters" method="get">
        {status !== 'ativos' && <input type="hidden" name="s" value={status} />}
        <select name="tipo" defaultValue={type ?? ''} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(ALERT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="sev" defaultValue={severity ?? ''} aria-label="Severidade">
          <option value="">Todas as severidades</option>
          {Object.entries(SEVERITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" className="secondary">Filtrar</button>
      </form>
      <AlertList rows={rows} status={status} />
    </>
  )
}
