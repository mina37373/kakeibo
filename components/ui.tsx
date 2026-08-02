'use client'

import { useRouter } from 'next/navigation'

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {children}
    </div>
  )
}

export function Header({ title, backPath, right }: { title: string; backPath?: string; right?: React.ReactNode }) {
  const router = useRouter()
  return (
    <header
      className="px-5 py-4 flex items-center gap-3 border-b sticky top-0 z-10"
      style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      {backPath && (
        <button onClick={() => router.push(backPath)} style={{ color: 'var(--text2)' }} className="text-xl">←</button>
      )}
      <h1 className="font-bold flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{title}</h1>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${className}`}
      style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

export function Btn({
  children, onClick, variant = 'primary', size = 'md', disabled, type, className = ''
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  const bg = variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? '#ef4444' : variant === 'success' ? '#22c55e' : 'var(--bg3)'
  const py = size === 'sm' ? 'py-1.5 px-3 text-xs' : size === 'lg' ? 'py-4 px-6 text-sm' : 'py-2.5 px-4 text-sm'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl font-medium transition-opacity disabled:opacity-50 ${py} ${className}`}
      style={{ backgroundColor: bg, color: '#fff' }}
    >
      {children}
    </button>
  )
}

export function Input({
  label, value, onChange, type = 'text', placeholder, required, rows
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  rows?: number
}) {
  const style = {
    backgroundColor: 'var(--bg3)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }
  return (
    <div>
      {label && <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>}
      {rows ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none placeholder:opacity-40"
          style={style}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none placeholder:opacity-40"
          style={style}
        />
      )}
    </div>
  )
}

export function Select({
  label, value, onChange, children
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div>
      {label && <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        {children}
      </select>
    </div>
  )
}
