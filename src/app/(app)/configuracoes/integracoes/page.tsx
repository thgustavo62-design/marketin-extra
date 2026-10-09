import { AlertTriangle } from 'lucide-react'
import { ConfirmButton } from '@/components/confirm-button'
import { requireAdmin } from '@/lib/auth'
import { getBranches, getBrands, getIntegrationAccounts } from '@/lib/data'
import { windsorQuery } from '@/lib/windsor'
import { deleteMappingAction } from './actions'
import { MappingForm } from './mapping-form'

type Row = { name: string; state: 'on' | 'partial' | 'off'; label: string; note: string }

async function discover(connector: 'instagram' | 'facebook') {
  const r = await windsorQuery<{ account_name?: string }>(connector, ['account_name'], 'last_30d')
  const names = r.status === 'ok' ? [...new Set(r.rows.map((x) => x.account_name).filter((n): n is string => !!n))] : []
  return { r, names }
}

export default async function Integracoes() {
  await requireAdmin()
  const [brands, branches, maps, ig, ads] = await Promise.all([getBrands(), getBranches(), getIntegrationAccounts(), discover('instagram'), discover('facebook')])
  const windsorKey = Boolean(process.env.WINDSOR_API_KEY)
  const problems = [ig.r, ads.r].filter((r) => r.status === 'paused' || r.status === 'error')
  const mapped = new Set(maps.map((m) => `${m.kind}:${m.account_name}`))
  const unmapped = [
    ...ig.names.filter((n) => !mapped.has(`instagram:${n}`)).map((n) => `Instagram: ${n}`),
    ...ads.names.filter((n) => !mapped.has(`ads:${n}`)).map((n) => `Anúncios: ${n}`),
  ]

  const rows: Row[] = [
    { name: 'Banco de dados (Supabase)', state: 'on', label: 'Ativo', note: 'Conteúdos, campanhas, filiais, usuários e base de informações são salvos aqui.' },
    {
      name: 'Windsor.ai — métricas do Instagram e do Meta Ads',
      state: !windsorKey ? 'off' : problems.length ? 'partial' : 'on',
      label: !windsorKey ? 'Não conectado' : problems.length ? 'Com aviso' : 'Ativo (leitura)',
      note: `${ig.names.length} conta(s) de Instagram e ${ads.names.length} de anúncios visíveis. As páginas de Resultados leem direto do Windsor, sem guardar cópia no banco.`,
    },
    { name: 'Geração com modelo de IA', state: 'off', label: 'Não conectado', note: 'O gerador atual usa modelos editoriais fixos (Gerar semana).' },
    { name: 'Pesquisa recorrente na internet', state: 'off', label: 'Não ativada', note: 'Depende de fontes aprovadas e de uma rotina agendada.' },
    { name: 'Publicação automática no Instagram', state: 'off', label: 'Não conectada', note: 'As datas do calendário são planejamento, não agendamento na Meta.' },
  ]

  return (
    <>
      <header className="page-head">
        <h1>Integrações</h1>
        <p>O que está realmente ativo. Nada é mostrado como conectado sem estar.</p>
      </header>

      <ul className="status">
        {rows.map((r) => (
          <li key={r.name}>
            <b className={r.state === 'on' ? '' : r.state === 'partial' ? 'mid' : 'off'}>{r.label}</b>
            <span><strong>{r.name}</strong><br /><small className="muted">{r.note}</small></span>
          </li>
        ))}
      </ul>

      {problems.map((p, i) => (
        <div key={i} className="notice" role="alert" style={{ marginTop: 16 }}>
          <AlertTriangle size={18} />
          <span>
            {p.status === 'paused'
              ? <>O Windsor pausou as leituras e devolveu aviso no lugar dos dados: <i>{p.message}</i>. Nenhum número é exibido enquanto isso durar. Reduza as contas conectadas ou mude de plano no Windsor.</>
              : <>Falha ao consultar o Windsor{p.status === 'error' ? `: ${p.message}` : '.'}</>}
          </span>
        </div>
      ))}

      <section aria-labelledby="map" style={{ marginTop: 28 }}>
        <h2 id="map" className="eyebrow">Contas associadas a rede e filial</h2>
        <p className="muted" style={{ marginBottom: 12 }}>É isso que separa os resultados por filial: cada conta do Windsor pertence a uma rede (e, se quiser, a uma filial).</p>
        {unmapped.length > 0 && (
          <div className="notice info"><AlertTriangle size={18} /><span>Contas ainda sem associação: <b>{unmapped.join(' · ')}</b>. Elas só aparecem em “Todas as redes”, sinalizadas.</span></div>
        )}
        {maps.length === 0 ? <p className="empty">Nenhuma conta associada ainda.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tipo</th><th>Conta no Windsor</th><th>Rede</th><th>Filial</th><th /></tr></thead>
              <tbody>
                {maps.map((m) => (
                  <tr key={m.id}>
                    <td>{m.kind === 'ads' ? 'Anúncios' : 'Instagram'}</td>
                    <td><b>{m.account_name}</b></td>
                    <td>{m.brand_name ?? '—'}</td>
                    <td>{m.branch_name ?? 'Rede inteira'}</td>
                    <td>
                      <form action={deleteMappingAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <ConfirmButton className="link-danger" message="Remover esta associação?">Remover</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="form" aria-labelledby="nova" className="card narrow-lg">
        <h2 id="nova" className="eyebrow">Associar conta</h2>
        <MappingForm brands={brands} branches={branches} discovered={{ instagram: ig.names, ads: ads.names }} />
      </section>
    </>
  )
}
