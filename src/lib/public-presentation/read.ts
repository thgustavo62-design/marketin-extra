import 'server-only';
import { createHash } from 'node:crypto';
import { withTx } from '@/lib/db';
import { normalizeWhatsapp, validPresentationToken, type PublicPresentation } from '@/lib/domain/public-presentation';

export function presentationTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export async function resolvePublicPresentation(token: string): Promise<PublicPresentation | null> {
  if (!validPresentationToken(token)) return null;
  // No session/cookie/context is read, even when an administrator opens this URL.
  const row = await withTx(async (db) => (await db.query(
    'select whatsapp_phone,cta_message from nova7_private.resolve_public_presentation($1)',
    [presentationTokenHash(token)],
  )).rows[0], true);
  if (!row || !normalizeWhatsapp(row.whatsapp_phone) || typeof row.cta_message !== 'string' || row.cta_message.length > 300) return null;
  return { whatsappPhone: row.whatsapp_phone, ctaMessage: row.cta_message };
}
