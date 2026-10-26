/* eslint-disable @next/next/no-img-element */
const SRC = {
  white: '/brand/nova7-principal.png', // fundos escuros
  blue: '/brand/nova7-escura.png', // fundos claros
  dark: '/brand/nova7-escura.png', // fundos claros, uma cor só
} as const
const WIDTH = { sm: 120, md: 190, lg: 300 } as const

export function Wordmark({ tone = 'blue', size = 'md' }: { tone?: keyof typeof SRC; size?: keyof typeof WIDTH }) {
  return (
    <img
      src={SRC[tone]}
      alt="Nova7"
      width={WIDTH[size]}
      height={Math.round(WIDTH[size] * (532 / 1496))}
      className="wordmark-img"
    />
  )
}
