/* eslint-disable @next/next/no-img-element */
const SRC = {
  white: '/brand/extra-branco.png', // fundos escuros
  blue: '/brand/extra-azul.png', // fundos claros
  dark: '/brand/extra-grafite.png', // fundos claros, uma cor só
} as const
const WIDTH = { sm: 120, md: 190, lg: 300 } as const

export function Wordmark({ tone = 'blue', size = 'md' }: { tone?: keyof typeof SRC; size?: keyof typeof WIDTH }) {
  return (
    <img
      src={SRC[tone]}
      alt="Extra Marketing"
      width={WIDTH[size]}
      height={Math.round(WIDTH[size] * (247 / 760))}
      className="wordmark-img"
    />
  )
}
