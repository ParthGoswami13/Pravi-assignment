import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Plus, Search, Download, X, Boxes, ChevronLeft, ChevronRight } from 'lucide-react'
import { api, qs } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, STATUS, WARDS } from '../lib/constants'
import { daysUntil, formatDate } from '../lib/format'
import { AssetCode, Button, Card, ConditionBadge, EmptyState, ErrorState, HealthBar, Input, PageHeader, Select, Skeleton, StatusBadge, Table, Td, Th } from '../components/ui'

const FILTER_KEYS = ['q', 'category', 'status', 'ward', 'health', 'overdue', 'sort', 'page']

export default function Assets() {
  const { canEdit } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']))
  const [search, setSearch] = useState(query.q)

  useEffect(() => {
    const t = setTimeout(() => { if (search !== query.q) update({ q: search }) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['assets', query],
    queryFn: () => api.get(`/assets${qs({ ...query, limit: 20 })}`),
    placeholderData: keepPreviousData,
  })

  const chips = [
    query.category && { key: 'category', label: `Category: ${query.category.split(',').map((c) => CATEGORIES[c]?.label).join(', ')}` },
    query.status && { key: 'status', label: `Status: ${query.status.split(',').map((s) => STATUS[s]?.label).join(', ')}` },
    query.ward && { key: 'ward', label: `Ward: ${query.ward}` },
    query.health && { key: 'health', label: `Health: ${query.health.toLowerCase()}` },
    query.overdue && { key: 'overdue', label: 'Inspection overdue' },
    query.q && { key: 'q', label: `Search: “${query.q}”` },
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        title="Assets"
        description={data ? `${data.total} asset${data.total === 1 ? '' : 's'} match the current view` : 'Registry of all public infrastructure assets'}
        actions={<>
          <Button variant="secondary" onClick={() => { window.location.href = `/api/assets/export${qs(query)}` }}><Download className="size-4" />Export CSV</Button>
          {canEdit && <Button onClick={() => navigate('/assets/new')}><Plus className="size-4" />New asset</Button>}
        </>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <Input className="w-full pl-8" placeholder="Search code, name or address" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search assets" />
          </div>
          <Select className="w-auto" value={query.category} onChange={(e) => update({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </Select>
          <Select className="w-auto" value={query.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">Active statuses</option>
            {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </Select>
          <Select className="w-auto" value={query.ward} onChange={(e) => update({ ward: e.target.value })} aria-label="Ward">
            <option value="">All wards</option>
            {WARDS.map((w) => <option key={w}>{w}</option>)}
          </Select>
          <Select className="w-auto" value={query.health} onChange={(e) => update({ health: e.target.value })} aria-label="Health">
            <option value="">Any health</option>
            <option value="POOR">Poor (&lt;40)</option>
            <option value="FAIR">Fair (40–69)</option>
            <option value="GOOD">Good (70+)</option>
          </Select>
          <Select className="w-auto sm:ml-auto" value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
            <option value="">Sort: Lowest health</option>
            <option value="-healthScore">Sort: Highest health</option>
            <option value="assetCode">Sort: Asset code</option>
            <option value="nextInspectionDue">Sort: Next inspection</option>
            <option value="-updatedAt">Sort: Recently updated</option>
          </Select>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            {chips.map((c) => (
              <button key={c.key} onClick={() => { if (c.key === 'q') setSearch(''); update({ [c.key]: '' }) }}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-50 px-2.5 text-xs font-medium text-brand-700 hover:bg-brand-100" aria-label={`Remove filter ${c.label}`}>
                {c.label}<X className="size-3" />
              </button>
            ))}
            <button onClick={() => { setSearch(''); setParams({}, { replace: true }) }} className="text-xs font-medium text-ink-3 hover:text-ink">Clear all</button>
          </div>
        )}

        {isError ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Boxes} title={chips.length ? 'No assets match these filters' : 'No assets registered yet'}
            body={chips.length ? 'Try removing a filter or searching for something else.' : 'Register bridges, street lights and other infrastructure to start tracking their lifecycle.'}
            action={chips.length ? <Button variant="secondary" onClick={() => { setSearch(''); setParams({}) }}>Clear filters</Button> : canEdit && <Button onClick={() => navigate('/assets/new')}>New asset</Button>} />
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
            <Table>
              <thead><tr><Th>Asset</Th><Th>Category</Th><Th>Status</Th><Th>Condition</Th><Th>Health</Th><Th className="hidden lg:table-cell">Ward</Th><Th className="hidden md:table-cell">Next inspection</Th></tr></thead>
              <tbody>
                {data.items.map((a) => {
                  const Icon = CATEGORIES[a.category]?.icon ?? Boxes
                  const due = daysUntil(a.nextInspectionDue)
                  return (
                    <tr key={a._id} className="cursor-pointer hover:bg-page" onClick={() => navigate(`/assets/${a._id}`)}>
                      <Td className="max-w-[320px]">
                        <Link to={`/assets/${a._id}`} onClick={(e) => e.stopPropagation()} className="block">
                          <AssetCode>{a.assetCode}</AssetCode>
                          <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
                        </Link>
                      </Td>
                      <Td><span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"><Icon className="size-4 text-ink-3" strokeWidth={1.75} />{CATEGORIES[a.category]?.label}</span></Td>
                      <Td><StatusBadge status={a.status} /></Td>
                      <Td><ConditionBadge value={a.condition} /></Td>
                      <Td><HealthBar score={a.healthScore} /></Td>
                      <Td className="hidden text-[13px] text-ink-2 lg:table-cell">{a.ward}</Td>
                      <Td className="hidden text-[13px] md:table-cell">
                        {a.nextInspectionDue ? (due < 0 && !['RETIRED', 'PLANNED'].includes(a.status)
                          ? <span className="font-medium text-bad">Overdue {Math.abs(due)} d</span>
                          : <span className="text-ink-2">{formatDate(a.nextInspectionDue)}</span>) : <span className="text-ink-4">—</span>}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <div className="flex items-center justify-between px-4 py-3 text-sm text-ink-3">
              <span className="tabular">Page {data.page} of {data.pages} · {data.total} assets</span>
              <div className="flex gap-1">
                <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                <Button variant="secondary" size="sm" disabled={data.page >= data.pages} onClick={() => update({ page: String(data.page + 1) })} aria-label="Next page"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
