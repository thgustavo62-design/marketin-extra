import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PresentationLanding } from '@/components/public-presentation/landing';
import { resolvePublicPresentation } from '@/lib/public-presentation/read';
import { presentationOrigin } from '@/lib/public-presentation/origin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const lookup = cache(resolvePublicPresentation);
type Props = { params: Promise<{ token: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!(await lookup(token))) return { title: 'Página não encontrada' };
  const title = 'Encartiva — primeiro, sua marca. Depois, a automação.';
  const description = 'Personalizamos a comunicação das suas ofertas e organizamos a criação de campanhas para farmácias, supermercados e varejo.';
  return {
    title, description, manifest: null, robots: { index: false, follow: false },
    alternates: { canonical: presentationOrigin() + '/apresentacao/' + token },
    openGraph: { title, description, type: 'website', locale: 'pt_BR', siteName: 'Encartiva', images: [{ url: presentationOrigin() + '/brand/encartiva/principal.png', alt: 'Encartiva' }] },
    twitter: { card: 'summary_large_image', title, description, images: [presentationOrigin() + '/brand/encartiva/principal.png'] },
  };
}
export default async function Presentation({ params }: Props) {
  const contact = await lookup((await params).token);
  if (!contact) notFound();
  return <PresentationLanding contact={contact} />;
}
