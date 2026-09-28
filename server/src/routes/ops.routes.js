import { Router } from 'express'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import { Asset, Inspection, WorkOrder } from '../models/index.js'
import { auth, requireRole } from '../middleware/auth.js'
import { ah, validate, HttpError } from '../middleware/errors.js'
import { inspectionSchema, workOrderCreateSchema, workOrderCompleteSchema, publicReportSchema } from '../validators/schemas.js'
import { CATEGORIES, OPEN_WO_STATUSES } from '../constants.js'
import { changeStatus, logActivity, nextCode, recomputeHealth } from '../services/core.service.js'

const router = Router()
const canEdit = requireRole('ADMIN', 'ENGINEER')

async function inTx(fn) {
  const session = await mongoose.startSession()
  try {
    let out
    await session.withTransaction(async () => { out = await fn(session) })
    return out
  } finally {
    await session.endSession()
  }
}

/* ---------------- Inspections ---------------- */
router.post('/inspections', auth, canEdit, validate(inspectionSchema), ah(async (req, res) => {
  const { assetId, date, condition, notes, nextDueDate } = req.valid
  const result = await inTx(async (session) => {
    const asset = await Asset.findById(assetId).session(session)
    if (!asset) throw new HttpError(404, 'Asset not found')
    if (['RETIRED', 'PLANNED'].includes(asset.status)) throw new HttpError(422, `Cannot inspect an asset that is ${asset.status}`)
    const due = nextDueDate ?? new Date(date.getTime() + CATEGORIES[asset.category].inspectionDays * 86400000)
    const [inspection] = await Inspection.create([{ asset: asset._id, inspector: req.user._id, date, condition, notes, nextDueDate: due }], { session })
    const prev = asset.condition
    asset.condition = condition
    asset.lastInspectedAt = date
    asset.nextInspectionDue = due
    await asset.save({ session })
    await logActivity({
      asset: asset._id, actor: req.user._id, action: 'INSPECTION_RECORDED',
      message: `Inspection recorded: condition ${prev} → ${condition}. Next due ${due.toISOString().slice(0, 10)}`, meta: { condition, prev },
    }, session)
    await recomputeHealth(asset, session)
    return { inspection, asset }
  })
  res.status(201).json(result)
}))

/* ---------------- Work orders ---------------- */
router.get('/workorders', auth, ah(async (req, res) => {
  const filter = {}
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') }
  if (req.query.assetId) filter.asset = req.query.assetId
  if (req.query.mine === '1') filter.assignedTo = req.user._id
  const items = await WorkOrder.find(filter)
    .sort({ status: 1, dueDate: 1, createdAt: -1 })
    .limit(200)
    .populate('asset', 'assetCode name status category')
    .populate('assignedTo', 'name')
    .lean()
  res.json({ items })
}))

router.post('/workorders', auth, canEdit, validate(workOrderCreateSchema), ah(async (req, res) => {
  const { assetId, assignedTo, ...rest } = req.valid
  const wo = await inTx(async (session) => {
    const asset = await Asset.findById(assetId).session(session)
    if (!asset) throw new HttpError(404, 'Asset not found')
    if (asset.status === 'RETIRED') throw new HttpError(422, 'Cannot create work orders for a retired asset')
    const woNumber = await nextCode('WO', session)
    const [created] = await WorkOrder.create([{ ...rest, woNumber, asset: asset._id, assignedTo: assignedTo || undefined, createdBy: req.user._id }], { session })
    await logActivity({ asset: asset._id, actor: req.user._id, action: 'WO_CREATED', message: `${woNumber} created: ${rest.title}` }, session)
    await recomputeHealth(asset, session)
    return created
  })
  res.status(201).json({ workOrder: wo })
}))

router.post('/workorders/:id/start', auth, canEdit, ah(async (req, res) => {
  const result = await inTx(async (session) => {
    const wo = await WorkOrder.findById(req.params.id).session(session)
    if (!wo) throw new HttpError(404, 'Work order not found')
    if (wo.status !== 'OPEN') throw new HttpError(422, `Work order is already ${wo.status}`)
    wo.status = 'IN_PROGRESS'
    wo.startedAt = new Date()
    if (!wo.assignedTo) wo.assignedTo = req.user._id
    await wo.save({ session })
    const asset = await Asset.findById(wo.asset).session(session)
    await logActivity({ asset: asset._id, actor: req.user._id, action: 'WO_STARTED', message: `${wo.woNumber} started` }, session)
    if (['ACTIVE', 'DAMAGED'].includes(asset.status)) {
      await changeStatus({ asset, to: 'UNDER_MAINTENANCE', reason: `Work order ${wo.woNumber} started`, user: req.user, session, extra: { automatic: true } })
    }
    return { workOrder: wo, asset }
  })
  res.json(result)
}))

