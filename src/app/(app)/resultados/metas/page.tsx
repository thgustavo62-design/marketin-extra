import Link from 'next/link'
import { Suspense } from 'react'
import { requireUser } from '@/lib/auth'
import { listAssignableUsers, listTargets, type Target } from '@/lib/data'
import {
  MONTH_NAMES, TARGET_METRICS, changeVs, formatValue, isYearMonth, monthState, previousMonth, progress, todayISO,
} from '@/lib/domain'
import { canWrite } from '@/lib/perms'
import { getScope, scopeLabel } from '@/lib/scope'
import { loadRealized, type Realized, type RealizedMap } from '@/lib/targets/realized'
import { DeleteTarget } from './delete-target'
import { TargetForm } from './target-form'

// Leitura de várias contas no Windsor pode demorar: até 1 minuto.
export const maxDuration = 60

const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`

function SourceTag({ r }: { r: Realized }) {
  if (r.source === 'internal') return <small className="muted">dado do próprio sistema</small>
  if (r.source === 'live') return <small className="muted">Windsor, leitura de agora</small>
  if (r.source === 'history') return <small className="pill off">Histórico — atualizado em {r.asOf ? new Date(r.asOf).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</small>
  return <small className="muted">sem dado</small>
}

async function Goals({ targets, month, canEdit }: { targets: Target[]; month: string; canEdit: boolean }) {
  const today = todayISO()
  const prev = previousMonth(month)
  const st = monthState(month, today)
  // Uma leitura por filial/unidade (a meta de cada indicador reaproveita a mesma leitura).
  const keys = [...new Set(targets.map((t) => `${t.brand_id}|${t.branch_id ?? ''}`))]
  const loaded = new Map<string, { cur: RealizedMap; prev: RealizedMap }>()
  await Promise.all(keys.map(async (k) => {
    const [brandId, branchId] = k.split('|')
    const [cur, prv] = await Promise.all([
      loadRealized({ brandId, branchId: branchId || null, month, today }),
      loadRealized({ brandId, branchId: branchId || null, month: prev, today }),
    ])
    loaded.set(k, { cur, prev: prv })
  }))

  if (targets.length === 0) return <p className="empty">Nenhuma meta para {monthLabel(month)} neste recorte.</p>
  return (
    <div className="cards">
      {targets.map((t) => {
        const def = TARGET_METRICS[t.metric_key]
        const l = loaded.get(`${t.brand_id}|${t.branch_id ?? ''}`)!
        const cur = l.cur[t.metric_key], prv = l.prev[t.metric_key]
        const p = progress(def, cur.value, t.target_value, st.state)
        const delta = changeVs(cur.value, prv.value)
        return (
          <article key={t.id} className="card goal" data-metric={t.metric_key} data-status={p.status}>
            <h3>{def.label} <span className={`pill ${p.status === 'atingida' || p.status === 'dentro' ? 'on' : p.status === 'abaixo' || p.status === 'acima' ? 'off' : 'soft'}`}>{p.label}</span></h3>
            <p className="muted">{t.brand_name} · {t.branch_name ?? 'filial inteira'}{t.owner_name ? ` · responsável: ${t.owner_name}` : ''}</p>
            <p className="goal-numbers">
              <span><small>{def.direction === 'atMost' ? 'Teto' : 'Meta'}</small><b>{formatValue(def, t.target_value)}</b></span>
              <span><small>Realizado{st.state === 'current' ? ` (dia ${st.elapsed} de ${st.days})` : ''}</small><b>{formatValue(def, cur.value)}</b></span>
              <span><small>{def.direction === 'atMost' ? 'Do teto' : 'Da meta'}</small><b>{p.pct === null ? 'N/D' : `${p.pct.toFixed(0)}%`}</b></span>
            </p>
            {p.pct !== null && <div className="bar"><i style={{ width: `${Math.min(100, p.pct)}%` }} /></div>}
            <p><SourceTag r={cur} /></p>
            <p className="muted">
              Mês anterior ({monthLabel(prev)}): <b>{formatValue(def, prv.value)}</b>{delta === null ? '' : ` (${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')}%)`}
              {prv.source === 'history' ? ' · histórico' : ''}. A comparação mostra a diferença; não indica o que a causou.
            </p>
            {t.notes && <p>{t.notes}</p>}
            <p className="muted"><small>{def.note}</small></p>
            {canEdit && <div className="card-actions"><DeleteTarget id={t.id} /></div>}
          </article>
        )
      })}
    </div>
  )
}

export default async function Metas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser()
  const sp = await searchParams
  const scope = await getScope()
  const today = todayISO()
  const month = isYearMonth(sp.mes) ? sp.mes : today.slice(0, 7)
  const canEdit = canWrite(user.role)
  const targets = await listTargets({ brand: scope.brand?.slug, branchId: scope.branch?.id, month })
  const people = canEdit ? Object.fromEntries(await Promise.all(scope.brands.map(async (b) => [b.id, await listAssignableUsers(b.id)] as const))) : {}

  return (
    <>
      <header className="page-head row">
        <div>
          <h1>Metas</h1>
          <p>
            {scopeLabel(scope)} · {monthLabel(month)}. Compara meta e realizado sem concluir causa. Alcance não é aditivo, por isso não existe meta de “soma de alcance”;
            o alcance único da conta fica em Insights. Quando o Windsor não responde, aparece o último dado guardado, identificado como histórico.
          </p>
        </div>
        <form method="get" className="filters">
          <input type="month" name="mes" defaultValue={month} aria-label="Mês" />
          <button type="submit" className="secondary">Ver</button>
        </form>
      </header>
      {canEdit && (
        <TargetForm
          brands={scope.brands.map((b) => ({ id: b.id, name: b.name }))}
          branches={scope.branches.filter((b) => b.active).map((b) => ({ id: b.id, brand_id: b.brand_id, name: b.name }))}
          people={people} defaultBrandId={scope.brand?.id} defaultMonth={month}
        />
      )}
      <Suspense fallback={<div className="mcard skeleton" />}>
        <Goals targets={targets} month={month} canEdit={canEdit} />
      </Suspense>
      <p className="muted"><Link href="/resultados/vinculos" className="inline-link">Ver publicações vinculadas</Link></p>
    </>
  )
}
