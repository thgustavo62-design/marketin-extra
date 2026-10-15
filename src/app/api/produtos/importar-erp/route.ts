import { NextResponse } from 'next/server'
import { parseErpXlsx, upsertProducts } from '@/lib/catalog/erp'
import { audit, sameOrigin } from '@/lib/auth'
import { canWrite } from '@/lib/perms'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Cadastro de produtos a partir da planilha do ERP (.xlsx, até 4 MB). Reenviar atualiza sem duplicar.
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB).' }, { status: 413 }) }
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Escolha a planilha do ERP (.xlsx).' }, { status: 400 })
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'A planilha passa de 4 MB. Envie só as colunas Código, Descrição, Barras e Grupo.' }, { status: 413 })
  const parsed = await parseErpXlsx(Buffer.from(await file.arrayBuffer()))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 })
  const result = await upsertProducts(parsed.rows, user.id)
  await audit('produtos_importados_erp', { userId: user.id, meta: { ...result, ignoradas: parsed.skipped } })
  return NextResponse.json({ ok: true, ...result, skipped: parsed.skipped })
}