router.post('/workorders/:id/complete', auth, canEdit, validate(workOrderCompleteSchema), ah(async (req, res) => {
  const result = await inTx(async (session) => {
    const wo = await WorkOrder.findById(req.params.id).session(session)
    if (!wo) throw new HttpError(404, 'Work order not found')
    if (wo.status !== 'IN_PROGRESS') throw new HttpError(422, 'Only in-progress work orders can be completed')
    Object.assign(wo, { status: 'COMPLETED', completedAt: new Date(), cost: req.valid.cost, resolutionNotes: req.valid.resolutionNotes })
    await wo.save({ session })
    const asset = await Asset.findById(wo.asset).session(session)
    await logActivity({
      asset: asset._id, actor: req.user._id, action: 'WO_COMPLETED',
      message: `${wo.woNumber} completed (₹${req.valid.cost.toLocaleString('en-IN')})`, meta: { cost: req.valid.cost },
    }, session)
    const stillInProgress = await WorkOrder.countDocuments({ asset: asset._id, status: 'IN_PROGRESS' }).session(session)
    if (asset.status === 'UNDER_MAINTENANCE' && stillInProgress === 0) {
      await changeStatus({ asset, to: 'ACTIVE', reason: `Work order ${wo.woNumber} completed`, user: req.user, session, extra: { automatic: true } })
    } else {
      await recomputeHealth(asset, session)
    }
    return { workOrder: wo, asset }
  })
  res.json(result)
}))

/* ---------------- Dashboard ---------------- */
router.get('/dashboard', auth, ah(async (_req, res) => {
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const [facet] = await Asset.aggregate([
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byCategory: [{ $match: { status: { $ne: 'RETIRED' } } }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        byWard: [{ $match: { status: { $ne: 'RETIRED' } } }, { $group: { _id: '$ward', count: { $sum: 1 }, avgHealth: { $avg: '$healthScore' } } }, { $sort: { _id: 1 } }],
        avgHealth: [{ $match: { healthScore: { $ne: null } } }, { $group: { _id: null, v: { $avg: '$healthScore' } } }],
        overdue: [{ $match: { nextInspectionDue: { $lt: now }, status: { $nin: ['RETIRED', 'PLANNED'] } } }, { $count: 'n' }],
      },
    },
  ])
  const [openWorkOrders, costByMonth] = await Promise.all([
    WorkOrder.countDocuments({ status: { $in: OPEN_WO_STATUSES } }),
    WorkOrder.aggregate([
      { $match: { status: 'COMPLETED', completedAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$completedAt', timezone: 'Asia/Kolkata' } }, cost: { $sum: '$cost' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ])
  const s = Object.fromEntries(facet.byStatus.map((x) => [x._id, x.count]))
  const operational = (s.ACTIVE ?? 0) + (s.UNDER_MAINTENANCE ?? 0) + (s.DAMAGED ?? 0)
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const hit = costByMonth.find((m) => m._id === key)
    months.push({ month: d.toLocaleString('en-IN', { month: 'short' }), cost: hit?.cost ?? 0, count: hit?.count ?? 0 })
  }
  res.json({
    kpis: {
      totalAssets: Object.entries(s).filter(([k]) => k !== 'RETIRED').reduce((a, [, v]) => a + v, 0),
      operationalPct: operational ? Math.round(((s.ACTIVE ?? 0) / operational) * 1000) / 10 : 0,
      damaged: s.DAMAGED ?? 0,
      underMaintenance: s.UNDER_MAINTENANCE ?? 0,
      inspectionsOverdue: facet.overdue[0]?.n ?? 0,
      openWorkOrders,
      avgHealth: Math.round(facet.avgHealth[0]?.v ?? 0),
    },
    byStatus: facet.byStatus.map((x) => ({ status: x._id, count: x.count })),
    byCategory: facet.byCategory.map((x) => ({ category: x._id, count: x.count })),
    byWard: facet.byWard.map((x) => ({ ward: x._id, count: x.count, avgHealth: Math.round(x.avgHealth ?? 0) })),
    costByMonth: months,
  })
}))

/* ---------------- Public citizen report ---------------- */
const reportLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, message: { error: 'Too many reports, please try again later' } })

router.get('/public/assets/:code', ah(async (req, res) => {
  const asset = await Asset.findOne({ assetCode: req.params.code.toUpperCase(), status: { $ne: 'RETIRED' } }).select('assetCode name category ward address status').lean()
  if (!asset) throw new HttpError(404, 'No active asset with this code')
  res.json({ asset })
}))

router.post('/public/report', reportLimiter, validate(publicReportSchema), ah(async (req, res) => {
  const { assetCode, description, reporterPhone } = req.valid
  const wo = await inTx(async (session) => {
    const asset = await Asset.findOne({ assetCode }).session(session)
    if (!asset || asset.status === 'RETIRED') throw new HttpError(404, 'No active asset with this code')
    const woNumber = await nextCode('WO', session)
    const [created] = await WorkOrder.create([{
      woNumber, asset: asset._id, title: `Citizen complaint: ${asset.name}`.slice(0, 120), description,
      type: 'REPAIR', priority: 'HIGH', source: 'CITIZEN', reporterPhone: reporterPhone || undefined,
      dueDate: new Date(Date.now() + 3 * 86400000),
    }], { session })
    await logActivity({ asset: asset._id, action: 'WO_CREATED', message: `${woNumber} created from citizen complaint` }, session)
    await recomputeHealth(asset, session)
    return created
  })
  res.status(201).json({ trackingNumber: wo.woNumber })
}))

export default router
