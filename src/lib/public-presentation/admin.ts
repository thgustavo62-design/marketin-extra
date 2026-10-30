import 'server-only';
import { randomBytes } from 'node:crypto';
import { pool, withTx } from '@/lib/db';
import { normalizeWhatsapp, PRESENTATION_MESSAGE } from '@/lib/domain/public-presentation';
import { presentationTokenHash } from './read';

export const DEFAULT_PRESENTATION_PHONE = '5527997010954';
export const DEFAULT_PRESENTATION_MESSAGE = PRESENTATION_MESSAGE;
export type PresentationSettings = {
  public_token: string; published: boolean; whatsapp_phone: string;
  cta_message: string; version: number; updated_at: Date;
};
export async function getPresentationSettings(): Promise<PresentationSettings | null> {
  return (await pool.query('select public_token,published,whatsapp_phone,cta_message,version,updated_at from nova7_private.public_presentation where singleton')).rows[0] ?? null;
}
export async function changePresentation(
  actorId: string,
  input: { operation: string; version: number; phone: string; message: string; confirmed: boolean },
) {
  if (!['generate', 'save', 'publish', 'unpublish', 'regenerate'].includes(input.operation)
    || !Number.isSafeInteger(input.version) || input.version < 0) throw Error('Operação inválida.');
  const phone = normalizeWhatsapp(input.phone), message = input.message.trim();
  if (['generate', 'save'].includes(input.operation) && (!phone || !message || message.length > 300))
    throw Error('Informe um WhatsApp completo com DDD e uma mensagem de até 300 caracteres.');
  if (input.operation === 'regenerate' && !input.confirmed) throw Error('Confirme a invalidação do link anterior.');
  await withTx(async (db) => {
    // An explicit authorization check complements table RLS and the Server Action.
    if (!(await db.query('select nova7_private.platform_admin() as allowed')).rows[0].allowed)
      throw Error('Somente a administração global pode alterar a apresentação.');
    const current = (await db.query('select * from nova7_private.public_presentation where singleton for update')).rows[0];
    if ((current?.version ?? 0) !== input.version) throw Error('A configuração mudou. Atualize a página antes de salvar.');
    if (input.operation === 'generate') {
      if (current) throw Error('Já existe um link. Use a opção Regenerar para substituí-lo.');
      const token = randomBytes(32).toString('base64url');
      await db.query('insert into nova7_private.public_presentation(public_token,token_hash,whatsapp_phone,cta_message)values($1,$2,$3,$4)',
        [token, presentationTokenHash(token), phone, message]);
    } else {
      if (!current) throw Error('Gere o link antes de continuar.');
      if (input.operation === 'save') await db.query(
        'update nova7_private.public_presentation set whatsapp_phone=$1,cta_message=$2,version=version+1,updated_at=now() where singleton', [phone, message]);
      else if (input.operation === 'regenerate') {
        const token = randomBytes(32).toString('base64url');
        await db.query('update nova7_private.public_presentation set public_token=$1,token_hash=$2,published=false,version=version+1,updated_at=now() where singleton',
          [token, presentationTokenHash(token)]);
      } else await db.query('update nova7_private.public_presentation set published=$1,version=version+1,updated_at=now() where singleton',
        [input.operation === 'publish']);
    }
    await db.query('insert into audit_events(user_id,action,target,meta)values($1,$2,$3,$4::jsonb)',
      [actorId, 'apresentacao_' + input.operation, 'site-institucional', JSON.stringify({ operation: input.operation })]);
  });
}
