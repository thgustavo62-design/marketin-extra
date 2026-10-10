import Link from 'next/link'
import { Bell, CalendarDays, Flag, Megaphone, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { getExecutive } from '@/lib/data/executive'
import { fmtNum, fmtPct } from '@/lib/domain'

const brl = (n: number | null) => (n === null ? 'N/D' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null)

// Visão executiva: por filial, lado a lado. Tudo vem do que está guardado; cada cartão abre a listagem que o explica.
export async function ExecutiveView({ brands, branchId, today }: { brands: { id: string; slug: string; name: string }[]; branchId: string | null; today: string }) {
  const rows = await getExecutive(brands, branchId, today)
  if (rows.length === 0) return <p className="empty">Nenhuma filial disponível.</p>
  return (
    <>
      <p className="muted">
        Resultados orgânicos e pagos vêm das coletas guardadas (não de leitura ao vivo) e mostram a data. “N/D” significa que o dado não existe — não é zero. Comparações mostram diferença, não causa.
      </p>
      <div className="cards">
        {rows.map((r) => {
          const delta = r.pubsPrev > 0 ? ((r.pubsCur - r.pubsPrev) / r.pubsPrev) * 100 : null
          return (
            <article key={r.brandId} className="card exec" data-brand={r.name}>
              <h3>{r.name}</h3>
              <div className="exec-grid">
                <Link href="/planejamento/conteudos?etapa=publicado" className="kpi">
                  <small>Publicados no mês</small><strong className="v-green">{fmtNum(r.published)}</strong><em>de {fmtNum(r.planned)} planejados</em>
                  <span className="ico green"><CalendarDays size={18} /></span>
                </Link>
                <Link href="/resultados/vinculos" className="kpi">
                  <small>Publicações reais (28 dias)</small><strong className="v-blue">{fmtNum(r.pubsCur)}</strong>
                  <em>
                    {delta === null ? 'sem base de comparação' : <>{delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(0)}% vs. 28 dias antes ({fmtNum(r.pubsPrev)})</>}
                  </em>
                </Link>
                <Link href="/resultados/vinculos" className="kpi">
                  <small>Engajamento (mediana)</small><strong>{r.engagement.enough ? fmtPct(r.engagement.median) : 'N/D'}</strong>
                  <em>{r.engagement.enough ? `n=${r.engagement.n}, publicações com 7+ dias` : `amostra pequena (n=${r.engagement.n})`}</em>
                </Link>
                <Link href="/resultados/metas" className="kpi">
                  <small>Investimento no mês</small><strong>{brl(r.spend)}</strong>
                  <em>{r.dataAsOf ? `Histórico — atualizado em ${when(r.dataAsOf)}` : 'sem coleta de anúncios'}</em>
                  <span className="ico amber"><Wallet size={18} /></span>
                </Link>
                <Link href="/resultados/metas" className="kpi">
                  <small>Metas do mês</small><strong>{r.goals.total === 0 ? '—' : `${r.goals.hit}/${r.goals.total}`}</strong>
                  <em>{r.goals.total === 0 ? 'nenhuma cadastrada' : `${r.goals.behind} fora do ritmo ou do teto`}</em>
                  <span className="ico blue"><Flag size={18} /></span>
                </Link>
                <Link href="/alertas?sev=critical" className="kpi">
                  <small>Alertas críticos</small><strong className={r.criticalAlerts ? 'v-red' : ''}>{fmtNum(r.criticalAlerts)}</strong><em>abrir a central</em>
                  <span className="ico amber"><Bell size={18} /></span>
                </Link>
              </div>
              <p className="muted">
                Conversas iniciadas: <b>{fmtNum(r.conversations)}</b> · custo por conversa: <b>{brl(r.costPerConversation)}</b> · seguidores: <b>{fmtNum(r.followers)}</b>
              </p>
            </article>
          )
        })}
      </div>
      <p className="muted">
        <Megaphone size={13} style={{ verticalAlign: '-2px' }} /> Quer o detalhe? <Link href="/resultados/relatorios" className="inline-link">Gerar relatório executivo</Link> (PDF/CSV).
      </p>
    </>
  )
}
