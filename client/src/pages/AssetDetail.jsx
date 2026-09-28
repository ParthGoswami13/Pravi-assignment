import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ClipboardCheck, Pencil, Wrench, ChevronRight, History, FileSearch, Play, CheckCircle2, QrCode } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, CONDITION } from '../lib/constants'
import { daysUntil, formatDate, formatDateTime, formatINR, relative } from '../lib/format'
import AssetMap from '../components/AssetMap'
import { StatusDialog, InspectionDialog, WorkOrderCreateDialog, CompleteDialog, useStartWorkOrder } from '../components/dialogs'
import { QrTagDialog, LinkDialog } from '../components/assetTools'
import { ForecastCard, ImpactBanner, DependenciesTab } from '../components/assetPanels'
import { AssetCode, Button, Card, CardHeader, ConditionBadge, EmptyState, ErrorState, HealthRing, PriorityBadge, Skeleton, StatusBadge, Table, Tabs, Td, Th } from '../components/ui'

const WO_STATUS = { OPEN: ['Open', 'var(--color-ink-2)', 'var(--color-subtle)'], IN_PROGRESS: ['In progress', 'var(--color-brand-700)', 'var(--color-brand-50)'], COMPLETED: ['Completed', 'var(--color-ok)', 'var(--color-ok-bg)'] }
export const WoStatus = ({ s }) => <span className="inline-flex h-[22px] items-center rounded px-2 text-xs font-medium" style={{ color: WO_STATUS[s][1], background: WO_STATUS[s][2] }}>{WO_STATUS[s][0]}</span>

function KV({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children ?? '—'}</dd>
    </div>
  )
}

