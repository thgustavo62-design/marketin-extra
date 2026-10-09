import { requireUser } from '@/lib/auth'

// Mostra o estado REAL de cada integração. Nada aqui é apresentado como conectado se não estiver.
type Row = { name: string; state: 'on' | 'partial' | 'off'; label: string; note: string }

export default async function Fontes() {
  await requireUser()
  const windsorKey = Boolean(process.env.WINDSOR_API_KEY)
  const rows: Row[] = [
    { name: 'Banco de dados (Supabase)', state: 'on', label: 'Ativo', note: 'Conteúdos, campanhas, unidades e base de informações são salvos aqui.' },
    {
      name: 'Windsor.ai (métricas do Instagram e anúncios)',
      state: windsorKey ? 'partial' : 'off',
      label: windsorKey ? 'Chave configurada — importação ainda não construída' : 'Não conectado',
      note: 'Contas conectadas até agora: Instagram e anúncios da Farma e Farma. Minas Farma ainda não. Os resultados desta versão são preenchidos manualmente.',
    },
    { name: 'Geração com modelo de IA', state: 'off', label: 'Não conectado', note: 'O gerador atual usa modelos editoriais fixos (Gerar semana).' },
    { name: 'Pesquisa recorrente na internet', state: 'off', label: 'Não ativada', note: 'Depende de fontes aprovadas e de uma rotina agendada (Etapa 4).' },
    { name: 'Publicação automática no Instagram', state: 'off', label: 'Não conectada', note: 'Datas do calendário são planejamento, não agendamento na Meta.' },
  ]
  return (
    <>
      <header className="page-head">
        <h1>Fontes e integrações</h1>
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
    </>
  )
}
