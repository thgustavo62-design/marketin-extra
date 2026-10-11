// Conferência de texto de publicidade contra a RDC 96/2008 da Anvisa (propaganda de medicamentos).
// APOIO À REVISÃO: procura termos e padrões do texto; não entende imagens, contexto nem substitui o responsável técnico.
// Cada ponto cita o artigo da norma. Texto das regras: https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2008/res0096_17_12_2008.html

export type IssueLevel = 'vedado' | 'revisar' | 'lembrete'
export type AdIssue = { code: string; level: IssueLevel; article: string; message: string; excerpt: string | null }

const strip = (s: string) => s.normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '')

// Palavras que indicam que o texto fala de medicamento (as regras da RDC 96 valem para propaganda de medicamentos).
const MED_CONTEXT = /\b(medicamento|medicamentos|remedio|remedios|comprimido|comprimidos|capsula|capsulas|xarope|pomada|gotas|generico|genericos|antibiotico|analgesico|antitermico|anti-inflamatorio|dipirona|paracetamol|ibuprofeno|dorflex|tarja|posologia|bula|mg)\b/
const RX_CONTEXT = /\b(tarja vermelha|tarja preta|antibiotico|antibioticos|controlado|controlados|amoxicilina|azitromicina|semaglutida|ozempic|rivotril|clonazepam|zolpidem|tramadol|receita retida)\b/

type Rule = { code: string; level: IssueLevel; article: string; re: RegExp; message: string; medOnly?: boolean }

const RULES: Rule[] = [
  { code: 'imperativo', level: 'vedado', article: 'art. 8º, VII', re: /\b(tenha|tome|use|experimente)\b/g, message: 'Imperativo que induz diretamente ao consumo de medicamento ("tenha", "tome", "use", "experimente").', medOnly: true },
  { code: 'comprovacao', level: 'vedado', article: 'art. 26, I', re: /\b(comprovado cientificamente|cientificamente comprovado|demonstrado em ensaios clinicos|estudos comprovam|comprovadamente eficaz)\b/g, message: 'Medicamento isento de prescrição não pode usar "comprovado cientificamente" nem "demonstrado em ensaios clínicos".', medOnly: true },
  { code: 'sabor', level: 'vedado', article: 'art. 8º, VI', re: /\b(saboroso|gostoso|delicioso|saborosa|gostosa|deliciosa)\b/g, message: 'Não se pode sugerir que o medicamento tenha sabor agradável.', medOnly: true },
  { code: 'unica_alternativa', level: 'vedado', article: 'art. 26, II', re: /\b(unico tratamento|unica solucao|unica alternativa|dispensa (a )?consulta|nao precisa de medico|sem precisar de medico|dispensa o medico)\b/g, message: 'Não se pode sugerir que o medicamento é a única alternativa nem que consulta médica e hábitos saudáveis são supérfluos.', medOnly: true },
  { code: 'diagnostico', level: 'revisar', article: 'art. 8º, II', re: /\b(voce (esta|tem) com|se voce sente|sintomas de [a-z ]{3,30}\?|descubra se voce tem)\b/g, message: 'Sugerir ou estimular diagnóstico ao público é vedado: confira se o texto não induz o leitor a se autodiagnosticar.', medOnly: true },
  { code: 'saude_afetada', level: 'revisar', article: 'art. 8º, XI', re: /\b(nao deixe (sua|a) saude|sua saude (corre|esta em) risco|sem (o|este) (medicamento|remedio) voce)\b/g, message: 'Não se pode sugerir que a saúde será afetada por não usar o medicamento.', medOnly: true },
  { code: 'celebridade', level: 'revisar', article: 'art. 26, III', re: /\b(influenciador|influenciadora|famoso|famosa|celebridade|digital influencer)\b/g, message: 'Celebridade (pessoa leiga em medicina/farmácia) não pode afirmar que usa nem recomendar medicamento isento de prescrição.', medOnly: true },
  { code: 'novo', level: 'revisar', article: 'art. 8º, IV', re: /\b(novo medicamento|lancamento|novidade)\b/g, message: 'Só se pode anunciar como "novo" até 2 anos após o início da comercialização no Brasil. Confirme a data.', medOnly: true },
  { code: 'fidelidade', level: 'vedado', article: 'art. 10', re: /\b(pontos?|sorteio|sorteios|brinde|brindes|premio|premios|troque)\b/g, message: 'Programas de fidelidade de farmácias não podem ter medicamentos como objeto de pontuação, troca, sorteio ou prêmio.', medOnly: true },
  { code: 'expectativa', level: 'revisar', article: 'art. 8º, IX', re: /\b(corra|ultimas unidades|so hoje|estoque limitado|nao perca)\b/g, message: 'Criar expectativa de venda em propaganda de medicamento é vedado: confira se a urgência/escassez está falando de medicamento.', medOnly: true },
]

