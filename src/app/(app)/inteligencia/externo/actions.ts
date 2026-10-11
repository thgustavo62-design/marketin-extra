'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError, audit, writerOrError } from '@/lib/auth'
import { pool } from '@/lib/db'
import { isIcmsRate, isIsoDate, optionalHttps, parseTags, todayISO } from '@/lib/domain'
import { isUuid, str, type FormState } from '@/lib/form'
import { isSourceKey, runSource } from '@/lib/external/run'
import { clientIp } from '@/lib/session'

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

// Atualiza uma fonte aberta (feriados, IPCA, lista CMED). Manual, com limite de uso; a falha nunca apaga o que já estava guardado.
export async function refreshSourceAction(key: string): Promise<Result<{ message: string }>> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isSourceKey(key)) return { ok: false, error: 'Fonte desconhecida.' }
  const r = await runSource(key, g.user.id)
  if (!r.ok) return { ok: false, error: r.error }
  await audit('fonte_externa_atualizada', { userId: g.user.id, ip: await clientIp(), target: key, meta: { registros: r.records, pulada: r.skipped } })
  revalidatePath('/inteligencia')
  return { ok: true, message: r.message }
}

// Alíquota de ICMS da filial: define qual coluna de PMC vale como teto de preço. Só administrador.
export async function saveIcmsAction(brandId: string, icms: number | null): Promise<Result> {
  const g = await adminOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(brandId)) return { ok: false, error: 'Filial inválida.' }
  if (icms !== null && !isIcmsRate(icms)) return { ok: false, error: 'Alíquota de ICMS inválida para a lista da CMED.' }
  const r = await pool.query(`update brands set icms_pct = $2 where id = $1 returning id`, [brandId, icms])
  if (!r.rowCount) return { ok: false, error: 'Filial não encontrada.' }
  await audit('icms_filial', { userId: g.user.id, ip: await clientIp(), target: brandId, meta: { icms } })
  revalidatePath('/inteligencia')
  return { ok: true }
}

// ---------- notas de pesquisa ----------
export async function saveNoteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const g = await writerOrError()
  if (!g.ok) return { error: g.error }
  const kind = str(fd, 'kind'), title = str(fd, 'title'), summary = str(fd, 'summary'), sourceName = str(fd, 'source_name'), accessed = str(fd, 'accessed_on') || todayISO(), conf = str(fd, 'confidence')
  if (!['regra', 'sazonalidade', 'mercado', 'preco'].includes(kind)) return { error: 'Escolha o tipo.' }
  if (title.length < 5 || title.length > 160) return { error: 'O título precisa ter de 5 a 160 caracteres.' }
  if (summary.length < 10 || summary.length > 2000) return { error: 'O resumo precisa ter de 10 a 2000 caracteres.' }
  if (sourceName.length < 2 || sourceName.length > 160) return { error: 'Informe o nome da fonte.' }
  if (!['alta', 'media', 'baixa'].includes(conf)) return { error: 'Escolha o nível de confiança.' }
  if (!isIsoDate(accessed)) return { error: 'Data de acesso inválida.' }
  const url = optionalHttps(str(fd, 'source_url'))
  if (!url.ok) return { error: url.error }
  if (!url.url) return { error: 'Toda nota precisa do endereço (https://) da fonte.' }
  try {
    await pool.query(`insert into research_notes (kind, title, summary, source_name, source_url, accessed_on, confidence, tags, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [kind, title, summary, sourceName, url.url, accessed, conf, parseTags(str(fd, 'tags')), g.user.id])
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { error: 'Já existe uma nota com esse título.' }
    throw e
  }
  await audit('nota_pesquisa_criada', { userId: g.user.id, ip: await clientIp(), target: title })
  revalidatePath('/inteligencia')
  return { ok: 'Nota registrada.' }
}

export async function archiveNoteAction(id: string, archive: boolean): Promise<Result> {
  const g = await writerOrError()
  if (!g.ok) return { ok: false, error: g.error }
  if (!isUuid(id)) return { ok: false, error: 'Nota inválida.' }
  await pool.query(`update research_notes set status = $2 where id = $1`, [id, archive ? 'arquivada' : 'ativa'])
  revalidatePath('/inteligencia')
  return { ok: true }
}
