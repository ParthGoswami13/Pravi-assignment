import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { CATEGORIES, STATUS } from '../lib/constants'
import AssetMap, { IMPACT_RING } from '../components/AssetMap'
import { Card, ErrorState, PageHeader, Skeleton } from '../components/ui'

const HEALTH_LEGEND = [['Good (70+)', '#1a9a4b'], ['Fair (40–69)', '#e0a312'], ['Poor (<40)', '#d4262e'], ['Not scored', '#8a93a3']]

export default function MapView() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['map'], queryFn: () => api.get('/assets/map?includeRetired=1') })
  const [mode, setMode] = useState('status')
  const [cats, setCats] = useState(() => new Set(Object.keys(CATEGORIES)))
  const [statuses, setStatuses] = useState(() => new Set(['PLANNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED']))

  const toggle = (set, setter, key) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  const visible = useMemo(() => (data?.items ?? []).filter((a) => cats.has(a.category) && statuses.has(a.status)), [data, cats, statuses])

  const chip = (active, onClick, label, color) => (
    <button key={label} onClick={onClick} aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}{label}
    </button>
  )

  return (
    <>
      <PageHeader
        title="Map"
        description={data ? `${visible.length} of ${data.items.length} assets shown across Navpur` : 'Geographic view of every registered asset'}
        actions={data && data.items.some((a) => a.impactedBy) && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warn-bg px-2.5 py-1.5 text-xs font-medium text-warn">
            ⚠ {data.items.filter((a) => a.impactedBy).length} assets without service due to upstream failures
          </span>
        )}
      />
      <Card className="overflow-hidden">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-ink-3">Category</span>
            {Object.entries(CATEGORIES).map(([k, c]) => chip(cats.has(k), () => toggle(cats, setCats, k), c.label))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-ink-3">Status</span>
            {Object.entries(STATUS).map(([k, s]) => chip(statuses.has(k), () => toggle(statuses, setStatuses, k), s.label, s.pin))}
            <div className="ml-auto flex rounded-md border border-line p-0.5" role="group" aria-label="Colour pins by">
              {['status', 'health'].map((m) => (
                <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${mode === m ? 'bg-brand-600 text-white' : 'text-ink-2 hover:bg-subtle'}`}>Colour by {m}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="relative h-[calc(100vh-270px)] min-h-[420px]">
          {isError ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <Skeleton className="h-full rounded-none" /> : <AssetMap assets={visible} mode={mode} />}
          <div className="absolute bottom-4 left-4 z-[500] rounded-lg border border-line bg-surface/95 p-3 text-xs shadow-[var(--shadow-card)]">
            <p className="mb-1.5 font-semibold text-ink">{mode === 'status' ? 'Lifecycle status' : 'Health score'}</p>
            {(mode === 'status' ? Object.values(STATUS).map((s) => [s.label, s.pin]) : HEALTH_LEGEND).map(([l, c]) => (
              <p key={l} className="flex items-center gap-2 py-0.5 text-ink-2"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</p>
            ))}
            <p className="flex items-center gap-2 py-0.5 text-ink-2">
              <span className="size-2.5 rounded-full border-2 border-dashed" style={{ borderColor: IMPACT_RING }} />Affected by upstream failure
            </p>
            <p className="mt-1.5 text-ink-4">Larger pins: bridges, pumps, buildings, pillars</p>
          </div>
        </div>
      </Card>
    </>
  )
}
