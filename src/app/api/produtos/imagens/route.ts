import { NextResponse } from 'next/server'
import { ingestImage, invalidateCatalogIndex, type IngestResult } from '@/lib/catalog/store'
import { MAX_IMAGE_INPUT_BYTES } from '@/lib/catalog/images'
import { audit, sameOrigin } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { canWrite } from '@/lib/perms'
import { getSession } from '@/lib/session'

export const maxDuration = 60

// Envio de imagens de produto (várias por vez, até 4 MB no total por envio). O nome do arquivo (ou o EAN) liga a imagem ao produto;
// o que não for reconhecido vai para a fila de conferência. Com product_id, a imagem entra direto nesse produto.
export async function POST(req: Request) {
  const user = await getSession()
  if (!user || user.mustChange) return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 })
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 })
  if (!canWrite(user.role)) return NextResponse.json({ error: 'Seu perfil é somente leitura.' }, { status: 403 })
  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Envio inválido ou grande demais (máximo 4 MB por envio).' }, { status: 413 }) }
  const productId = String(fd.get('product_id') ?? '')
  if (productId && !isUuid(productId)) return NextResponse.json({ error: 'Produto inválido.' }, { status: 400 })
  const files = fd.getAll('file').filter((f): f is File => f instanceof File).slice(0, 40)
  if (!files.length) return NextResponse.json({ error: 'Escolha ao menos uma imagem.' }, { status: 400 })

  const results: IngestResult[] = []
  for (const f of files) {
    if (f.size > MAX_IMAGE_INPUT_BYTES) { results.push({ file: f.name, status: 'invalida', error: 'A imagem passa de 8 MB.' }); continue }
    results.push(await ingestImage({ buf: Buffer.from(await f.arrayBuffer()), fileName: f.name, userId: user.id, source: 'upload', productId: productId || null }))
  }
  invalidateCatalogIndex()
  const count = (s: IngestResult['status']) => results.filter((r) => r.status === s).length
  await audit('produto_imagens_enviadas', { userId: user.id, meta: { arquivos: files.length, ligadas: count('ligada'), pendentes: count('pendente') } })
  return NextResponse.json({ ok: true, results })
}
