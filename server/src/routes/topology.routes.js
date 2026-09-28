import { Router } from 'express'
import { z } from 'zod'
import { Asset, Inspection, Relationship } from '../models/index.js'
import { auth, requireRole } from '../middleware/auth.js'
import { ah, validate, HttpError } from '../middleware/errors.js'
import { DOWN_STATUSES, RELATIONSHIP_RULES, RELATIONSHIP_TYPES } from '../constants.js'
import { createsCycle, dependentsOf, loadImpact } from '../services/impact.service.js'
import { predictCondition } from '../services/prediction.service.js'
import { getForecast } from '../services/insights.service.js'
import { logActivity } from '../services/core.service.js'

const router = Router()
const canEdit = requireRole('ADMIN', 'ENGINEER')
const ASSET_FIELDS = 'assetCode name status category ward healthScore'

/* ---------- Dependencies ---------- */
router.get('/assets/:id/relationships', auth, ah(async (req, res) => {
  const asset = await Asset.findById(req.params.id).select(ASSET_FIELDS).lean()
  if (!asset) throw new HttpError(404, 'Asset not found')
  const [providers, dependents, allRels] = await Promise.all([
    Relationship.find({ target: asset._id }).populate('source', ASSET_FIELDS).lean(),
    Relationship.find({ source: asset._id }).populate('target', ASSET_FIELDS).lean(),
    Relationship.find().select('source target type').lean(),
  ])
  // Upstream problems: any provider (direct) that is currently down
  const upstreamDown = providers.filter((r) => r.source && DOWN_STATUSES.includes(r.source.status)).map((r) => r.source)
  // Downstream impact: if this asset is down, everything that depends on it (up to 3 hops)
  let downstreamImpact = []
  if (DOWN_STATUSES.includes(asset.status)) {
    const ids = dependentsOf(asset._id, allRels).map((d) => d.id)
    downstreamImpact = await Asset.find({ _id: { $in: ids }, status: { $ne: 'RETIRED' } }).select(ASSET_FIELDS).lean()
  }
  res.json({
    providers: providers.filter((r) => r.source).map((r) => ({ _id: r._id, type: r.type, asset: r.source })),
    dependents: dependents.filter((r) => r.target).map((r) => ({ _id: r._id, type: r.type, asset: r.target })),
    upstreamDown,
    downstreamImpact,
  })
}))

const relSchema = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1), type: z.enum(RELATIONSHIP_TYPES) })

router.post('/relationships', auth, canEdit, validate(relSchema), ah(async (req, res) => {
  const { sourceId, targetId, type } = req.valid
  const [source, target] = await Promise.all([Asset.findById(sourceId), Asset.findById(targetId)])
  if (!source || !target) throw new HttpError(404, 'Asset not found')
  const rule = RELATIONSHIP_RULES[type]
  if (!rule.source.includes(source.category) || !rule.target.includes(target.category)) {
    throw new HttpError(422, `A ${source.category.toLowerCase().replace('_', ' ')} cannot "${rule.label.toLowerCase()}" a ${target.category.toLowerCase().replace('_', ' ')}`)
  }
  if ([source.status, target.status].includes('RETIRED')) throw new HttpError(422, 'Cannot link retired assets')
  if (type === 'POWERS' && (await Relationship.exists({ target: target._id, type: 'POWERS' }))) {
    throw new HttpError(422, `${target.assetCode} already has a power source`)
  }
  const rels = await Relationship.find().select('source target type').lean()
  if (createsCycle(source._id, target._id, rels)) throw new HttpError(422, 'This link would create a circular dependency')
  const rel = await Relationship.create({ source: source._id, target: target._id, type, createdBy: req.user._id })
  const msg = `${source.assetCode} ${rule.label.toLowerCase()} ${target.assetCode}`
  await Promise.all([
    logActivity({ asset: source._id, actor: req.user._id, action: 'LINK_ADDED', message: `Dependency added: ${msg}` }),
    logActivity({ asset: target._id, actor: req.user._id, action: 'LINK_ADDED', message: `Dependency added: ${msg}` }),
  ])
  res.status(201).json({ relationship: rel })
}))

router.delete('/relationships/:id', auth, canEdit, ah(async (req, res) => {
  const rel = await Relationship.findByIdAndDelete(req.params.id).populate('source target', 'assetCode')
  if (!rel) throw new HttpError(404, 'Link not found')
  const msg = `Dependency removed: ${rel.source?.assetCode} ${RELATIONSHIP_RULES[rel.type].label.toLowerCase()} ${rel.target?.assetCode}`
  await Promise.all([rel.source, rel.target].filter(Boolean).map((a) => logActivity({ asset: a._id, actor: req.user._id, action: 'LINK_REMOVED', message: msg })))
  res.status(204).end()
}))

// City-wide service impact: failed providers and the assets they take down
router.get('/impact', auth, ah(async (_req, res) => {
  const { groups, impacted } = await loadImpact()
  res.json({ totalImpacted: impacted.size, groups })
}))

/* ---------- Condition forecast ---------- */
router.get('/assets/:id/prediction', auth, ah(async (req, res) => {
  const asset = await Asset.findById(req.params.id).select('status').lean()
  if (!asset) throw new HttpError(404, 'Asset not found')
  const inspections = await Inspection.find({ asset: asset._id }).select('date condition').lean()
  res.json({ prediction: predictCondition(inspections) })
}))

// Assets predicted to reach Critical within 12 months (or already critical)
router.get('/dashboard/forecast', auth, ah(async (_req, res) => {
  const items = await getForecast({ withinDays: 365 })
  res.json({ total: items.length, within90: items.filter((i) => i.daysToCritical <= 90).length, items: items.slice(0, 8) })
}))

export default router