function Overview({ asset }) {
  const cat = CATEGORIES[asset.category]
  const ageYears = asset.installedOn ? (Date.now() - new Date(asset.installedOn)) / (365.25 * 86400000) : null
  const lifePct = ageYears != null ? Math.min(100, Math.round((ageYears / asset.usefulLifeYears) * 100)) : null
  const warrantyDays = daysUntil(asset.warrantyExpiry)
  const inspDue = daysUntil(asset.nextInspectionDue)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {!['PLANNED', 'RETIRED'].includes(asset.status) && <ForecastCard id={asset._id} />}
        <Card>
          <CardHeader title="Details" />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3">
            <KV label="Category">{cat?.label}</KV>
            <KV label="Condition"><ConditionBadge value={asset.condition} /></KV>
            <KV label="Acquisition cost"><span className="tabular">{formatINR(asset.cost)}</span></KV>
            <KV label="Installed / commissioned">{formatDate(asset.installedOn)}</KV>
            <KV label="Useful life">{asset.usefulLifeYears} years</KV>
            <KV label="Warranty">
              {asset.warrantyExpiry ? <span className={warrantyDays != null && warrantyDays <= 30 && warrantyDays >= 0 ? 'font-medium text-warn' : ''}>
                {formatDate(asset.warrantyExpiry)}{warrantyDays != null && warrantyDays >= 0 && warrantyDays <= 30 ? ` (${warrantyDays} d left)` : warrantyDays < 0 ? ' (expired)' : ''}
              </span> : '—'}
            </KV>
          </dl>
          {lifePct != null && (
            <div className="border-t border-line px-5 py-4">
              <div className="flex justify-between text-xs"><span className="text-ink-3">Design life used</span><span className="tabular font-medium">{ageYears.toFixed(1)} of {asset.usefulLifeYears} yrs · {lifePct}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full" style={{ width: `${lifePct}%`, background: lifePct >= 100 ? 'var(--color-bad)' : lifePct >= 75 ? '#e0a312' : 'var(--color-brand-600)' }} />
              </div>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Specifications" subtitle={`Technical attributes for ${cat?.label.toLowerCase()}`} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3">
            {Object.entries(asset.specs ?? {}).length === 0 ? <p className="text-sm text-ink-3">No specifications recorded.</p>
              : Object.entries(asset.specs).map(([k, v]) => (
                <KV key={k} label={cat?.specs.find(([key]) => key === k)?.[1] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</KV>
              ))}
          </dl>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <AssetMap assets={[asset]} height="200px" interactive={false} fit={false} />
          <dl className="space-y-3 p-5">
            <KV label="Address">{asset.address}</KV>
            <KV label="Ward">{asset.ward}</KV>
            <KV label="Coordinates"><span className="font-mono text-xs">{asset.location.lat.toFixed(5)}, {asset.location.lng.toFixed(5)}</span></KV>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Inspection schedule" />
          <dl className="space-y-3 p-5">
            <KV label="Last inspected">{formatDate(asset.lastInspectedAt)}</KV>
            <KV label="Next inspection due">
              {asset.nextInspectionDue ? <span className={inspDue < 0 ? 'font-medium text-bad' : ''}>{formatDate(asset.nextInspectionDue)}{inspDue < 0 ? ` · overdue ${Math.abs(inspDue)} d` : ` · in ${inspDue} d`}</span> : '—'}
            </KV>
            <KV label="Open work orders">{asset.openWorkOrders}</KV>
          </dl>
        </Card>
      </div>
    </div>
  )
}

function Inspections({ id }) {
  const { data, isLoading } = useQuery({ queryKey: ['inspections', id], queryFn: () => api.get(`/assets/${id}/inspections`) })
  if (isLoading) return <Skeleton className="h-40" />
  if (!data.items.length) return <Card><EmptyState icon={FileSearch} title="No inspections recorded" body="Record the first condition assessment to start tracking health over time." /></Card>
  return (
    <Card>
      <Table>
        <thead><tr><Th>Date</Th><Th>Condition</Th><Th>Findings</Th><Th>Inspector</Th><Th>Next due</Th></tr></thead>
        <tbody>
          {data.items.map((i) => (
            <tr key={i._id}>
              <Td className="whitespace-nowrap text-[13px]">{formatDate(i.date)}</Td>
              <Td><ConditionBadge value={i.condition} /></Td>
              <Td className="max-w-md text-[13px] text-ink-2">{i.notes}</Td>
              <Td className="text-[13px]">{i.inspector?.name ?? '—'}</Td>
              <Td className="whitespace-nowrap text-[13px]">{formatDate(i.nextDueDate)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

function WorkOrders({ asset, canEdit }) {
  const { data, isLoading } = useQuery({ queryKey: ['workorders', { assetId: asset._id }], queryFn: () => api.get(`/workorders?assetId=${asset._id}`) })
  const start = useStartWorkOrder()
  const [completing, setCompleting] = useState(null)
  if (isLoading) return <Skeleton className="h-40" />
  if (!data.items.length) return <Card><EmptyState icon={Wrench} title="No work orders yet" body="Maintenance and repair jobs for this asset will appear here." /></Card>
  return (
    <Card>
      <Table>
        <thead><tr><Th>Work order</Th><Th>Type</Th><Th>Priority</Th><Th>Status</Th><Th>Assigned</Th><Th>Cost</Th><Th /></tr></thead>
        <tbody>
          {data.items.map((w) => (
            <tr key={w._id}>
              <Td><AssetCode>{w.woNumber}</AssetCode><span className="block text-[13px] font-medium">{w.title}</span></Td>
              <Td className="text-[13px] text-ink-2">{w.type === 'REPAIR' ? 'Repair' : 'Preventive'}{w.source === 'CITIZEN' && <span className="ml-1.5 rounded bg-info-bg px-1.5 py-0.5 text-[11px] text-info">Citizen</span>}</Td>
              <Td><PriorityBadge priority={w.priority} /></Td>
              <Td><WoStatus s={w.status} /></Td>
              <Td className="text-[13px]">{w.assignedTo?.name ?? <span className="text-ink-4">Unassigned</span>}</Td>
              <Td className="tabular text-[13px]">{w.status === 'COMPLETED' ? formatINR(w.cost) : '—'}</Td>
              <Td className="text-right">
                {canEdit && w.status === 'OPEN' && <Button size="sm" variant="secondary" loading={start.isPending && start.variables?._id === w._id} onClick={() => start.mutate(w)}><Play className="size-3.5" />Start</Button>}
                {canEdit && w.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => setCompleting(w)}><CheckCircle2 className="size-3.5" />Complete</Button>}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {completing && <CompleteDialog workOrder={completing} open onClose={() => setCompleting(null)} />}
    </Card>
  )
}

const ACTION_DOT = { STATUS_CHANGED: 'var(--color-brand-600)', INSPECTION_RECORDED: 'var(--color-ok)', WO_CREATED: 'var(--color-warn)', WO_STARTED: 'var(--color-warn)', WO_COMPLETED: 'var(--color-ok)', ASSET_CREATED: 'var(--color-plan)', ASSET_UPDATED: 'var(--color-ink-3)' }

function HistoryTab({ id }) {
  const { data, isLoading } = useQuery({ queryKey: ['activity', id], queryFn: () => api.get(`/assets/${id}/activity`) })
  if (isLoading) return <Skeleton className="h-40" />
  if (!data.items.length) return <Card><EmptyState icon={History} title="No history yet" /></Card>
  return (
    <Card className="p-5">
      <ol className="relative space-y-5 border-l border-line pl-5">
        {data.items.map((e) => (
          <li key={e._id} className="relative">
            <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-surface" style={{ background: ACTION_DOT[e.action] ?? 'var(--color-ink-3)' }} />
            <p className="text-sm text-ink">{e.message}{e.meta?.automatic && <span className="ml-2 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-ink-3">automatic</span>}</p>
            <p className="mt-0.5 text-xs text-ink-3" title={formatDateTime(e.createdAt)}>{e.actor ? `${e.actor.name} · ${e.actor.role.toLowerCase()}` : 'Citizen / system'} · {relative(e.createdAt)}</p>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export default function AssetDetail() {
  const { id } = useParams()
  const { canEdit } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const [dialog, setDialog] = useState(null)
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['asset', id], queryFn: () => api.get(`/assets/${id}`) })
  const rel = useQuery({ queryKey: ['relationships', id], queryFn: () => api.get(`/assets/${id}/relationships`) })
  const openTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-10" /><Skeleton className="h-80" /></div>
  const asset = data.asset
  const Icon = CATEGORIES[asset.category]?.icon
  const retired = asset.status === 'RETIRED'

  return (
    <>
      <nav className="mb-3 flex items-center gap-1 text-sm text-ink-3" aria-label="Breadcrumb">
        <Link to="/assets" className="hover:text-ink">Assets</Link><ChevronRight className="size-3.5" /><span className="font-mono text-xs text-ink">{asset.assetCode}</span>
      </nav>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <HealthRing score={asset.healthScore} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-ink-3">{Icon && <Icon className="size-4" strokeWidth={1.75} />}<AssetCode>{asset.assetCode}</AssetCode></div>
            <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.01em] sm:text-2xl">{asset.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <StatusBadge status={asset.status} />
              <span>{CATEGORIES[asset.category]?.label} · {asset.ward}</span>
              {asset.condition && <span>· Condition {asset.condition} ({CONDITION[asset.condition].label})</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!retired && <Button variant="secondary" onClick={() => setDialog('qr')}><QrCode className="size-4" />QR tag</Button>}
          {canEdit && !retired && <>
            <Button variant="secondary" onClick={() => setDialog('wo')}><Wrench className="size-4" />Work order</Button>
            {asset.status !== 'PLANNED' && <Button variant="secondary" onClick={() => setDialog('inspect')}><ClipboardCheck className="size-4" />Record inspection</Button>}
            <Link to={`/assets/${asset._id}/edit`}><Button variant="secondary"><Pencil className="size-4" />Edit</Button></Link>
            <Button onClick={() => setDialog('status')}><ArrowLeftRight className="size-4" />Change status</Button>
          </>}
        </div>
      </div>
      <ImpactBanner rel={rel.data} onOpen={() => openTab('dependencies')} />
      <Tabs
        value={tab} onChange={openTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'inspections', label: 'Inspections' },
          { value: 'workorders', label: 'Work orders', count: asset.openWorkOrders || null },
          { value: 'dependencies', label: 'Dependencies', count: rel.data ? rel.data.providers.length + rel.data.dependents.length || null : null },
          { value: 'history', label: 'History' },
        ]}
      />
      <div className="mt-5">
        {tab === 'overview' && <Overview asset={asset} />}
        {tab === 'inspections' && <Inspections id={asset._id} />}
        {tab === 'workorders' && <WorkOrders asset={asset} canEdit={canEdit} />}
        {tab === 'dependencies' && <DependenciesTab asset={asset} rel={rel.data} canEdit={canEdit && !retired} onAdd={() => setDialog('link')} />}
        {tab === 'history' && <HistoryTab id={asset._id} />}
      </div>
      {dialog === 'status' && <StatusDialog asset={asset} open onClose={() => setDialog(null)} />}
      {dialog === 'inspect' && <InspectionDialog asset={asset} open onClose={() => setDialog(null)} />}
      {dialog === 'wo' && <WorkOrderCreateDialog asset={asset} open onClose={() => setDialog(null)} />}
      {dialog === 'qr' && <QrTagDialog asset={asset} open onClose={() => setDialog(null)} />}
      {dialog === 'link' && <LinkDialog asset={asset} open onClose={() => setDialog(null)} />}
    </>
  )
}
