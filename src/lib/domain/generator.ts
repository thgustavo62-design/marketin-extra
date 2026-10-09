// Gerador semanal por modelos editoriais (sem IA, sem inventar dados).
import { addDays, formatBR } from './dates.ts'
import type { Format, Pillar } from './labels.ts'
import { REELS_TEMPLATE_TIMES, emptyReels, type ReelsScript } from './reels.ts'
import { campaignCoversPeriod } from './rules.ts'

// ---------- gerador semanal ----------
export type Draft = {
  title: string
  post_date: string
  format: Format
  pillar: Pillar
  caption: string
  script: string
  reels: ReelsScript
  origin: string
  campaign_id: string | null
}

type Campaign = { id: string; name: string; starts_on: string; ends_on: string }

function reelsFor(hook: string, scenes: [string, string, string, string], cta: string): ReelsScript {
  return {
    hook,
    cta,
    scenes: scenes.map((scene, i) => ({ time: REELS_TEMPLATE_TIMES[i], scene, speech: '', onscreen: '' })),
  }
}

// Modelos editoriais. Tudo entre [colchetes] precisa ser preenchido e revisado:
// o gerador nunca inventa preço, desconto, serviço ou contato.
function institutionalTemplates(brand: string): Omit<Draft, 'post_date' | 'campaign_id'>[] {
  return [
    {
      title: `Quem cuida de você na ${brand}`,
      format: 'carrossel',
      pillar: 'institucional',
      caption: `Por trás do balcão da ${brand} tem gente que conhece você pelo nome.\n\nConheça [nome e função de quem aparece] e o que essa pessoa faz no dia a dia da loja.\n\n[Chamada: como falar com a loja]`,
      script: 'Slide 1: título com a pergunta "Quem atende você?". Slides 2–4: uma pessoa da equipe por slide, foto real (com autorização de imagem), nome e função. Último slide: como falar com a loja.',
      reels: emptyReels(),
      origin: 'Modelo institucional — apresentação da equipe. Preencher os nomes e confirmar autorização de imagem.',
    },
    {
      title: 'Bastidores do atendimento',
      format: 'reels',
      pillar: 'bastidores',
      caption: `Um dia na ${brand}, do ponto de vista de quem atende.\n\n[Uma frase sobre o que o vídeo mostra]`,
      script: 'Gravar na loja, com a equipe real e luz natural. Sem trilha comercial genérica.',
      reels: reelsFor(
        '[Pergunta ou situação que o cliente reconhece]',
        ['Cenas reais da abertura ou do balcão', 'Uma cena do atendimento acontecendo', '[Informação principal do vídeo — serviço confirmado]', 'Pessoa da equipe convidando para a loja'],
        '[Próximo passo: ir à loja ou chamar no WhatsApp]',
      ),
      origin: 'Modelo institucional — bastidores. Confirmar autorização de imagem de quem aparece.',
    },
    {
      title: 'Dúvida frequente respondida',
      format: 'carrossel',
      pillar: 'educacao',
      caption: `Uma dúvida que chega toda semana no balcão da ${brand}: [pergunta].\n\n[Resposta curta, revisada pelo farmacêutico responsável]\n\nEm caso de dúvida, procure um farmacêutico.`,
      script: 'Slide 1: a pergunta. Slides 2–4: resposta em passos curtos. Último slide: "Fale com um farmacêutico". Não citar medicamento com prescrição.',
      reels: emptyReels(),
      origin: 'Modelo educativo — dúvida frequente. Texto precisa de revisão farmacêutica antes de aprovar.',
    },
    {
      title: 'Como falar com a gente',
      format: 'reels',
      pillar: 'servicos',
      caption: `Facilitamos o seu contato com a ${brand}.\n\n[Canais e horários confirmados — não copiar de outra loja]`,
      script: 'Mostrar na prática o caminho: abrir o WhatsApp, enviar mensagem, receber a resposta.',
      reels: reelsFor(
        '[Pergunta: "Precisa de algo e não sabe como pedir?"]',
        ['Tela do celular abrindo a conversa', 'Cliente enviando a mensagem', '[Canais confirmados: WhatsApp, telefone, endereço]', 'Equipe respondendo'],
        '[Salvar o contato / chamar agora]',
      ),
      origin: 'Modelo de serviços — canais de contato. Preencher só com dados confirmados da unidade.',
    },
  ]
}

