import type { NextConfig } from 'next'

// Endereços antigos (antes da reorganização em subpastas) continuam funcionando.
const MOVED: [string, string][] = [
  ['/calendario', '/planejamento/calendario'],
  ['/conteudos', '/planejamento/conteudos'],
  ['/conteudos/:path*', '/planejamento/conteudos/:path*'],
  ['/reels', '/planejamento/reels'],
  ['/gerar', '/planejamento/gerar'],
  ['/base', '/gestao/base'],
  ['/unidades', '/gestao/unidades'],
  ['/gestao/filiais', '/gestao/unidades'],
  ['/conta', '/configuracoes/conta'],
  ['/fontes', '/configuracoes/integracoes'],
]

// Sem 'unsafe-eval'. 'unsafe-inline' em script é exigido pelo Next para hidratar sem nonce.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const security = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
]

const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return MOVED.map(([source, destination]) => ({ source, destination, permanent: true }))
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      // Páginas e API são privadas (nunca em cache). Arquivos estáticos ficam de fora para serem cacheados.
      { source: '/((?!_next/static|_next/image|brand/|icon\\.png).*)', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
    ]
  },
}

export default config
