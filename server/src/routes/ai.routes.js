// "Ask PRAVI" — natural-language assistant powered by Google Gemini with function calling.
// Gemini never sees the database directly and never invents numbers: it calls the READ-ONLY
// tools below, the server runs real MongoDB queries, and Gemini writes the answer from results.
import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { Asset, Inspection, WorkOrder, Relationship } from '../models/index.js'
import { auth } from '../middleware/auth.js'
import { ah, validate, HttpError } from '../middleware/errors.js'
import { CATEGORY_KEYS, STATUSES, WARD_NAMES, OPEN_WO_STATUSES, RELATIONSHIP_RULES } from '../constants.js'
import { predictCondition } from '../services/prediction.service.js'
import { loadImpact } from '../services/impact.service.js'
import { getForecast } from '../services/insights.service.js'

const router = Router()
const MAX_TOOL_ROUNDS = 5
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const enabled = () => !!process.env.GEMINI_API_KEY

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)

/* ------------------------------------------------------------------ */
/* Read-only tools the model may call                                  */
/* ------------------------------------------------------------------ */
const TOOL_DECLARATIONS = [
  {
    name: 'search_assets',
    description: 'Search and filter infrastructure assets. Returns matching assets (max 15) and the total count.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Free text matched against asset code, name or address' },
        category: { type: 'STRING', enum: CATEGORY_KEYS },
        status: { type: 'STRING', enum: STATUSES },
        ward: { type: 'STRING', enum: WARD_NAMES },
        health: { type: 'STRING', enum: ['GOOD', 'FAIR', 'POOR'], description: 'GOOD >= 70, FAIR 40-69, POOR < 40' },
        inspectionOverdue: { type: 'BOOLEAN', description: 'Only assets whose next inspection date has passed' },
        warrantyExpiringWithinDays: { type: 'INTEGER', description: 'Only assets whose warranty ends within N days' },
        sortBy: { type: 'STRING', enum: ['health_asc', 'health_desc', 'code', 'oldest_installed'] },
      },
    },
  },
  {
    name: 'get_asset_details',
    description: 'Full details of one asset by code (e.g. BRG-0001): condition, health, inspections, open work orders, failure forecast, dependencies.',
    parameters: { type: 'OBJECT', properties: { assetCode: { type: 'STRING' } }, required: ['assetCode'] },
  },
  {
    name: 'get_city_overview',
    description: 'City-wide KPIs: asset counts by status, category and ward, operational availability, overdue inspections, open work orders, average health, maintenance spend in the last 6 months.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_failure_forecast',
    description: 'Assets predicted (by linear regression on inspection history) to reach Critical condition within N days, soonest first.',
    parameters: { type: 'OBJECT', properties: { withinDays: { type: 'INTEGER', description: 'Default 365' } } },
  },
  {
    name: 'get_service_impact',
    description: 'Failed provider assets (feeder pillars, bridges, pumping stations) and the dependent assets that currently have no service.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'list_work_orders',
    description: 'List maintenance work orders (max 15).',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'OPEN_OR_IN_PROGRESS'] },
        priority: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        source: { type: 'STRING', enum: ['MANUAL', 'CITIZEN'], description: 'CITIZEN = raised from a public complaint' },
        assetCode: { type: 'STRING' },
      },
    },
  },
]

const slimAsset = (a) => ({
  _id: String(a._id), assetCode: a.assetCode, name: a.name, category: a.category, status: a.status,
  condition: a.condition, healthScore: a.healthScore, ward: a.ward,
  ...(a.nextInspectionDue ? { nextInspectionDue: day(a.nextInspectionDue) } : {}),
  ...(a.warrantyExpiry ? { warrantyExpiry: day(a.warrantyExpiry) } : {}),
})

