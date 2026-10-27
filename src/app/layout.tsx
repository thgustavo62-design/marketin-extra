import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import './design.css'
import './encartiva.css'

const font = localFont({ src: '../../public/fonts/encartiva/Inter.ttf', weight: '100 900', display: 'swap', variable: '--font-interface' })
const heading = localFont({ src: '../../public/fonts/encartiva/Sora.ttf', weight: '100 800', display: 'swap', variable: '--font-heading' })

export const metadata: Metadata = {
  title: 'Encartiva',
  applicationName: 'Encartiva',
  description: 'Um ecossistema para promoções inteligentes. Criação, campanhas e resultados em um só lugar.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand/encartiva/app.png', apple: '/brand/encartiva/app.png' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${font.className} ${font.variable} ${heading.variable}`}>{children}</body>
    </html>
  )
}
