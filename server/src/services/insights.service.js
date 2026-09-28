import { Asset, Inspection } from '../models/index.js'
import { predictCondition } from './prediction.service.js'

const FIELDS = 'assetCode name status category ward healthScore'

// Assets predicted to reach Critical within `withinDays` (or already critical), soonest first.
// Shared by the dashboard forecast card and the Ask PRAVI assistant.
export async function getForecast({ withinDays = 365 } = {}) {
  const [assets, grouped] = await Promise.all([
    Asset.find({ status: { $in: ['ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED'] } }).select(FIELDS).lean(),
    Inspection.aggregate([{ $group: { _id: '$asset', pts: { $push: { date: '$date', condition: '$condition' } } } }]),
  ])
  const byAsset = new Map(grouped.map((g) => [String(g._id), g.pts]))
  return assets
    .map((a) => ({ asset: a, prediction: predictCondition(byAsset.get(String(a._id)) ?? []) }))
    .filter(({ prediction: p }) => p.trend === 'CRITICAL_NOW' || (p.trend === 'DECLINING' && p.daysToCritical <= withinDays))
    .map(({ asset, prediction: p }) => ({ asset, trend: p.trend, criticalDate: p.criticalDate ?? null, daysToCritical: p.daysToCritical, slopePerYear: p.slopePerYear }))
    .sort((a, b) => a.daysToCritical - b.daysToCritical)
}