function campaignTemplates(brand: string, name: string): Omit<Draft, 'post_date' | 'campaign_id'>[] {
  return [
    {
      title: `${name}: o que está valendo`,
      format: 'carrossel',
      pillar: 'campanha',
      caption: `${name} na ${brand}.\n\n[Produtos e condições confirmados no briefing]\n\nVálido [período e unidades participantes].`,
      script: 'Slide 1: nome da campanha. Slides 2–4: um item ou condição por slide, com preço só se estiver confirmado. Último slide: validade e unidades.',
      reels: emptyReels(),
      origin: `Modelo de campanha — ${name}. Conferir produtos, preços e validade no briefing antes de aprovar.`,
    },
    {
      title: `${name} em 30 segundos`,
      format: 'reels',
      pillar: 'campanha',
      caption: `${name}: veja como aproveitar na ${brand}.\n\n[Condição principal confirmada]`,
      script: 'Mostrar os produtos reais na loja. Evitar promessas além do briefing.',
      reels: reelsFor(
        `[Gancho com a vantagem principal de ${name}]`,
        ['Cena real da loja com a campanha', 'Produtos em destaque', '[Condição, validade e unidades participantes]', 'Equipe convidando'],
        '[Chamada: vir à loja / chamar no WhatsApp]',
      ),
      origin: `Modelo de campanha — ${name}. Preencher só com condições confirmadas.`,
    },
    {
      title: `Como aproveitar ${name}`,
      format: 'carrossel',
      pillar: 'relacionamento',
      caption: `Passo a passo para aproveitar ${name} na ${brand}.\n\n[Regras de participação confirmadas]`,
      script: 'Slides em passos numerados: 1) como participar, 2) o que vale, 3) até quando. Sem regra inventada.',
      reels: emptyReels(),
      origin: `Modelo de relacionamento — ${name}. Regras de participação precisam estar no briefing.`,
    },
    {
      title: `Última chamada: ${name}`,
      format: 'reels',
      pillar: 'campanha',
      caption: `Últimos dias de ${name} na ${brand}.\n\n[Data final confirmada]`,
      script: 'Só publicar se a campanha ainda estiver vigente na data do post.',
      reels: reelsFor(
        '[Aviso de que está acabando — com a data real]',
        ['Cena da loja', '[Item mais procurado da campanha]', '[Validade e unidades]', 'Equipe convidando'],
        '[Chamada para aproveitar antes de acabar]',
      ),
      origin: `Modelo de campanha — ${name}. Conferir se a data do post está dentro da validade.`,
    },
  ]
}

const OFFSETS = [0, 2, 4, 6]

export type GenerateResult = { drafts: Draft[]; skipped: string[]; error?: string }

// Quatro rascunhos em sete dias (dias +0, +2, +4, +6): dois carrosséis e dois Reels.
export function generateWeek(opts: {
  brandName: string
  startDate: string
  campaign: Campaign | null
  existing: { post_date: string; title: string }[]
}): GenerateResult {
  const { brandName, startDate, campaign, existing } = opts
  const endDate = addDays(startDate, 6)
  if (campaign && !campaignCoversPeriod(campaign, startDate, endDate)) {
    return {
      drafts: [],
      skipped: [],
      error: `A campanha "${campaign.name}" vale de ${formatBR(campaign.starts_on)} a ${formatBR(campaign.ends_on)}; a semana (${formatBR(startDate)} a ${formatBR(endDate)}) precisa estar toda dentro da validade.`,
    }
  }
  const templates = campaign ? campaignTemplates(brandName, campaign.name) : institutionalTemplates(brandName)
  const taken = new Set(existing.map((e) => `${e.post_date}|${e.title.trim().toLowerCase()}`))
  const drafts: Draft[] = []
  const skipped: string[] = []
  templates.forEach((t, i) => {
    const post_date = addDays(startDate, OFFSETS[i])
    const key = `${post_date}|${t.title.trim().toLowerCase()}`
    if (taken.has(key)) {
      skipped.push(`${formatBR(post_date)} — ${t.title}`)
      return
    }
    taken.add(key)
    drafts.push({ ...t, post_date, campaign_id: campaign?.id ?? null })
  })
  return { drafts, skipped }
}
