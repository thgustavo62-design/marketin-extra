import type { NextConfig } from 'next'

// Endereços antigos (antes da reorganização em subpastas) continuam funcionando.
const MOVED: [string, string][] = [
  ['/calendario', '/planejamento/calendario'],
  ['/conteudos', '/planejamento/conteudos'],
  ['/conteudos/:path*', '/planejamento/conteudos/:path*'],
  ['/reels', '/planejamento/reels'],
  ['/gerar', '/planejamento/gerar'],
  ['/base', '/gestao/base'],
  ['/unidades', '/gestao/filiais'],
  ['/conta', '/configuracoes/conta'],
  ['/fontes', '/configuracoes/integracoes'],
]

const config: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return MOVED.map(([source, destination]) => ({ source, destination, permanent: true }))
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ]
  },
}

export default config
