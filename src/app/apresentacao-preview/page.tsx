import { requireAdmin } from '@/lib/auth';
import { PresentationLanding } from '@/components/public-presentation/landing';
import { DEFAULT_PRESENTATION_PHONE, DEFAULT_PRESENTATION_MESSAGE, getPresentationSettings } from '@/lib/public-presentation/admin';
export const dynamic = 'force-dynamic';
export default async function PreviewPresentation() {
  await requireAdmin();
  const settings = await getPresentationSettings();
  return <PresentationLanding preview contact={{
    whatsappPhone: settings?.whatsapp_phone ?? DEFAULT_PRESENTATION_PHONE,
    ctaMessage: settings?.cta_message ?? DEFAULT_PRESENTATION_MESSAGE,
  }} />;
}
