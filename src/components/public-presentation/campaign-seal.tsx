import { useId } from 'react';
export type SealKind = 'week' | 'sale' | 'black' | 'beauty' | 'fresh' | 'baby';
const designs = {
  week: { top: 'OFERTAS', bottom: 'DA SEMANA', note: 'ESCOLHA. COMPARE. APROVEITE.', primary: '#e53c32', accent: '#ffe17a', ink: '#fff7e5' },
  sale: { top: 'MEGA', bottom: 'SALDÃO', note: 'A SUA SELEÇÃO EM DESTAQUE', primary: '#233ab4', accent: '#ffe46c', ink: '#fff9ec' },
  black: { top: 'BLACK', bottom: 'FRIDAY', note: 'UMA CAMPANHA. MUITA PRESENÇA.', primary: '#18191d', accent: '#c5ee64', ink: '#f8f5ea' },
  beauty: { top: 'BELEZA', bottom: 'EM OFERTA', note: 'SEU MOMENTO DE CUIDADO', primary: '#733b55', accent: '#edd6c3', ink: '#fff4e8' },
  fresh: { top: 'HORA DO', bottom: 'HORTI', note: 'FRESCOR NA SUA SELEÇÃO', primary: '#215c40', accent: '#ffc766', ink: '#f2f3d8' },
  baby: { top: 'MUNDO', bottom: 'BEBÊ', note: 'CARINHO EM CADA DETALHE', primary: '#6356a4', accent: '#f5cdaa', ink: '#fff4ea' },
};
/** Original generic campaign lettering. No customer identity or borrowed artwork. */
export function CampaignSeal({ kind = 'week', muted = false }: { kind?: SealKind; muted?: boolean }) {
  const c = designs[kind];
  const grainId = useId();
  return <svg className={'p-campaign-seal p-seal-' + kind} viewBox="0 0 600 330" role="img" aria-label={c.top + ' ' + c.bottom} style={muted ? { filter: 'grayscale(1)' } : undefined}>
    <defs><pattern id={grainId} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="white" opacity=".14" /></pattern></defs>
    {kind === 'fresh' || kind === 'baby' || kind === 'beauty' ? <><ellipse cx="300" cy="150" rx="241" ry="125" fill={c.accent} /><ellipse cx="300" cy="145" rx="229" ry="113" fill={c.primary} stroke={c.ink} strokeWidth="2" /></> : <><path d="M45 62 532 34 557 241 64 272Z" fill="#111214" /><path d="M34 49 521 21 545 228 53 258Z" fill={c.primary} stroke={c.ink} strokeWidth="3" /><path d="m34 49 487-28 24 207-492 30Z" fill={'url(#' + grainId + ')'} /></>}
    {kind === 'black' && <><path d="m53 27 10 38 40-4-36 16 10 38-23-31-36 16 22-29-22-29 34 15Z" fill={c.accent} /><path d="m513 216 8 31 32-3-29 13 8 30-18-24-29 13 17-24-17-23 27 12Z" fill={c.accent} /></>}
    {kind === 'fresh' && <path d="M457 55q47-46 73-25-13 49-73 25Z" fill={c.accent} />}
    <g transform="translate(300 0) skewX(-6)" textAnchor="middle" fontFamily="EncartivaDisplay, Impact, sans-serif" fontWeight="400">
      <text x="0" y="137" fontSize={kind === 'beauty' ? 85 : 98} fill={c.ink} letterSpacing="-2">{c.top}</text>
      <path d="M-238 153 226 139 233 227-231 241Z" fill={c.accent} />
      <text x="0" y="217" fontSize={kind === 'week' || kind === 'beauty' ? 74 : 92} fill={c.primary} letterSpacing="-2">{c.bottom}</text>
    </g>
    <text x="300" y="299" textAnchor="middle" fontFamily="var(--font-interface),sans-serif" fontSize="12" fontWeight="700" letterSpacing="2" fill="currentColor">{c.note}</text>
  </svg>;
}
