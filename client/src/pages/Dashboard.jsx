import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Boxes, Activity, AlertTriangle, ClipboardX, Wrench, HeartPulse, ArrowRight, CircleCheck, TrendingDown, Unplug } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES, STATUS } from '../lib/constants'
import { formatINRCompact, formatINR } from '../lib/format'
import { AssetCode, Card, CardHeader, EmptyState, ErrorState, HealthBar, PageHeader, Skeleton, StatusBadge } from '../components/ui'

function Kpi({ label, value, sub, icon: Icon, to, tone }) {
  const toneCls = tone === 'bad' ? 'bg-bad-bg text-bad' : tone === 'warn' ? 'bg-warn-bg text-warn' : 'bg-brand-50 text-brand-600'
  return (
    <Link to={to} className="group rounded-lg border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between">
        <p className="text-[13px] text-ink-2">{label}</p>
        <span className={`flex size-7 items-center justify-center rounded-md ${toneCls}`}><Icon className="size-4" strokeWidth={1.75} /></span>
      </div>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-ink-3">{sub}<ArrowRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></p>
    </Link>
  )
}

// Chart colours read the theme tokens so they switch with light/dark mode
const tooltipStyle = { borderRadius: 8, border: '1px solid var(--color-line)', boxShadow: 'var(--shadow-pop)', fontSize: 12, background: 'var(--color-surface)', color: 'var(--color-ink)' }
const tooltipText = { color: 'var(--color-ink)' }
const axis = { fontSize: 11, fill: 'var(--color-ink-3)' }
const cursor = { fill: 'var(--color-subtle)' }

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard') })
  const attention = useQuery({ queryKey: ['attention'], queryFn: () => api.get('/assets/attention') })
  const forecast = useQuery({ queryKey: ['forecast'], queryFn: () => api.get('/dashboard/forecast') })
  const impact = useQuery({ queryKey: ['impact'], queryFn: () => api.get('/impact') })
  const d = dash.data
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={`Navpur Municipal Corporation · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />
      {dash.isError ? <Card><ErrorState error={dash.error} onRetry={dash.refetch} /></Card> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {!d ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[108px]" />) : <>
              <Kpi label="Total assets" value={d.kpis.totalAssets} sub="Excluding retired" icon={Boxes} to="/assets" />
              <Kpi label="Operational availability" value={`${d.kpis.operationalPct}%`} sub={`${d.kpis.underMaintenance} under maintenance`} icon={Activity} to="/assets?status=UNDER_MAINTENANCE,DAMAGED" />
              <Kpi label="Damaged assets" value={d.kpis.damaged} sub="Need repair" icon={AlertTriangle} to="/assets?status=DAMAGED" tone={d.kpis.damaged ? 'bad' : undefined} />
              <Kpi label="Inspections overdue" value={d.kpis.inspectionsOverdue} sub="Past due date" icon={ClipboardX} to="/assets?overdue=1" tone={d.kpis.inspectionsOverdue ? 'warn' : undefined} />
              <Kpi label="Open work orders" value={d.kpis.openWorkOrders} sub="Open + in progress" icon={Wrench} to="/work-orders" />
              <Kpi label="Average health" value={d.kpis.avgHealth} sub="Out of 100" icon={HeartPulse} to="/assets?sort=healthScore" />
            </>}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-5">
              <CardHeader title="Needs attention" subtitle="Poor health, overdue inspection or expiring warranty" action={<Link to="/assets?sort=healthScore" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>} />
              {attention.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                : !attention.data?.items.length ? <EmptyState icon={CircleCheck} title="All clear" body="No assets currently need attention." />
                : (
                  <ul className="divide-y divide-line">
                    {attention.data.items.slice(0, 7).map((a) => (
                      <li key={a._id}>
                        <button onClick={() => navigate(`/assets/${a._id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-page">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium"><AssetCode>{a.assetCode}</AssetCode> <span className="ml-1">{a.name}</span></p>
                            <p className="mt-0.5 truncate text-xs text-bad">{a.reasons.join(' · ')}</p>
                          </div>
                          <HealthBar score={a.healthScore} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>

            <Card className="xl:col-span-7">
              <CardHeader title="Assets by category" subtitle="Click a bar to open the filtered list" />
              <div className="h-[300px] p-4">
                {!d ? <Skeleton className="h-full" /> : (
                  <ResponsiveContainer>
                    <BarChart data={d.byCategory.map((c) => ({ ...c, name: CATEGORIES[c.category]?.label }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} stroke="var(--color-line)" />
                      <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={140} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipText} itemStyle={tooltipText} cursor={cursor} />
                      <Bar isAnimationActive={false} dataKey="count" name="Assets" fill="var(--color-brand-600)" radius={[0, 4, 4, 0]} barSize={18} className="cursor-pointer" onClick={(e) => navigate(`/assets?category=${e.category ?? e.payload?.category}`)} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="xl:col-span-7">
              <CardHeader
                title="Failure forecast"
                subtitle="Predicted to reach Critical within 12 months, from inspection trends"
                action={forecast.data && <span className="rounded bg-bad-bg px-2 py-0.5 text-xs font-semibold text-bad">{forecast.data.within90} within 90 days</span>}
              />
              {forecast.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
                : !forecast.data?.items.length ? <EmptyState icon={TrendingDown} title="No failures predicted" body="No asset is trending towards Critical in the next 12 months." />
                : (
                  <ul className="divide-y divide-line">
                    {forecast.data.items.map(({ asset: a, trend, criticalDate, daysToCritical, slopePerYear }) => {
                      const Icon = CATEGORIES[a.category]?.icon ?? Boxes
                      const urgent = trend === 'CRITICAL_NOW' || daysToCritical <= 30
                      return (
                        <li key={a._id}>
                          <button onClick={() => navigate(`/assets/${a._id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-page">
                            <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium"><AssetCode>{a.assetCode}</AssetCode> <span className="ml-1">{a.name}</span></p>
                              <p className="mt-0.5 text-xs text-ink-3">{trend === 'CRITICAL_NOW' ? 'Already critical' : `Declining ${Math.abs(slopePerYear)} pts/yr`} · {a.ward}</p>
                            </div>
                            <div className="text-right">
                              <p className={`tabular text-sm font-semibold ${urgent ? 'text-bad' : 'text-warn'}`}>
                                {trend === 'CRITICAL_NOW' ? 'Now' : daysToCritical <= 0 ? 'Overdue' : `${daysToCritical} d`}
                              </p>
                              <p className="text-[11px] text-ink-4">{criticalDate ? new Date(criticalDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'condition 1'}</p>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
            </Card>

            <Card className="xl:col-span-5">
              <CardHeader title="Service impact" subtitle="Failed assets and the dependent assets they take down" action={impact.data && <span className="rounded bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">{impact.data.totalImpacted} affected</span>} />
              {impact.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                : !impact.data?.groups.length ? <EmptyState icon={CircleCheck} title="No knock-on outages" body="All upstream assets (feeder pillars, bridges, pumps) are in service." />
                : (
                  <ul className="divide-y divide-line">
                    {impact.data.groups.map(({ provider: p, affected }) => (
                      <li key={p._id} className="px-5 py-3">
                        <button onClick={() => navigate(`/assets/${p._id}?tab=dependencies`)} className="flex w-full items-center gap-2 text-left">
                          <Unplug className="size-4 shrink-0 text-bad" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium"><AssetCode>{p.assetCode}</AssetCode> <span className="ml-1">{p.name}</span></span>
                          <StatusBadge status={p.status} />
                        </button>
                        <p className="mt-1.5 pl-6 text-xs text-ink-3">
                          Affects <strong className="text-ink">{affected.length}</strong> {affected.length === 1 ? 'asset' : 'assets'}: {affected.slice(0, 6).map((x) => x.assetCode).join(', ')}{affected.length > 6 ? '…' : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>

            <Card className="xl:col-span-5">
              <CardHeader title="Lifecycle status" subtitle="All registered assets" />
              <div className="flex h-[260px] items-center gap-4 p-4">
                {!d ? <Skeleton className="h-full w-full" /> : <>
                  <div className="h-full flex-1">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie isAnimationActive={false} data={d.byStatus} dataKey="count" nameKey="status" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none"
                          onClick={(e) => navigate(`/assets?status=${e.status ?? e.payload?.status}`)} className="cursor-pointer">
                          {d.byStatus.map((s) => <Cell key={s.status} fill={STATUS[s.status]?.pin} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipText} formatter={(v, _n, p) => [v, STATUS[p.payload.status]?.label]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {Object.keys(STATUS).map((k) => {
                      const c = d.byStatus.find((s) => s.status === k)?.count ?? 0
                      return (
                        <li key={k}>
                          <Link to={`/assets?status=${k}`} className="flex items-center gap-2 hover:underline">
                            <span className="size-2.5 rounded-sm" style={{ background: STATUS[k].pin }} />
                            <span className="text-ink-2">{STATUS[k].label}</span>
                            <span className="tabular ml-auto pl-4 font-medium">{c}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </>}
              </div>
            </Card>

            <Card className="xl:col-span-7">
              <CardHeader title="Maintenance spend" subtitle="Completed work orders, last 6 months" action={d && <span className="tabular text-sm font-semibold">{formatINR(d.costByMonth.reduce((a, m) => a + m.cost, 0))}</span>} />
              <div className="h-[260px] p-4">
                {!d ? <Skeleton className="h-full" /> : (
                  <ResponsiveContainer>
                    <BarChart data={d.costByMonth} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-line)" />
                      <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                      <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={formatINRCompact} width={64} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipText} itemStyle={tooltipText} cursor={cursor} formatter={(v, _n, p) => [`${formatINR(v)} · ${p.payload.count} jobs`, 'Spend']} />
                      <Bar isAnimationActive={false} dataKey="cost" fill="#0e9384" radius={[4, 4, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card className="xl:col-span-12">
              <CardHeader title="Ward overview" subtitle="Asset count and average health by ward" />
              {!d ? <div className="p-4"><Skeleton className="h-24" /></div> : (
                <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4 xl:grid-cols-8">
                  {d.byWard.map((w) => (
                    <Link key={w.ward} to={`/assets?ward=${encodeURIComponent(w.ward)}`} className="bg-surface px-4 py-3 hover:bg-page">
                      <p className="truncate text-xs text-ink-3">{w.ward}</p>
                      <p className="tabular mt-1 text-lg font-semibold">{w.count}</p>
                      <HealthBar score={w.avgHealth} />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}

