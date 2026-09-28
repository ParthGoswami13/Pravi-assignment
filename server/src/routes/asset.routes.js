import { Router } from 'express'
import mongoose from 'mongoose'
import { Asset, Activity, Inspection, WorkOrder, Relationship } from '../models/index.js'
import { auth, requireRole } from '../middleware/auth.js'
import { ah, validate, HttpError } from '../middleware/errors.js'
import { assetCreateSchema, assetUpdateSchema, statusChangeSchema } from '../validators/schemas.js'
import { CATEGORIES, OPEN_WO_STATUSES } from '../constants.js'
import { changeStatus, logActivity, nextCode, recomputeHealth } from '../services/core.service.js'
import { dependentsOf, loadImpact } from '../services/impact.service.js'

const router = Router()
router.use('/assets', auth)
const canEdit = requireRole('ADMIN', 'ENGINEER')

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildFilter(q) {
  const filter = {}
  if (q.q) {
    const rx = new RegExp(escapeRegex(String(q.q).slice(0, 100)), 'i')
    filter.$or = [{ name: rx }, { assetCode: rx }, { address: rx }]
  }
  for (const key of ['category', 'status', 'ward']) {
    if (q[key]) filter[key] = { $in: String(q[key]).split(',') }
  }
  if (!q.status && q.includeRetired !== '1') filter.status = { $ne: 'RETIRED' }
  if (q.health === 'GOOD') filter.healthScore = { $gte: 70 }
  if (q.health === 'FAIR') filter.healthScore = { $gte: 40, $lt: 70 }
  if (q.health === 'POOR') filter.healthScore = { $lt: 40 }
  if (q.overdue === '1') {
    filter.nextInspectionDue = { $lt: new Date() }
    filter.status = { $nin: ['RETIRED', 'PLANNED'] }
  }
  return filter
}

const SORTS = {
  healthScore: { healthScore: 1, assetCode: 1 },
  '-healthScore': { healthScore: -1, assetCode: 1 },
  assetCode: { assetCode: 1 },
  name: { name: 1 },
  nextInspectionDue: { nextInspectionDue: 1 },
  '-updatedAt': { updatedAt: -1 },
}

router.get('/assets', ah(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
  const filter = buildFilter(req.query)
  const sort = SORTS[req.query.sort] ?? SORTS.healthScore
  // Assets without a health score (planned/retired) always sort last
  const [items, total] = await Promise.all([
    Asset.aggregate([
      { $match: filter },
      { $addFields: { _noHealth: { $cond: [{ $eq: [{ $ifNull: ['$healthScore', null] }, null] }, 1, 0] } } },
      { $sort: { _noHealth: 1, ...sort } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _noHealth: 0 } },
    ]),
    Asset.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
}))

