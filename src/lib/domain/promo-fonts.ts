// Fontes do editor de promoções. Todas livres (SIL OFL), guardadas em /public/fonts (nada é buscado de serviço externo).
export type FontCategory = 'titulo' | 'texto' | 'serifa' | 'manuscrita' | 'sistema'
export type FontFace = { url: string; weight: string }
export type FontDef = { id: string; label: string; category: FontCategory; /** nome da família no navegador (FontFace); sem isso a fonte é do sistema */ family: string | null; faces: FontFace[]; fallback: string }

export const PROMO_FONTS: FontDef[] = [
  { id: 'display', label: 'Baloo 2', category: 'titulo', family: 'PromoDisplay', faces: [{ url: '/fonts/Baloo2.ttf', weight: '400 800' }], fallback: '"Baloo 2", system-ui, sans-serif' },
  { id: 'text', label: 'Montserrat', category: 'texto', family: 'PromoText', faces: [{ url: '/fonts/Montserrat.ttf', weight: '100 900' }], fallback: 'Montserrat, system-ui, sans-serif' },
  { id: 'bebas', label: 'Bebas Neue', category: 'titulo', family: 'PromoBebas', faces: [{ url: '/fonts/studio/bebas-neue.woff2', weight: '400' }], fallback: 'Impact, "Arial Narrow", sans-serif' },
  { id: 'anton', label: 'Anton', category: 'titulo', family: 'PromoAnton', faces: [{ url: '/fonts/studio/anton.woff2', weight: '400' }], fallback: 'Impact, "Arial Narrow", sans-serif' },
  { id: 'oswald', label: 'Oswald', category: 'titulo', family: 'PromoOswald', faces: [{ url: '/fonts/studio/oswald.woff2', weight: '200 700' }], fallback: '"Arial Narrow", system-ui, sans-serif' },
  { id: 'robotocond', label: 'Roboto Condensed', category: 'texto', family: 'PromoRobotoCond', faces: [{ url: '/fonts/studio/roboto-condensed.woff2', weight: '100 900' }], fallback: '"Arial Narrow", system-ui, sans-serif' },
  { id: 'poppins', label: 'Poppins', category: 'texto', family: 'PromoPoppins', faces: [{ url: '/fonts/studio/poppins-400.woff2', weight: '400' }, { url: '/fonts/studio/poppins-700.woff2', weight: '700' }, { url: '/fonts/studio/poppins-800.woff2', weight: '800' }], fallback: 'system-ui, sans-serif' },
  { id: 'dmsans', label: 'DM Sans', category: 'texto', family: 'PromoDmSans', faces: [{ url: '/fonts/studio/dm-sans.woff2', weight: '100 1000' }], fallback: 'system-ui, sans-serif' },
  { id: 'playfair', label: 'Playfair Display', category: 'serifa', family: 'PromoPlayfair', faces: [{ url: '/fonts/studio/playfair.woff2', weight: '400 900' }], fallback: 'Georgia, "Times New Roman", serif' },
  { id: 'serif', label: 'Serifada (sistema)', category: 'serifa', family: null, faces: [], fallback: 'Georgia, "Times New Roman", serif' },
  { id: 'pacifico', label: 'Pacifico', category: 'manuscrita', family: 'PromoPacifico', faces: [{ url: '/fonts/studio/pacifico.woff2', weight: '400' }], fallback: '"Brush Script MT", cursive' },
  { id: 'mono', label: 'Máquina de escrever (sistema)', category: 'sistema', family: null, faces: [], fallback: '"Courier New", ui-monospace, monospace' },
]

export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = { titulo: 'Títulos', texto: 'Textos', serifa: 'Serifadas', manuscrita: 'Manuscritas', sistema: 'Sistema' }
export const isPromoFont = (id: unknown): id is string => typeof id === 'string' && PROMO_FONTS.some((f) => f.id === id)
export const fontDef = (id: string | undefined): FontDef => PROMO_FONTS.find((f) => f.id === id) ?? PROMO_FONTS[1]

/** Lista de famílias para o CSS/canvas: a fonte carregada primeiro e as de reserva depois. */
export const fontStack = (id: string | undefined): string => {
  const f = fontDef(id)
  return f.family ? `"${f.family}", ${f.fallback}` : f.fallback
}
