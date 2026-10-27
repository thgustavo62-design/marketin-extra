import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import './design.css'

const font = localFont({ src: '../../public/fonts/Montserrat.ttf', weight: '100 900', display: 'swap' })

export const metadata: Metadata = {
  title: 'Nova7',
  description: 'Estratégia, criação e resultados. Seu marketing em um só lugar.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={font.className}>{children}</body>
    </html>
  )
}
