// Reavaliação dos alertas. Alerta é um FATO calculado sobre registros reais; não há texto digitado nem dado de outra filial misturado.
// Idempotente: a mesma condição reaproveita o mesmo alerta (dedupe_key); o que deixou de valer é marcado como resolvido.
import { pool, withTx } from '../db'
import {
  THRESHOLDS, TARGET_METRICS, approvalSeverity, daysBetween, dedupeKey, formatBR, monthRange, monthState, overdueSeverity, paceAlert, paceText, todayISO,
  type AlertType, type MetricKey, type Severity,
} from '../domain'
import { internalCounts } from '../targets/realized'

const MIN_SECONDS_BETWEEN_RUNS = 120

type Candidate = {
  type: AlertType; severity: Severity; brandId: string; branchId: string | null; objectType: 'post' | 'approval' | 'campaign_instance' | 'brand' | 'sync_run' | 'target'
  objectId: string; key: string; title: string; detail: string; href: string
}

// Quem pega a vez roda; os outros pulam. Assim o sino do cabeçalho pode chamar isto em toda página sem custo.
export async function maybeSyncAlerts(force = false): Promise<boolean> {
  const r = await pool.query(
    `update alert_sync_state set last_run = now() where id = 1 and ($1::boolean or last_run < now() - make_interval(secs => $2)) returning 1`, [force, MIN_SECONDS_BETWEEN_RUNS])
  if (!r.rowCount) return false
  await syncAlerts()
  return true
}

