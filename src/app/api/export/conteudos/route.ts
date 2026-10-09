import { NextResponse } from 'next/server'
import { listPosts } from '@/lib/data'
import { FORMATS, PILLARS, STAGES, formatBR, isIsoDate, toCsv } from '@/lib/domain'
import { getScope } from '@/lib/scope'
import { getSession } from '@/lib/session'

// CSV com os mesmos filtros da tela (rede, etapa, formato, busca, período).
export async function GET(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const u = new URL(req.url).searchParams
  const scope = await getScope()
  const from = u.get('from') ?? ''
  const to = u.get('to') ?? ''
  const etapa = u.get('etapa') ?? ''
  const formato = u.get('formato') ?? ''
  const posts = await listPosts({
    brand: scope.restricted ? scope.brand?.slug : u.get('rede') || undefined,
    branchId: /^[0-9a-f-]{36}$/i.test(u.get('filial') ?? '') ? u.get('filial')! : undefined,
    q: u.get('q')?.trim() || undefined,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
    stage: etapa in STAGES ? etapa : undefined,
    format: formato in FORMATS ? formato : undefined,
  })
  const csv = toCsv(
    ['Data', 'Horário', 'Filial', 'Unidade', 'Título', 'Formato', 'Pilar', 'Etapa', 'Campanha', 'Origem', 'Revisão farmacêutica', 'Legenda', 'Roteiro', 'Alcance', 'Salvamentos', 'Compartilhamentos'],
    posts.map((p) => [
      formatBR(p.post_date), p.post_time ?? '', p.brand_name, p.branch_name ?? 'Todas as unidades', p.title,
      FORMATS[p.format], PILLARS[p.pillar], STAGES[p.stage], p.campaign_name ?? '', p.origin,
      p.pharma_review ? 'Sim' : 'Não', p.caption, p.script, p.reach ?? '', p.saves ?? '', p.shares ?? '',
    ]),
  )
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cronograma-extra-marketing.csv"',
    },
  })
}
