import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingDown, TrendingUp, Minus, AlertOctagon, ArrowRight, Link2, X, Unplug, TriangleAlert, Network } from 'lucide-react'
import { api } from '../lib/api'
import { CATEGORIES, CONDITION, RELATIONSHIP_RULES } from '../lib/constants'
import { formatDate } from '../lib/format'
import { useInvalidate } from './dialogs'
import { AssetCode, Button, Card, CardHeader, EmptyState, Skeleton, StatusBadge } from './ui'

const humanDays = (d) => (d < 60 ? `${d} days` : d < 730 ? `~${Math.round(d / 30.4)} months` : `~${(d / 365).toFixed(1)} years`)
const monthYear = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

const TREND = {
  DECLINING: { icon: TrendingDown, color: 'var(--color-bad)', bg: 'var(--color-bad-bg)' },
  CRITICAL_NOW: { icon: AlertOctagon, color: 'var(--color-bad)', bg: 'var(--color-bad-bg)' },
  STABLE: { icon: Minus, color: 'var(--color-ok)', bg: 'var(--color-ok-bg)' },
  IMPROVING: { icon: TrendingUp, color: 'var(--color-ok)', bg: 'var(--color-ok-bg)' },
  INSUFFICIENT_DATA: { icon: Minus, color: 'var(--color-ink-3)', bg: 'var(--color-subtle)' },
}

function headline(p) {
  switch (p.trend) {
    case 'DECLINING':
      return p.daysToCritical > 0
        ? { title: `Predicted to reach Critical around ${monthYear(p.criticalDate)}`, sub: `in ${humanDays(p.daysToCritical)} at the current rate of decline` }
        : { title: 'Projected to be at Critical level already', sub: 'The trend line has crossed the critical threshold — inspect urgently' }
    case 'CRITICAL_NOW': return { title: 'Already at Critical condition', sub: 'Repair or replacement should be scheduled now' }
    case 'IMPROVING': return { title: 'Condition is improving', sub: 'Recent maintenance is reversing wear' }
    case 'STABLE': return { title: 'Condition is stable', sub: 'No meaningful deterioration trend' }
    default: return { title: 'Not enough data to forecast', sub: 'At least 2 inspections on different dates are needed' }
  }
}