export async function syncAlerts(today = todayISO()): Promise<{ active: number; resolved: number }> {
  const c: Candidate[] = []
  const T = THRESHOLDS

  // 1) conteúdo atrasado (data de publicação vencida e ainda em andamento)
  for (const p of (await pool.query(
    `select id, brand_id, branch_id, title, stage, post_date::text as d from posts where stage not in ('publicado', 'cancelado') and post_date < $1::date order by post_date limit 500`, [today])).rows) {
    const late = daysBetween(p.d, today)
    c.push({ type: 'post_overdue', severity: overdueSeverity(late), brandId: p.brand_id, branchId: p.branch_id, objectType: 'post', objectId: p.id, key: dedupeKey('post_overdue', p.id),
      title: `Atrasado: ${p.title}`, detail: `Publicação prevista para ${formatBR(p.d)} (${late} ${late === 1 ? 'dia' : 'dias'} de atraso), ainda na etapa "${p.stage}".`, href: `/producao?abrir=${p.id}` })
  }
  // 2) conteúdo próximo sem responsável
  for (const p of (await pool.query(
    `select id, brand_id, branch_id, title, post_date::text as d from posts where assigned_to is null and stage in ('ideia', 'briefing', 'producao', 'revisao')
        and post_date between $1::date and $1::date + $2::int order by post_date limit 500`, [today, T.noOwnerDays])).rows) {
    c.push({ type: 'post_no_owner', severity: 'warning', brandId: p.brand_id, branchId: p.branch_id, objectType: 'post', objectId: p.id, key: dedupeKey('post_no_owner', p.id),
      title: `Sem responsável: ${p.title}`, detail: `Publicação em ${formatBR(p.d)} e ninguém está designado para produzir.`, href: `/producao?abrir=${p.id}` })
  }
  // 2b) lembrete de publicação: aprovado/agendado cuja data (e hora, se houver) chegou — a publicação é humana e precisa ser confirmada com o endereço
  for (const p of (await pool.query(
    `select id, brand_id, branch_id, title, publication_method, to_char(post_time, 'HH24:MI') as t from posts
      where stage in ('aprovado', 'agendado') and post_date = $1::date and (post_time is null or post_time <= (now() at time zone 'America/Sao_Paulo')::time) order by post_time nulls first limit 300`, [today])).rows) {
    c.push({ type: 'publish_due', severity: 'warning', brandId: p.brand_id, branchId: p.branch_id, objectType: 'post', objectId: p.id, key: dedupeKey('publish_due', p.id),
      title: `Hora de publicar: ${p.title}`, detail: `Previsto para hoje${p.t ? ' às ' + p.t : ''} (publicação ${p.publication_method === 'assistido' ? 'assistida' : 'manual'}). Publique na rede e confirme o endereço no cartão.`, href: `/producao?abrir=${p.id}` })
  }
  // 3) aprovação parada
  for (const a of (await pool.query(
    `select a.id, a.post_id, a.brand_id, p.branch_id, p.title, extract(epoch from (now() - a.created_at)) / 3600 as hours
       from approvals a join posts p on p.id = a.post_id
      where a.status = 'pending' and a.created_at < now() - make_interval(hours => $1) order by a.created_at limit 500`, [T.approvalStaleHours])).rows) {
    const h = Math.floor(Number(a.hours))
    c.push({ type: 'approval_stale', severity: approvalSeverity(h), brandId: a.brand_id, branchId: a.branch_id, objectType: 'approval', objectId: a.id, key: dedupeKey('approval_stale', a.id),
      title: `Aprovação parada: ${a.title}`, detail: `Aguardando decisão há ${h} horas (limite: ${T.approvalStaleHours} h).`, href: `/producao?abrir=${a.post_id}` })
  }
  // 4) campanha recorrente a começar sem reconfirmação de preço/validade
  for (const i of (await pool.query(
    `select i.id, i.template_id, i.brand_id, i.branch_id, t.name, i.occurrence_start::text as s from campaign_instances i join campaign_templates t on t.id = i.template_id
      where i.status = 'generated' and i.reconfirmed_at is null and i.occurrence_start <= $1::date + $2::int order by i.occurrence_start limit 200`, [today, T.campaignUnconfirmedDays])).rows) {
    const started = i.s <= today
    c.push({ type: 'campaign_unconfirmed', severity: started ? 'critical' : 'warning', brandId: i.brand_id, branchId: i.branch_id, objectType: 'campaign_instance', objectId: i.id,
      key: dedupeKey('campaign_unconfirmed', i.id), title: `${started ? 'Campanha já começou sem reconfirmação' : 'Campanha a iniciar sem reconfirmação'}: ${i.name}`,
      detail: `Início em ${formatBR(i.s)}. Produtos, preços, validade e estoque ainda não foram reconfirmados por uma pessoa.`, href: `/campanhas/modelos/${i.template_id}` })
  }
  // 5) arte final ausente com publicação próxima
  for (const p of (await pool.query(
    `select p.id, p.brand_id, p.branch_id, p.title, p.post_date::text as d from posts p
      where p.stage in ('aprovado', 'agendado') and p.post_date between $1::date and $1::date + $2::int
        and not exists (select 1 from content_asset_links k where k.post_id = p.id and k.role = 'final') order by p.post_date limit 300`, [today, T.finalMissingDays])).rows) {
    c.push({ type: 'final_missing', severity: 'warning', brandId: p.brand_id, branchId: p.branch_id, objectType: 'post', objectId: p.id, key: dedupeKey('final_missing', p.id),
      title: `Sem arte final: ${p.title}`, detail: `Publicação em ${formatBR(p.d)} e nenhum anexo marcado como "Final".`, href: `/producao?abrir=${p.id}` })
  }
  // 6) dados do Windsor sem atualização
  for (const b of (await pool.query(
    `select b.id, b.name, greatest(
        (select max(s.collected_at) from publication_metric_snapshots s join external_publications e on e.id = s.publication_id where e.brand_id = b.id),
        (select max(a.collected_at) from account_metric_snapshots a where a.brand_id = b.id)) as last
       from brands b`)).rows) {
    if (!b.last) continue // nunca coletou: não há "desatualizado", só ausência
    const age = daysBetween(new Date(b.last).toISOString().slice(0, 10), today)
    if (age >= T.integrationStaleDays) {
      c.push({ type: 'integration_stale', severity: 'info', brandId: b.id, branchId: null, objectType: 'brand', objectId: b.id, key: dedupeKey('integration_stale', b.id),
        title: `Dados do Windsor desatualizados: ${b.name}`, detail: `Última coleta há ${age} dias. As telas mostram o dado guardado como histórico.`, href: '/resultados/vinculos' })
    }
  }
  // 7) falha na coleta (última tentativa da filial falhou nos últimos 3 dias e não houve sucesso depois)
  for (const r of (await pool.query(
    `select r.id, r.brand_id, r.error_summary_safe, r.started_at::text as at from integration_sync_runs r
      where r.status = 'failed' and r.job_type = 'collect_metrics' and r.started_at > now() - interval '3 days' and r.brand_id is not null
        and not exists (select 1 from integration_sync_runs o where o.brand_id = r.brand_id and o.job_type = r.job_type and o.status = 'ok' and o.started_at > r.started_at)
        and r.started_at = (select max(x.started_at) from integration_sync_runs x where x.brand_id = r.brand_id and x.job_type = r.job_type)`)).rows) {
    c.push({ type: 'collect_failed', severity: 'warning', brandId: r.brand_id, branchId: null, objectType: 'sync_run', objectId: r.id, key: dedupeKey('collect_failed', r.id),
      title: 'Falha na coleta de métricas', detail: r.error_summary_safe ?? 'A última coleta não terminou.', href: '/resultados/vinculos' })
  }
  // 8) metas internas fora do ritmo (só com dado suficiente)
  const targets = (await pool.query(
    `select t.id, t.brand_id, t.branch_id, t.metric_key, t.target_value::float8 as target, t.period_start::text as ps from brand_targets t
      where t.expected_source = 'internal' and t.period_end >= $1::date - 7 and t.period_start <= $1::date`, [today])).rows
  const cache = new Map<string, { planned: number; published: number }>()
  for (const t of targets) {
    const ym = t.ps.slice(0, 7), ck = `${t.brand_id}|${t.branch_id ?? ''}|${ym}`
    if (!cache.has(ck)) cache.set(ck, await internalCounts(t.brand_id, t.branch_id, ym))
    const counts = cache.get(ck)!
    const key = t.metric_key as MetricKey
    const realized = key === 'posts_planned' ? counts.planned : key === 'posts_published' ? counts.published : null
    const st = monthState(ym, today)
    const p = paceAlert(TARGET_METRICS[key], t.target, realized, st.state, st.elapsed, monthRange(ym).days)
    if (p && realized !== null) {
      const txt = paceText(TARGET_METRICS[key].label, p, realized, t.target)
      c.push({ type: 'target_pace', severity: p.kind === 'missed' ? 'warning' : 'info', brandId: t.brand_id, branchId: t.branch_id, objectType: 'target', objectId: t.id,
        key: dedupeKey('target_pace', t.id, p.kind), title: txt.title, detail: txt.detail, href: `/resultados/metas?mes=${ym}` })
    }
  }

  // ---- grava: upsert dos que valem agora, resolve os que deixaram de valer ----
  const stamp = new Date().toISOString()
  return withTx(async (db) => {
    for (const a of c) {
      await db.query(
        `insert into notification_events (brand_id, branch_id, type, severity, object_type, object_id, dedupe_key, title, detail, href, last_seen_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (dedupe_key) do update set severity = excluded.severity, title = excluded.title, detail = excluded.detail, href = excluded.href,
           last_seen_at = excluded.last_seen_at, resolved_at = null`,
        [a.brandId, a.branchId, a.type, a.severity, a.objectType, a.objectId, a.key, a.title.slice(0, 200), a.detail.slice(0, 400), a.href, stamp])
    }
    const res = await db.query(`update notification_events set resolved_at = now() where resolved_at is null and last_seen_at < $1::timestamptz`, [stamp])
    return { active: c.length, resolved: res.rowCount ?? 0 }
  })
}
