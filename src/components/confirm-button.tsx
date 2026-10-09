'use client'

export function ConfirmButton({ children, message, className = 'danger' }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault() }}>
      {children}
    </button>
  )
}