const TOOLS = {
  async search_assets(args) {
    const f = {}
    if (args.text) {
      const rx = new RegExp(escapeRegex(String(args.text).slice(0, 80)), 'i')
      f.$or = [{ name: rx }, { assetCode: rx }, { address: rx }]
    }
    if (args.category) f.category = args.category
    if (args.status) f.status = args.status
    else f.status = { $ne: 'RETIRED' }
    if (args.ward) f.ward = args.ward
    if (args.health === 'GOOD') f.healthScore = { $gte: 70 }
    if (args.health === 'FAIR') f.healthScore = { $gte: 40, $lt: 70 }
    if (args.health === 'POOR') f.healthScore = { $lt: 40 }
    if (args.inspectionOverdue) { f.nextInspectionDue = { $lt: new Date() }; f.status = { $nin: ['RETIRED', 'PLANNED'] } }
    if (args.warrantyExpiringWithinDays) f.warrantyExpiry = { $gte: new Date(), $lte: new Date(Date.now() + args.warrantyExpiringWithinDays * 86400000) }
    const sort = { health_asc: { healthScore: 1 }, health_desc: { healthScore: -1 }, code: { assetCode: 1 }, oldest_installed: { installedOn: 1 } }[args.sortBy] ?? { healthScore: 1 }
    const [items, total] = await Promise.all([Asset.find(f).sort(sort).limit(15).lean(), Asset.countDocuments(f)])
    return { total, shown: items.length, assets: items.map(slimAsset) }
  },

  async get_asset_details({ assetCode }) {
    const a = await Asset.findOne({ assetCode: String(assetCode ?? '').toUpperCase().trim() }).lean()
    if (!a) return { error: `No asset with code ${assetCode}` }
    const [inspections, openWOs, providers, dependents, { impacted }] = await Promise.all([
      Inspection.find({ asset: a._id }).sort({ date: -1 }).lean(),
      WorkOrder.find({ asset: a._id, status: { $in: OPEN_WO_STATUSES } }).lean(),
      Relationship.find({ target: a._id }).populate('source', 'assetCode name status').lean(),
      Relationship.find({ source: a._id }).populate('target', 'assetCode name status').lean(),
      loadImpact(),
    ])
    const p = predictCondition(inspections)
    const up = impacted.get(String(a._id))
    return {
      ...slimAsset(a),
      address: a.address, installedOn: day(a.installedOn), usefulLifeYears: a.usefulLifeYears, cost: a.cost,
      lastInspectedAt: day(a.lastInspectedAt), specs: a.specs,
      recentInspections: inspections.slice(0, 3).map((i) => ({ date: day(i.date), condition: i.condition, notes: i.notes })),
      openWorkOrders: openWOs.map((w) => ({ woNumber: w.woNumber, title: w.title, status: w.status, priority: w.priority, dueDate: day(w.dueDate) })),
      forecast: { trend: p.trend, criticalDate: day(p.criticalDate), daysToCritical: p.daysToCritical, slopePerYear: p.slopePerYear, r2: p.r2, inspections: p.points },
      dependsOn: providers.filter((r) => r.source).map((r) => ({ relation: RELATIONSHIP_RULES[r.type].inverse, ...r.source, _id: String(r.source._id) })),
      supports: dependents.filter((r) => r.target).map((r) => ({ relation: RELATIONSHIP_RULES[r.type].label, ...r.target, _id: String(r.target._id) })),
      serviceAffectedBy: up ? { assetCode: up.assetCode, name: up.name, status: up.status } : null,
    }
  },

  async get_city_overview() {
    const now = new Date()
    const [byStatus, byCategory, byWard, overdue, openWOs, avg, spend] = await Promise.all([
      Asset.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Asset.aggregate([{ $match: { status: { $ne: 'RETIRED' } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
      Asset.aggregate([{ $match: { status: { $ne: 'RETIRED' } } }, { $group: { _id: '$ward', n: { $sum: 1 }, avgHealth: { $avg: '$healthScore' } } }]),
      Asset.countDocuments({ nextInspectionDue: { $lt: now }, status: { $nin: ['RETIRED', 'PLANNED'] } }),
      WorkOrder.countDocuments({ status: { $in: OPEN_WO_STATUSES } }),
      Asset.aggregate([{ $match: { healthScore: { $ne: null } } }, { $group: { _id: null, v: { $avg: '$healthScore' } } }]),
      WorkOrder.aggregate([{ $match: { status: 'COMPLETED', completedAt: { $gte: new Date(now.getTime() - 183 * 86400000) } } }, { $group: { _id: null, total: { $sum: '$cost' }, jobs: { $sum: 1 } } }]),
    ])
    const s = Object.fromEntries(byStatus.map((x) => [x._id, x.n]))
    const operational = (s.ACTIVE ?? 0) + (s.UNDER_MAINTENANCE ?? 0) + (s.DAMAGED ?? 0)
    return {
      assetsByStatus: s,
      assetsByCategory: Object.fromEntries(byCategory.map((x) => [x._id, x.n])),
      wards: byWard.map((w) => ({ ward: w._id, assets: w.n, avgHealth: Math.round(w.avgHealth ?? 0) })),
      operationalAvailabilityPct: operational ? Math.round(((s.ACTIVE ?? 0) / operational) * 1000) / 10 : 0,
      inspectionsOverdue: overdue,
      openWorkOrders: openWOs,
      averageHealth: Math.round(avg[0]?.v ?? 0),
      maintenanceSpendLast6MonthsINR: spend[0]?.total ?? 0,
      completedJobsLast6Months: spend[0]?.jobs ?? 0,
    }
  },

  async get_failure_forecast({ withinDays = 365 } = {}) {
    const items = await getForecast({ withinDays: Math.min(Math.max(Number(withinDays) || 365, 1), 3650) })
    return {
      total: items.length,
      assets: items.slice(0, 15).map((i) => ({ ...slimAsset(i.asset), trend: i.trend, predictedCriticalDate: day(i.criticalDate), daysToCritical: i.daysToCritical, declinePerYear: i.slopePerYear })),
    }
  },

  async get_service_impact() {
    const { groups, impacted } = await loadImpact()
    return {
      totalAssetsWithoutService: impacted.size,
      failures: groups.map((g) => ({ provider: slimAsset(g.provider), affected: g.affected.map((x) => ({ ...slimAsset(x), relation: x.via })) })),
    }
  },

  async list_work_orders(args) {
    const f = {}
    if (args.status === 'OPEN_OR_IN_PROGRESS') f.status = { $in: OPEN_WO_STATUSES }
    else if (args.status) f.status = args.status
    if (args.priority) f.priority = args.priority
    if (args.source) f.source = args.source
    if (args.assetCode) {
      const a = await Asset.findOne({ assetCode: String(args.assetCode).toUpperCase() }).select('_id').lean()
      if (!a) return { error: `No asset with code ${args.assetCode}` }
      f.asset = a._id
    }
    const [items, total] = await Promise.all([
      WorkOrder.find(f).sort({ createdAt: -1 }).limit(15).populate('asset', 'assetCode name status').populate('assignedTo', 'name').lean(),
      WorkOrder.countDocuments(f),
    ])
    return {
      total,
      workOrders: items.map((w) => ({
        woNumber: w.woNumber, title: w.title, status: w.status, priority: w.priority, type: w.type, source: w.source,
        asset: w.asset ? { _id: String(w.asset._id), assetCode: w.asset.assetCode, name: w.asset.name } : null,
        assignedTo: w.assignedTo?.name ?? null, dueDate: day(w.dueDate), completedAt: day(w.completedAt), cost: w.status === 'COMPLETED' ? w.cost : undefined,
      })),
    }
  },
}

/* ------------------------------------------------------------------ */
/* Gemini call                                                         */
/* ------------------------------------------------------------------ */
const systemPrompt = (user) => `You are "Ask PRAVI", the assistant inside PRAVI — the public infrastructure asset platform of Navpur Municipal Corporation (a fictional Indian city).
Today is ${new Date().toISOString().slice(0, 10)}. The user is ${user.name} (${user.role}).

Rules:
- ALWAYS use the tools to get data. Never invent assets, numbers or dates. If the tools return nothing, say so.
- Always mention asset codes exactly as written (e.g. BRG-0001, STL-0007) so the app can turn them into links.
- Be concise: a one-line answer first, then short bullet points. Use **bold** for key numbers. No tables, no headings.
- Money is in Indian Rupees; write amounts like ₹4,20,000.
- You are READ-ONLY. If asked to change data (retire, assign, edit), explain which button in PRAVI to use instead.
- Reply in the same language the user writes in (English or Hindi).

Domain: statuses PLANNED, ACTIVE, UNDER_MAINTENANCE, DAMAGED, RETIRED. Condition 1-5 (5 Excellent, 1 Critical).
Health score 0-100 = condition×20, −15 if inspection overdue, −20 if older than design life, −10 per open repair (max −30), capped at 30 if damaged. Bands: Good ≥70, Fair 40–69, Poor <40.
Failure forecast = linear regression of inspection condition over time, projected to condition 1.
Dependencies: feeder pillars power street lights/signals, bridges carry roads, pumping stations supply buildings; if a provider is DAMAGED or UNDER_MAINTENANCE its dependents have no service.`

async function callGemini(contents, user) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(user) }] },
      contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.error?.message ?? `Gemini request failed (${res.status})`
    console.error('Gemini error:', msg)
    throw new HttpError(502, res.status === 400 && /API key/i.test(msg) ? 'The Gemini API key is invalid. Check GEMINI_API_KEY in server/.env' : `AI service error: ${msg}`)
  }
  return data
}

