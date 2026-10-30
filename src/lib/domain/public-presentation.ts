export const PRESENTATION_MESSAGE = 'Olá! Quero saber mais sobre a Encartiva e solicitar uma apresentação.';
export const PUBLIC_PLANS = [
  { name: 'Essencial', price: '49,99', companies: '1 empresa', detail: 'Uma marca. Uma identidade própria.' },
  { name: 'Expansão', price: '89,99', companies: '2 a 3 empresas', detail: 'Mais marcas, sem perder a identidade.' },
  { name: 'Rede', price: '129,99', companies: '4 a 6 empresas', detail: 'Suas empresas, bem organizadas.' },
] as const;
export type PublicPresentation = { whatsappPhone: string; ctaMessage: string };
export function validPresentationToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function normalizeWhatsapp(value: string): string | null {
  if (/[^\d\s()+.-]/.test(value)) return null;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11) digits = '55' + digits;
  return /^55[1-9]\d9\d{8}$/.test(digits) ? digits : null;
}
export function whatsappLink(phone: string, message: string): string {
  const normalized = normalizeWhatsapp(phone);
  if (!normalized || !message.trim() || message.length > 500) throw Error('Contato inválido.');
  return 'https://wa.me/' + normalized + '?text=' + encodeURIComponent(message.trim());
}
