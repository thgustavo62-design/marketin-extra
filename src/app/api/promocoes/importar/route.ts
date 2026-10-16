import { NextResponse } from 'next/server'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { createCampaignFromRows } from '@/lib/promo/store'
import { parsePromoXlsx } from '@/lib/promo/xlsx'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Planilha de promoção (.xlsx, até 4 MB) → campanha com os produtos do catálogo, o nome do ERP e o preço da planilha.
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB).' }, { status: 413 }) }
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a planilha (.xlsx).' }, { status: 400 })
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'A planilha passa de 4 MB.' }, { status: 413 })
  const themeId = String(fd.get('theme_id') ?? '')
  const parsed = await parsePromoXlsx(Buffer.from(await file.arrayBuffer()))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 })
  const name = String(fd.get('name') ?? '').trim() || file.name.replace(/\.[^.]+$/, '')
  const r = await createCampaignFromRows({
    name, themeId: isUuid(themeId) ? themeId : null, title: String(fd.get('title') ?? '').trim().slice(0, 60) || null, validity: String(fd.get('validity') ?? '').trim().slice(0, 80) || null,
    rows: parsed.rows, userId: user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 })
  await audit('promocao_criada', { userId: user.id, target: r.id, meta: { itens: r.report.created, fora_do_catalogo: r.report.notInCatalog.length, sem_foto: r.report.withoutPhoto.length } })
  return NextResponse.json({ ok: true, id: r.id, report: r.report, errors: parsed.errors, sheets: parsed.sheets })
}
