export function Wordmark({ tone = 'blue', size = 'md' }: { tone?: 'blue' | 'white' | 'dark'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`wordmark wordmark-${tone} wordmark-${size}`} aria-label="Extra Marketing">
      <span className="wordmark-main">extra</span>
      <span className="wordmark-sub">MARKETING</span>
    </span>
  )
}