// Condition forecast: inspection history + least-squares trend line projected to "Critical" (1)
export function ForecastCard({ id }) {
  const { data, isLoading } = useQuery({ queryKey: ['prediction', id], queryFn: () => api.get(`/assets/${id}/prediction`) })
  if (isLoading) return <Skeleton className="h-[300px]" />
  const p = data.prediction
  const t = TREND[p.trend]
  const h = headline(p)
  const chartData = [
    ...p.history.map((x) => ({ t: x.t, actual: x.c })),
    ...(p.fitLine ?? []).map((x) => ({ t: x.t, projected: x.c })),
  ].sort((a, b) => a.t - b.t)

  return (
    <Card>
      <CardHeader title="Condition forecast" subtitle="Linear trend of inspection results, projected to the Critical threshold" />
      <div className="flex items-start gap-3 px-5 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: t.bg, color: t.color }}><t.icon className="size-5" /></span>
        <div>
          <p className="text-[15px] font-semibold" style={{ color: p.trend === 'DECLINING' || p.trend === 'CRITICAL_NOW' ? t.color : undefined }}>{h.title}</p>
          <p className="text-sm text-ink-3">{h.sub}</p>
        </div>
      </div>
      {p.history.length > 0 && (
        <div className="h-[200px] px-2 pt-3">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ left: -18, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: 'var(--color-ink-3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 12 }}
                labelFormatter={(v) => formatDate(v)}
                formatter={(v, name) => [`${Number(v).toFixed(1)} · ${CONDITION[Math.round(v)]?.label ?? ''}`, name === 'actual' ? 'Inspected' : 'Trend']}
              />
              <ReferenceLine y={1} stroke="var(--color-bad)" strokeDasharray="4 4" label={{ value: 'Critical', position: 'insideBottomLeft', fontSize: 11, fill: 'var(--color-bad)' }} />
              <ReferenceLine x={Date.now()} stroke="var(--color-ink-4)" strokeDasharray="2 3" label={{ value: 'Today', position: 'insideTopLeft', fontSize: 11, fill: 'var(--color-ink-3)' }} />
              <Line isAnimationActive={false} dataKey="projected" stroke="var(--color-bad)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
              <Line isAnimationActive={false} dataKey="actual" stroke="var(--color-brand-600)" strokeWidth={2} dot={{ r: 4, fill: 'var(--color-brand-600)' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="px-5 pb-4 pt-1 text-xs text-ink-3">
        {p.trend === 'INSUFFICIENT_DATA' ? `${p.points} inspection(s) recorded.`
          : `Trend ${p.slopePerYear > 0 ? '+' : ''}${p.slopePerYear} condition points / year · ${p.points} inspections · fit R² ${p.r2}. Decision support, not a structural certification.`}
      </p>
    </Card>
  )
}

// Banner shown at the top of the asset page when service is affected
export function ImpactBanner({ rel, onOpen }) {
  if (!rel) return null
  const up = rel.upstreamDown ?? []
  const down = rel.downstreamImpact ?? []
  if (!up.length && !down.length) return null
  return (
    <div className="mb-5 space-y-2">
      {up.map((p) => (
        <div key={p._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn">
          <TriangleAlert className="size-4 shrink-0" />
          <span><strong>Service affected:</strong> depends on <Link to={`/assets/${p._id}`} className="font-mono font-semibold underline">{p.assetCode}</Link> ({p.name}), which is {p.status.replace('_', ' ').toLowerCase()}.</span>
        </div>
      ))}
      {down.length > 0 && (
        <button onClick={onOpen} className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-bad/30 bg-bad-bg px-4 py-2.5 text-left text-sm text-bad">
          <Unplug className="size-4 shrink-0" />
          <span><strong>This outage affects {down.length} dependent asset{down.length > 1 ? 's' : ''}:</strong> {down.slice(0, 6).map((d) => d.assetCode).join(', ')}{down.length > 6 ? '…' : ''}</span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium">View dependencies <ArrowRight className="size-3.5" /></span>
        </button>
      )}
    </div>
  )
}

function Node({ item, label, onRemove, highlight }) {
  const Icon = CATEGORIES[item.asset.category]?.icon
  return (
    <div className={`group relative rounded-lg border bg-surface p-3 ${highlight ? 'border-bad/40 ring-2 ring-bad/15' : 'border-line'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-4">{label}</p>
      <Link to={`/assets/${item.asset._id}`} className="mt-1 flex items-center gap-2 hover:underline">
        {Icon && <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
        <span className="min-w-0"><AssetCode>{item.asset.assetCode}</AssetCode><span className="block truncate text-[13px] font-medium text-ink">{item.asset.name}</span></span>
      </Link>
      <div className="mt-2"><StatusBadge status={item.asset.status} /></div>
      {onRemove && (
        <button onClick={onRemove} className="absolute right-2 top-2 rounded p-1 text-ink-4 opacity-0 transition-opacity hover:bg-subtle hover:text-bad group-hover:opacity-100 focus:opacity-100" aria-label={`Remove link to ${item.asset.assetCode}`}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// Dependencies tab: providers (left) -> this asset (centre) -> dependents (right)
export function DependenciesTab({ asset, rel, canEdit, onAdd }) {
  const invalidate = useInvalidate()
  const remove = useMutation({
    mutationFn: (id) => api.del(`/relationships/${id}`),
    onSuccess: () => { toast.success('Link removed'); invalidate() },
    onError: (e) => toast.error(e.message),
  })
  if (!rel) return <Skeleton className="h-48" />
  const Icon = CATEGORIES[asset.category]?.icon
  const downIds = new Set((rel.downstreamImpact ?? []).map((d) => d._id))
  const confirmRemove = (r) => { if (window.confirm(`Remove link to ${r.asset.assetCode}?`)) remove.mutate(r._id) }

  if (!rel.providers.length && !rel.dependents.length) {
    return (
      <Card>
        <EmptyState icon={Network} title="No dependencies linked"
          body="Link what this asset depends on (e.g. the feeder pillar that powers a street light) so outages show their knock-on impact."
          action={canEdit && <Button onClick={onAdd}><Link2 className="size-4" />Link dependency</Button>} />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Dependency map" subtitle="If an upstream asset fails, everything downstream is flagged as affected" action={canEdit && <Button size="sm" variant="secondary" onClick={onAdd}><Link2 className="size-3.5" />Link</Button>} />
      <div className="grid grid-cols-1 items-center gap-4 p-5 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-2">Depends on</p>
          {rel.providers.length ? rel.providers.map((r) => <Node key={r._id} item={r} label={RELATIONSHIP_RULES[r.type].inverse} onRemove={canEdit ? () => confirmRemove(r) : null} />)
            : <p className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-4">Nothing upstream</p>}
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-ink-4 md:block" />
        <div className="rounded-xl border-2 border-brand-500 bg-brand-50 p-4 text-center">
          {Icon && <Icon className="mx-auto size-6 text-brand-700" strokeWidth={1.75} />}
          <p className="mt-1 font-mono text-xs font-semibold text-brand-700">{asset.assetCode}</p>
          <p className="text-sm font-semibold text-ink">{asset.name}</p>
          <div className="mt-2 flex justify-center"><StatusBadge status={asset.status} /></div>
        </div>
        <ArrowRight className="mx-auto hidden size-5 text-ink-4 md:block" />
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink-2">Supports {rel.dependents.length ? `(${rel.dependents.length})` : ''}</p>
          {rel.dependents.length ? (
            <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              {rel.dependents.map((r) => <Node key={r._id} item={r} label={RELATIONSHIP_RULES[r.type].label} highlight={downIds.has(r.asset._id)} onRemove={canEdit ? () => confirmRemove(r) : null} />)}
            </div>
          ) : <p className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-4">Nothing downstream</p>}
        </div>
      </div>
    </Card>
  )
}