const excerptOf = (orig: string, i: number, len: number): string => {
  const a = Math.max(0, i - 25), b = Math.min(orig.length, i + len + 25)
  return (a > 0 ? '…' : '') + orig.slice(a, b).replace(/\s+/g, ' ').trim() + (b < orig.length ? '…' : '')
}

/**
 * @param text título + legenda + roteiro do conteúdo
 * @param opts.pillar pilar do conteúdo ("medicamentos" força o contexto de medicamento)
 */
export function checkAdvertising(text: string, opts: { pillar?: string } = {}): { appliesToMedicine: boolean; issues: AdIssue[] } {
  const orig = strip(text) === text ? text : text.normalize('NFC')
  const norm = strip(orig).toLowerCase()
  const med = opts.pillar === 'medicamentos' || MED_CONTEXT.test(norm)
  if (!med) return { appliesToMedicine: false, issues: [] }
  const issues: AdIssue[] = []
  const seen = new Set<string>()
  const push = (i: AdIssue) => { const k = `${i.code}|${i.excerpt}`; if (!seen.has(k)) { seen.add(k); issues.push(i) } }

  for (const r of RULES) {
    for (const m of norm.matchAll(r.re)) push({ code: r.code, level: r.level, article: r.article, message: r.message, excerpt: excerptOf(orig, m.index ?? 0, m[0].length) })
  }
  // medicamento de venda sob prescrição só pode ser divulgado a profissionais de saúde
  const rx = RX_CONTEXT.exec(norm)
  if (rx) push({ code: 'prescricao', level: 'vedado', article: 'art. 27', message: 'Parece citar medicamento de venda sob prescrição: a propaganda fica restrita a meios destinados a profissionais de saúde (não vale para redes sociais abertas).', excerpt: excerptOf(orig, rx.index, rx[0].length) })
  // desconto/preço promocional sem o preço integral (art. 11 §4)
  const promo = /(\d{1,3}\s?%\s?(de\s)?(desconto|off)|desconto de \d|por r\$\s?\d|a partir de r\$\s?\d|oferta)/.exec(norm)
  const full = /(de r\$\s?\d|preco integral|preco normal|preco cheio|de:\s?r\$)/.test(norm)
  if (promo && !full) push({ code: 'preco_integral', level: 'revisar', article: 'art. 11, § 4º', message: 'Ao informar percentual de desconto ou preço promocional, o preço integral praticado também deve ser informado.', excerpt: excerptOf(orig, promo.index, promo[0].length) })
  // lembrete da advertência obrigatória dos isentos de prescrição (art. 22)
  if (!/se persistirem os sintomas/.test(norm) && !rx) issues.push({ code: 'advertencia', level: 'lembrete', article: 'art. 22', message: 'Propaganda de medicamento isento de prescrição deve trazer "SE PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO" (e as advertências específicas do anexo da norma). Confira com o responsável técnico.', excerpt: null })
  const order: Record<IssueLevel, number> = { vedado: 0, revisar: 1, lembrete: 2 }
  return { appliesToMedicine: true, issues: issues.sort((a, b) => order[a.level] - order[b.level]) }
}

export const ISSUE_LABEL: Record<IssueLevel, string> = { vedado: 'Vedado pela norma', revisar: 'Revisar', lembrete: 'Lembrete' }
