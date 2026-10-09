import { AlertTriangle } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { ConfirmButton } from '@/components/confirm-button'
import { requireAdmin } from '@/lib/auth'
import { getBranches, getBrands, getIntegrationAccounts } from '@/lib/data'
import { resolveAccount, type AccountKind } from '@/lib/integrations'
import { windsorQuery } from '@/lib/windsor'
import { deleteMappingAction, saveAliasesAction } from './actions'
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
  const mapList = maps.map((m) => ({ account_name: m.account_name, kind: m.kind as AccountKind, brand_id: m.brand_id, branch_id: m.branch_id }))
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? '—'

  // Todas as contas conhecidas: as que o Windsor lista agora + as associadas à mão (caso o Windsor esteja fora do ar).
  const accounts: { kind: AccountKind; name: string }[] = [
    ...ig.names.map((name) => ({ kind: 'instagram' as const, name })),
    ...ads.names.map((name) => ({ kind: 'ads' as const, name })),
  ]
  for (const m of mapList) if (!accounts.some((a) => a.kind === m.kind && a.name === m.account_name)) accounts.push({ kind: m.kind, name: m.account_name })
  const resolved = accounts.map((a) => ({ ...a, r: resolveAccount(a.name, a.kind, mapList, brands) }))
  const unidentified = resolved.filter((a) => !a.r)

  const rows: Row[] = [
    { name: 'Banco de dados (Supabase)', state: 'on', label: 'Ativo', note: 'Conteúdos, campanhas, unidades, usuários e base de informações são salvos aqui.' },
    {
      name: 'Windsor.ai — métricas do Instagram e do Meta Ads',
      state: !windsorKey ? 'off' : problems.length ? 'partial' : 'on',
      label: !windsorKey ? 'Não conectado' : problems.length ? 'Com aviso' : 'Ativo (leitura)',
      note: `${ig.names.length} conta(s) de Instagram e ${ads.names.length} de anúncios visíveis. Os Resultados leem direto do Windsor, sem guardar cópia no banco.`,
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

      <section aria-labelledby="contas" style={{ marginTop: 28 }}>
        <h2 id="contas" className="eyebrow">Contas do Windsor e a filial de cada uma</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          O sistema reconhece a filial pelo nome da conta, usando os apelidos abaixo. É isso que separa as informações da Minas Farma e da Farma e Farma nos Resultados.
        </p>
        {unidentified.length > 0 && (
          <div className="notice info"><AlertTriangle size={18} /><span>Sem filial identificada: <b>{unidentified.map((a) => a.name).join(' · ')}</b>. Adicione um apelido ou associe à mão abaixo. Enquanto isso só aparecem em “Todas as filiais”, sinalizadas.</span></div>
        )}
        {resolved.length === 0 ? <p className="empty">Nenhuma conta encontrada no Windsor.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tipo</th><th>Conta no Windsor</th><th>Filial</th><th>Como foi identificada</th><th /></tr></thead>
              <tbody>
                {resolved.map((a) => {
                  const manual = maps.find((m) => m.kind === a.kind && m.account_name === a.name)
                  return (
                    <tr key={`${a.kind}:${a.name}`}>
                      <td>{a.kind === 'ads' ? 'Anúncios' : 'Instagram'}</td>
                      <td><b>{a.name}</b></td>
                      <td>{a.r ? <>{brandName(a.r.brandId)}{manual?.branch_name && <small className="muted"> · {manual.branch_name}</small>}</> : <span className="pill warn">Não identificada</span>}</td>
                      <td>{!a.r ? '—' : a.r.source === 'auto' ? <span className="pill on">Pelo nome da conta</span> : <span className="pill soft">Associação manual</span>}</td>
                      <td>
                        {manual && (
                          <form action={deleteMappingAction}>
                            <input type="hidden" name="id" value={manual.id} />
                            <ConfirmButton className="link-danger" message="Remover a associação manual?">Remover</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="apelidos">
        <h2 id="apelidos" className="eyebrow">Apelidos de cada filial</h2>
        <div className="cards">
          {brands.map((b) => (
            <article key={b.id} className="card">
              <h3>{b.name}</h3>
              <p className="muted">Se o nome da conta contiver um destes trechos, ela é desta filial (sem diferenciar maiúsculas, acentos nem espaços).</p>
              <ActionForm action={saveAliasesAction} submit="Salvar apelidos" pending="Salvando…">
                <input type="hidden" name="brand_id" value={b.id} />
                <label htmlFor={`al-${b.slug}`}>Apelidos (separe por vírgula)</label>
                <textarea id={`al-${b.slug}`} name="aliases" rows={3} defaultValue={b.aliases.join(', ')} />
              </ActionForm>
            </article>
          ))}
        </div>
      </section>

      <section id="form" aria-labelledby="nova" className="card narrow-lg">
        <h2 id="nova" className="eyebrow">Associar uma conta à mão (exceção)</h2>
        <p className="muted">Use só quando o nome da conta não indica a filial e você não quer criar um apelido.</p>
        <MappingForm brands={brands} branches={branches} discovered={{ instagram: ig.names, ads: ads.names }} />
      </section>
    </>
  )
}