router.get('/assets/export', ah(async (req, res) => {
  const items = await Asset.find(buildFilter(req.query)).sort({ assetCode: 1 }).limit(5000).lean()
  const cols = ['assetCode', 'name', 'category', 'status', 'condition', 'healthScore', 'ward', 'address', 'lat', 'lng', 'installedOn', 'cost', 'nextInspectionDue']
  const cell = (v) => {
    let s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    if (/^[=+\-@]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }
  const rows = items.map((a) => cols.map((c) => cell(c === 'lat' ? a.location?.lat : c === 'lng' ? a.location?.lng : a[c])).join(','))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="pravi-assets-${new Date().toISOString().slice(0, 10)}.csv"`)
  res.send('﻿' + [cols.join(','), ...rows].join('\n'))
}))

router.get('/assets/map', ah(async (req, res) => {
  const filter = buildFilter(req.query)
  const [items, { impacted }] = await Promise.all([
    Asset.find(filter).select('assetCode name category status healthScore location ward').lean(),
    loadImpact(),
  ])
  res.json({
    items: items.map((a) => {
      const p = impacted.get(String(a._id))
      return p ? { ...a, impactedBy: { assetCode: p.assetCode, name: p.name, status: p.status } } : a
    }),
  })
}))

router.get('/assets/attention', ah(async (_req, res) => {
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400000)
  const items = await Asset.find({
    status: { $nin: ['RETIRED', 'PLANNED'] },
    $or: [{ healthScore: { $lt: 40 } }, { nextInspectionDue: { $lt: now } }, { warrantyExpiry: { $gte: now, $lte: in30 } }],
  }).sort({ healthScore: 1 }).limit(10).lean()
  const withReasons = items.map((a) => {
    const reasons = []
    if (a.healthScore != null && a.healthScore < 40) reasons.push('Poor health')
    if (a.nextInspectionDue && a.nextInspectionDue < now) reasons.push(`Inspection overdue ${Math.ceil((now - a.nextInspectionDue) / 86400000)} d`)
    if (a.warrantyExpiry && a.warrantyExpiry >= now && a.warrantyExpiry <= in30) reasons.push(`Warranty ends in ${Math.ceil((a.warrantyExpiry - now) / 86400000)} d`)
    if (a.status === 'DAMAGED') reasons.unshift('Damaged')
    return { ...a, reasons }
  })
  res.json({ items: withReasons })
}))

router.get('/assets/:id', ah(async (req, res) => {
  const asset = await Asset.findById(req.params.id).populate('createdBy', 'name').lean()
  if (!asset) throw new HttpError(404, 'Asset not found')
  const openWorkOrders = await WorkOrder.countDocuments({ asset: asset._id, status: { $in: OPEN_WO_STATUSES } })
  res.json({ asset: { ...asset, openWorkOrders } })
}))

router.post('/assets', canEdit, validate(assetCreateSchema), ah(async (req, res) => {
  const data = req.valid
  const cat = CATEGORIES[data.category]
  const session = await mongoose.startSession()
  let asset
  await session.withTransaction(async () => {
    const assetCode = await nextCode(cat.prefix, session)
    const now = new Date()
    ;[asset] = await Asset.create([{
      ...data,
      assetCode,
      usefulLifeYears: data.usefulLifeYears ?? cat.usefulLifeYears,
      installedOn: data.installedOn ?? (data.status === 'ACTIVE' ? now : undefined),
      nextInspectionDue: data.status === 'ACTIVE' ? new Date(now.getTime() + cat.inspectionDays * 86400000) : undefined,
      createdBy: req.user._id,
    }], { session })
    await logActivity({ asset: asset._id, actor: req.user._id, action: 'ASSET_CREATED', message: `${assetCode} registered as ${data.status}` }, session)
    await recomputeHealth(asset, session)
  })
  await session.endSession()
  res.status(201).json({ asset })
}))

router.patch('/assets/:id', canEdit, validate(assetUpdateSchema), ah(async (req, res) => {
  const asset = await Asset.findById(req.params.id)
  if (!asset) throw new HttpError(404, 'Asset not found')
  if (asset.status === 'RETIRED') throw new HttpError(422, 'Retired assets cannot be edited')
  const changed = Object.keys(req.valid).filter((k) => JSON.stringify(asset[k]) !== JSON.stringify(req.valid[k]))
  Object.assign(asset, req.valid)
  await asset.save()
  if (changed.length) {
    await logActivity({ asset: asset._id, actor: req.user._id, action: 'ASSET_UPDATED', message: `Updated ${changed.join(', ')}`, meta: { fields: changed } })
  }
  await recomputeHealth(asset)
  res.json({ asset })
}))

router.post('/assets/:id/status', canEdit, validate(statusChangeSchema), ah(async (req, res) => {
  const { to, reason, installedOn, createWorkOrder } = req.valid
  const session = await mongoose.startSession()
  let asset, workOrder
  await session.withTransaction(async () => {
    asset = await Asset.findById(req.params.id).session(session)
    if (!asset) throw new HttpError(404, 'Asset not found')
    await changeStatus({ asset, to, reason, user: req.user, session, extra: { installedOn } })
    if (to === 'DAMAGED' && createWorkOrder !== false) {
      const woNumber = await nextCode('WO', session)
      ;[workOrder] = await WorkOrder.create([{
        woNumber, asset: asset._id, title: `Repair: ${asset.name}`, description: reason,
        type: 'REPAIR', priority: 'HIGH', dueDate: new Date(Date.now() + 3 * 86400000), createdBy: req.user._id,
      }], { session })
      await logActivity({ asset: asset._id, actor: req.user._id, action: 'WO_CREATED', message: `${woNumber} created automatically for damage report` }, session)
      await recomputeHealth(asset, session)
    }
  })
  await session.endSession()

  // Dependency impact: when a provider goes down, record it on every downstream asset
  let impact = []
  if (['DAMAGED', 'UNDER_MAINTENANCE'].includes(to)) {
    const rels = await Relationship.find().select('source target type').lean()
    const ids = dependentsOf(asset._id, rels).map((d) => d.id)
    impact = await Asset.find({ _id: { $in: ids }, status: { $ne: 'RETIRED' } }).select('assetCode name').lean()
    if (impact.length) {
      await Activity.insertMany(impact.map((d) => ({
        asset: d._id, actor: req.user._id, action: 'UPSTREAM_DOWN',
        message: `Service affected: upstream ${asset.assetCode} (${asset.name}) is ${to.replace('_', ' ').toLowerCase()}`,
      })))
      await logActivity({ asset: asset._id, actor: req.user._id, action: 'IMPACT', message: `${impact.length} dependent asset(s) affected: ${impact.map((d) => d.assetCode).join(', ')}` })
    }
  }
  res.json({ asset, workOrder: workOrder ?? null, impact: { count: impact.length, assets: impact } })
}))

router.get('/assets/:id/activity', ah(async (req, res) => {
  const items = await Activity.find({ asset: req.params.id }).sort({ createdAt: -1 }).limit(100).populate('actor', 'name role').lean()
  res.json({ items })
}))

router.get('/assets/:id/inspections', ah(async (req, res) => {
  const items = await Inspection.find({ asset: req.params.id }).sort({ date: -1 }).populate('inspector', 'name').lean()
  res.json({ items })
}))

export default router