// Collect every asset returned by tools so the UI can link codes mentioned in the answer
function collectAssets(value, out) {
  if (Array.isArray(value)) value.forEach((v) => collectAssets(v, out))
  else if (value && typeof value === 'object') {
    if (value.assetCode && value._id) out.set(value.assetCode, String(value._id))
    Object.values(value).forEach((v) => collectAssets(v, out))
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */
router.get('/ai/status', auth, (_req, res) => res.json({ enabled: enabled(), model: enabled() ? model() : null }))

const askLimiter = rateLimit({ windowMs: 60_000, limit: 15, keyGenerator: (req) => `user:${req.user._id}`, message: { error: 'Too many questions — wait a minute and try again' } })

const askSchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) })).max(10).default([]),
})

router.post('/ai/ask', auth, askLimiter, validate(askSchema), ah(async (req, res) => {
  if (!enabled()) throw new HttpError(503, 'Ask PRAVI is not configured. Add GEMINI_API_KEY to server/.env and restart the server.')
  const { message, history } = req.valid
  const contents = [
    ...history.filter((h) => h.text).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: message }] },
  ]
  const assets = new Map()
  const toolsUsed = []

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await callGemini(contents, req.user)
    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const calls = parts.filter((p) => p.functionCall)

    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      const answer = parts.map((p) => p.text ?? '').join('').trim()
        || (candidate?.finishReason === 'SAFETY' ? 'I can’t answer that question.' : 'I couldn’t find an answer — try rephrasing.')
      const mentioned = [...assets].filter(([code]) => answer.includes(code)).map(([assetCode, _id]) => ({ assetCode, _id }))
      return res.json({ answer, assets: mentioned, toolsUsed })
    }

    // Execute the requested read-only tools and send results back to the model
    contents.push({ role: 'model', parts })
    const responses = await Promise.all(calls.map(async ({ functionCall: { name, args } }) => {
      toolsUsed.push(name)
      let result
      try {
        result = TOOLS[name] ? await TOOLS[name](args ?? {}) : { error: `Unknown tool ${name}` }
      } catch (e) {
        result = { error: e.message }
      }
      collectAssets(result, assets)
      return { functionResponse: { name, response: { result } } }
    }))
    contents.push({ role: 'user', parts: responses })
  }
}))

export default router
export { TOOLS }
