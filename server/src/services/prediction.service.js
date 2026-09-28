// Condition forecast: least-squares linear regression of inspection condition over time.
// Projects when the fitted line reaches condition 1 (Critical). Pure function, unit tested.
const DAY = 86400000
const CRITICAL = 1
const STABLE_THRESHOLD = 0.1 // condition points per year

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export function predictCondition(inspections, now = new Date()) {
  const pts = inspections
    .map((i) => ({ t: new Date(i.date).getTime(), c: Number(i.condition) }))
    .sort((a, b) => a.t - b.t)
  if (pts.length < 2 || new Set(pts.map((p) => p.t)).size < 2) {
    return { trend: 'INSUFFICIENT_DATA', points: pts.length, history: pts }
  }

  const t0 = pts[0].t
  const xs = pts.map((p) => (p.t - t0) / DAY)
  const ys = pts.map((p) => p.c)
  const n = pts.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  const slope = sxy / sxx // condition points per day
  const intercept = my - slope * mx
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0)
  const ssRes = ys.reduce((a, y, i) => a + (y - (intercept + slope * xs[i])) ** 2, 0)
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot
  const slopePerYear = slope * 365.25
  const latest = pts[pts.length - 1]
  const at = (t) => intercept + slope * ((t - t0) / DAY)

  const base = { slopePerYear: round(slopePerYear), r2: round(r2), points: n, latestCondition: latest.c, history: pts }

  if (latest.c <= CRITICAL) return { ...base, trend: 'CRITICAL_NOW', daysToCritical: 0 }

  if (slopePerYear > -STABLE_THRESHOLD) {
    const end = now.getTime() + 365 * DAY
    return { ...base, trend: slopePerYear > STABLE_THRESHOLD ? 'IMPROVING' : 'STABLE', fitLine: [{ t: t0, c: round(at(t0)) }, { t: end, c: round(Math.min(5, at(end))) }] }
  }

  const criticalT = t0 + ((CRITICAL - intercept) / slope) * DAY
  return {
    ...base,
    trend: 'DECLINING',
    criticalDate: new Date(criticalT),
    daysToCritical: Math.round((criticalT - now.getTime()) / DAY),
    fitLine: [{ t: t0, c: round(at(t0)) }, { t: criticalT, c: CRITICAL }],
  }
}
