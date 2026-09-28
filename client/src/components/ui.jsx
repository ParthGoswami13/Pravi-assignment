import { useEffect } from 'react'
import { X, Loader2, Inbox, AlertTriangle } from 'lucide-react'
import { STATUS, PRIORITY, CONDITION, healthBand } from '../lib/constants'

const cx = (...c) => c.filter(Boolean).join(' ')

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap'
  const sizes = { sm: 'h-8 px-2.5 text-[13px]', md: 'h-9 px-3.5 text-sm', lg: 'h-10 px-4 text-sm' }
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-500 shadow-sm',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle shadow-[0_1px_2px_rgba(18,21,27,0.05)]',
    ghost: 'text-ink-2 hover:bg-subtle hover:text-ink',
    danger: 'bg-bad text-white hover:opacity-90',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ className, children, ...props }) {
  return <div className={cx('rounded-lg border border-line bg-surface shadow-[var(--shadow-card)]', className)} {...props}>{children}</div>
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Pill({ fg, bg, children, dot = true, className }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 rounded px-2 text-xs font-medium whitespace-nowrap', className)} style={{ color: fg, background: bg }}>
      {dot && <span className="size-1.5 rounded-full" style={{ background: fg }} />}
      {children}
    </span>
  )
}

export const StatusBadge = ({ status }) => {
  const s = STATUS[status] ?? STATUS.ACTIVE
  return <Pill fg={s.fg} bg={s.bg}>{s.label}</Pill>
}

export const PriorityBadge = ({ priority }) => {
  const p = PRIORITY[priority] ?? PRIORITY.LOW
  return <Pill fg={p.fg} bg={p.bg} dot={false}>{priority[0] + priority.slice(1).toLowerCase()}</Pill>
}

export function ConditionBadge({ value }) {
  const c = CONDITION[value]
  if (!c) return <span className="text-ink-4">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className="h-3 w-1 rounded-sm" style={{ background: i <= value ? c.color : 'var(--color-line)' }} />)}
      </span>
      <span className="text-ink-2">{c.label}</span>
    </span>
  )
}

export function HealthBar({ score }) {
  const b = healthBand(score)
  if (score == null) return <span className="text-ink-4">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full rounded-full" style={{ width: `${score}%`, background: b.color }} />
      </span>
      <span className="tabular w-6 text-[13px] font-medium" style={{ color: b.color }}>{score}</span>
    </span>
  )
}

export function HealthRing({ score, size = 72 }) {
  const b = healthBand(score)
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }} role="meter" aria-valuenow={score ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Health score">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-subtle)" strokeWidth="6" />
        {score != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={b.color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-lg font-semibold leading-none" style={{ color: b.color }}>{score ?? '—'}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">{b.label}</span>
      </div>
    </div>
  )
}

export const AssetCode = ({ children }) => <span className="font-mono text-[12.5px] font-medium text-ink-2">{children}</span>

export function Field({ label, error, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  )
}

const inputCls = 'h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors hover:border-ink-4 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/25 disabled:bg-page'
const width = (c) => (c && /(^|\s)w-/.test(c) ? '' : 'w-full')
export const Input = ({ className, ...p }) => <input className={cx(inputCls, width(className), className)} {...p} />
export const Select = ({ className, children, ...p }) => <select className={cx(inputCls, width(className), 'pr-8', className)} {...p}>{children}</select>
export const Textarea = ({ className, ...p }) => <textarea className={cx(inputCls, 'w-full h-auto min-h-[84px] py-2', className)} {...p} />

export function Dialog({ open, onClose, title, description, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-surface shadow-[var(--shadow-pop)] sm:rounded-xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-subtle" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-page/60 px-6 py-3.5 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-md bg-subtle', className)} />
}

export function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icon className="size-5" /></div>
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-bad-bg text-bad"><AlertTriangle className="size-5" /></div>
      <p className="font-medium">Couldn’t load this</p>
      <p className="mt-1 text-sm text-ink-3">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand-600 text-ink' : 'border-transparent text-ink-3 hover:text-ink')}
        >
          {t.label}{t.count != null && <span className="ml-1.5 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Table({ children }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">{children}</table></div>
}
export const Th = ({ children, className }) => <th className={cx('sticky top-0 h-9 border-b border-line bg-page px-4 text-xs font-medium text-ink-3', className)}>{children}</th>
export const Td = ({ children, className, ...p }) => <td className={cx('h-11 border-b border-line px-4', className)} {...p}>{children}</td>
