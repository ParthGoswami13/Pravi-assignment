import { Asset, Activity, Counter, WorkOrder } from '../models/index.js'
import { ALLOWED_TRANSITIONS, ADMIN_ONLY_TARGETS, OPEN_WO_STATUSES } from '../constants.js'
import { computeHealth } from './health.service.js'
import { HttpError } from '../middleware/errors.js'

// Atomic sequence -> "BRG-0001", "WO-0001"
export async function nextCode(prefix, session) {
  const c = await Counter.findOneAndUpdate({ _id: prefix }, { $inc: { seq: 1 } }, { upsert: true, new: true, session })
  return `${prefix}-${String(c.seq).padStart(4, '0')}`
}

export async function logActivity({ asset, actor, action, message, meta = {} }, session) {
  await Activity.create([{ asset, actor, action, message, meta }], { session })
}

export async function recomputeHealth(assetOrId, session) {
  const asset = typeof assetOrId === 'object' && assetOrId.save ? assetOrId : await Asset.findById(assetOrId).session(session ?? null)
  if (!asset) return null
  const openRepairCount = await WorkOrder.countDocuments({
    asset: asset._id, type: 'REPAIR', status: { $in: OPEN_WO_STATUSES },
  }).session(session ?? null)
  asset.healthScore = computeHealth({ ...asset.toObject(), openRepairCount })
  await asset.save({ session })
  return asset
}

// Pure check used by the service and unit tests
export function validateTransition(from, to, role) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(422, `Cannot change status from ${from} to ${to}`, { allowed: ALLOWED_TRANSITIONS[from] ?? [] })
  }
  if (ADMIN_ONLY_TARGETS.includes(to) && role !== 'ADMIN') {
    throw new HttpError(403, `Only an admin can move an asset to ${to}`)
  }
}

// The ONLY place asset.status is changed.
export async function changeStatus({ asset, to, reason, user, session, extra = {} }) {
  const from = asset.status
  validateTransition(from, to, user?.role ?? 'ADMIN')
  if (to === 'RETIRED') {
    const open = await WorkOrder.countDocuments({ asset: asset._id, status: { $in: OPEN_WO_STATUSES } }).session(session ?? null)
    if (open > 0) throw new HttpError(422, `Close the ${open} open work order(s) before retiring this asset`)
  }
  if (from === 'PLANNED' && to === 'ACTIVE') {
    asset.installedOn = extra.installedOn ? new Date(extra.installedOn) : asset.installedOn ?? new Date()
  }
  asset.status = to
  await asset.save({ session })
  await logActivity(
    {
      asset: asset._id, actor: user?._id, action: 'STATUS_CHANGED',
      message: `Status changed from ${from} to ${to}${reason ? ` — ${reason}` : ''}`,
      meta: { from, to, reason, automatic: !!extra.automatic },
    },
    session,
  )
  await recomputeHealth(asset, session)
  return asset
}
