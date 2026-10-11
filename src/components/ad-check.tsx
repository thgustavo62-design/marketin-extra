import { ISSUE_LABEL, checkAdvertising, type AdIssue } from '@/lib/domain'

// Conferência de texto de publicidade contra a RDC 96/2008 (Anvisa). Apoio à revisão: procura termos; não vê imagens nem substitui o responsável técnico.
export function AdCheckPanel({ text, pillar }: { text: string; pillar?: string }) {
  const r = checkAdvertising(text, { pillar })
  const vedados = r.issues.filter((i) => i.level === 'vedado').length
  return (
    <section className="card ad-check" aria-label="Conferência de publicidade (RDC 96/2008)" data-ad-check={r.appliesToMedicine ? (vedados ? 'vedado' : r.issues.length ? 'revisar' : 'ok') : 'na'}>
      <h3>Conferência de publicidade — RDC 96/2008 <small className="muted">texto salvo</small></h3>
      {!r.appliesToMedicine ? (
        <p className="muted">O texto não menciona medicamento, então as regras de propaganda de medicamentos não foram aplicadas. Se o conteúdo fala de medicamento sem usar essas palavras, marque o pilar “Medicamentos”.</p>
      ) : r.issues.length === 0 ? (
        <p className="form-ok">Nenhum ponto de atenção encontrado no texto.</p>
      ) : (
        <ul className="ad-issues">
          {r.issues.map((i: AdIssue, k) => (
            <li key={k} data-level={i.level}>
              <span className={`pill ${i.level === 'vedado' ? 'off' : i.level === 'revisar' ? 'soft' : 'on'}`}>{ISSUE_LABEL[i.level]}</span> <small className="muted">{i.article}</small>
              <p>{i.message}</p>
              {i.excerpt && <p className="ad-excerpt">“{i.excerpt}”</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="muted"><small>Regras: Resolução RDC nº 96/2008 da Anvisa. É uma checagem automática de palavras e padrões; a revisão do farmacêutico responsável continua obrigatória. Veja as regras em Inteligência › Mercado e pesquisas.</small></p>
    </section>
  )
}
