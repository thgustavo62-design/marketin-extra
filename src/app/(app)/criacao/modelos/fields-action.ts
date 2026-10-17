'use server'

import { requireUser } from '@/lib/auth'
import { isUuid } from '@/lib/form'
import { getTemplateFields } from '@/lib/promo/store'

/** Os textos editáveis de um modelo (para o formulário "Usar este modelo"). */
export async function templateFieldsAction(id: string) {
  await requireUser()
  if (!isUuid(id)) return null
  return getTemplateFields(id)
}
