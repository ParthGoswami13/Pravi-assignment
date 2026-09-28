import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wrench, Play, CheckCircle2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { daysUntil, formatDate, formatINR } from '../lib/format'
import { CompleteDialog, useStartWorkOrder } from '../components/dialogs'
import { AssetCode, Button, Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Skeleton, StatusBadge, Table, Tabs, Td, Th } from '../components/ui'
import { WoStatus } from './AssetDetail'

const TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
]

export default function WorkOrders() {
  const { canEdit } = useAuth()
  const [tab, setTab] = useState('OPEN')
  const all = useQuery({ queryKey: ['workorders', 'all'], queryFn: () => api.get('/workorders') })
  const start = useStartWorkOrder()
  const [completing, setCompleting] = useState(null)
  const items = all.data?.items.filter((w) => w.status === tab) ?? []
  const counts = Object.fromEntries(TABS.map((t) => [t.value, all.data?.items.filter((w) => w.status === t.value).length]))

  return (
    <>
      <PageHeader title="Work orders" description="Repairs and maintenance jobs. Starting a job puts its asset under maintenance; completing it restores the asset." />
      <Card>
        <div className="px-3"><Tabs value={tab} onChange={setTab} tabs={TABS.map((t) => ({ ...t, count: counts[t.value] }))} /></div>
        {all.isError ? <ErrorState error={all.error} onRetry={all.refetch} /> : all.isLoading ? (
          <div className="space-y-2 p-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={Wrench} title={`No ${TABS.find((t) => t.value === tab).label.toLowerCase()} work orders`} body="Work orders are created from an asset page, from damage reports, or by citizens." />
        ) : (
          <Table>
            <thead><tr><Th>Work order</Th><Th>Asset</Th><Th>Priority</Th><Th>Status</Th><Th>Assigned</Th><Th>{tab === 'COMPLETED' ? 'Completed' : 'Due'}</Th>{tab === 'COMPLETED' && <Th>Cost</Th>}<Th /></tr></thead>
            <tbody>
              {items.map((w) => {
                const due = daysUntil(w.dueDate)
                return (
                  <tr key={w._id} className="hover:bg-page">
                    <Td className="max-w-[280px]">
                      <AssetCode>{w.woNumber}</AssetCode>
                      <span className="block truncate text-[13px] font-medium">{w.title}</span>
                      {w.source === 'CITIZEN' && <span className="mt-0.5 inline-block rounded bg-info-bg px-1.5 py-0.5 text-[11px] font-medium text-info">Citizen complaint</span>}
                    </Td>
                    <Td>
                      {w.asset ? <Link to={`/assets/${w.asset._id}`} className="block hover:underline"><AssetCode>{w.asset.assetCode}</AssetCode><span className="block max-w-[200px] truncate text-[13px]">{w.asset.name}</span></Link> : '—'}
                      {w.asset && <span className="mt-1 inline-block"><StatusBadge status={w.asset.status} /></span>}
                    </Td>
                    <Td><PriorityBadge priority={w.priority} /></Td>
                    <Td><WoStatus s={w.status} /></Td>
                    <Td className="text-[13px]">{w.assignedTo?.name ?? <span className="text-ink-4">Unassigned</span>}</Td>
                    <Td className="whitespace-nowrap text-[13px]">
                      {tab === 'COMPLETED' ? formatDate(w.completedAt) : w.dueDate ? (due < 0 ? <span className="font-medium text-bad">Overdue {Math.abs(due)} d</span> : formatDate(w.dueDate)) : '—'}
                    </Td>
                    {tab === 'COMPLETED' && <Td className="tabular text-[13px]">{formatINR(w.cost)}</Td>}
                    <Td className="text-right">
                      {canEdit && w.status === 'OPEN' && <Button size="sm" variant="secondary" loading={start.isPending && start.variables?._id === w._id} onClick={() => start.mutate(w)}><Play className="size-3.5" />Start</Button>}
                      {canEdit && w.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => setCompleting(w)}><CheckCircle2 className="size-3.5" />Complete</Button>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {completing && <CompleteDialog workOrder={completing} open onClose={() => setCompleting(null)} />}
    </>
  )
}
