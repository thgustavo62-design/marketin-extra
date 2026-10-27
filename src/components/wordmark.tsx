/* eslint-disable @next/next/no-img-element */
const SRC = {
  white: '/brand/encartiva/branca.png', // fundos escuros
  blue: '/brand/encartiva/grafite.png', // fundos claros
  dark: '/brand/encartiva/grafite.png', // fundos claros, uma cor só
} as const
const WIDTH = { sm: 120, md: 190, lg: 300 } as const

export function Wordmark({ tone = 'blue', size = 'md' }: { tone?: keyof typeof SRC; size?: keyof typeof WIDTH }) {
  return (
    <img
      src={SRC[tone]}
      alt="Encartiva"
      width={WIDTH[size]}
      height={Math.round(WIDTH[size] * (673 / 2048))}
      className="wordmark-img"
    />
  )
}
