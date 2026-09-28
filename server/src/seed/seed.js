// Deterministic demo data for "Navpur Municipal Corporation" (fictional).
// Run: npm run seed   (drops and recreates all PRAVI collections)
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { User, Asset, Inspection, WorkOrder, Activity, Counter, Relationship } from '../models/index.js'
import { CATEGORIES, WARDS } from '../constants.js'
import { computeHealth } from '../services/health.service.js'

// ---- deterministic PRNG (mulberry32) ----
let s = 20260928
const rand = () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const int = (a, b) => a + Math.floor(rand() * (b - a + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const DAY = 86400000
const NOW = new Date()
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY)
const yearsAgo = (y, extraDays = 0) => new Date(NOW.getFullYear() - y, NOW.getMonth(), NOW.getDate() - extraDays)
const round500 = (n) => Math.round(n / 500) * 500

// ---- status plan per category (index = code number - 1) ----
const A = 'ACTIVE', UM = 'UNDER_MAINTENANCE', D = 'DAMAGED', P = 'PLANNED', R = 'RETIRED'
const PLAN = {
  BRIDGE: [A, UM, A, A, D, A, A, P],
  FEEDER_PILLAR: [A, D, A, A], // placed before street lights: each pillar powers 6 lights
  STREET_LIGHT: [A, A, A, A, A, A, D, A, A, A, UM, A, A, A, D, A, A, A, A, A, D, A, R, R],
  ROAD: [A, A, A, UM, A, A, A, A, A, P],
  TRAFFIC_SIGNAL: [A, A, UM, A, A, D, A, A],
  WATER_PUMP: [A, UM, A, A, P],
  PUBLIC_BUILDING: [A, A, A, A, UM],
}

const NAMES = {
  FEEDER_PILLAR: ['Feeder Pillar – Shivaji Nagar Main', 'Feeder Pillar – Station Road', 'Feeder Pillar – Old Market', 'Feeder Pillar – Kalyan Park'],
  BRIDGE: ['Navpur Riverfront Bridge', 'Gandhi Chowk Flyover', 'Ambedkar Setu', 'Old Market Bridge', 'Canal Road Bridge', 'Lake View Footbridge', 'Railway Overbridge – Station Road', 'Kalindi Link Bridge'],
  ROAD: ['MG Road', 'Station Road', 'Tilak Marg', 'Nehru Marg', 'Lake View Road', 'University Road', 'Civic Centre Road', 'Riverside Drive', 'Old Market Road', 'Ring Road Sector 4'],
  TRAFFIC_SIGNAL: ['Signal – MG Road × Station Road', 'Signal – Tilak Marg × Nehru Marg', 'Signal – Civic Centre Circle', 'Signal – University Gate', 'Signal – Lake View Junction', 'Signal – Old Market Chowk', 'Signal – Riverside × Ring Road', 'Signal – Kalyan Park Crossing'],
  WATER_PUMP: ['Shivaji Nagar Pumping Station', 'Kalyan Park Pumping Station', 'Riverside Intake Pump House', 'Old Market Booster Station', 'University Area Pumping Station'],
  PUBLIC_BUILDING: ['Navpur Civic Centre', 'Ward Office – Station Road', 'Kalyan Park Community Hall', 'Riverside Urban Health Centre', 'Lake View Municipal School'],
}
const FDP_WARDS = ['Shivaji Nagar', 'Station Road', 'Old Market', 'Kalyan Park']
const STREETS = ['Station Road', 'MG Road', 'Tilak Marg', 'Nehru Marg', 'Lake View Road', 'University Road']

const COST = {
  FEEDER_PILLAR: [2_50_000, 6_00_000], BRIDGE: [2_00_00_000, 40_00_00_000], STREET_LIGHT: [18_000, 42_000], ROAD: [35_00_000, 3_20_00_000],
  TRAFFIC_SIGNAL: [8_00_000, 22_00_000], WATER_PUMP: [80_00_000, 4_50_00_000], PUBLIC_BUILDING: [1_50_00_000, 18_00_00_000],
}
const AGE = { FEEDER_PILLAR: [2, 18], BRIDGE: [5, 45], STREET_LIGHT: [1, 12], ROAD: [1, 15], TRAFFIC_SIGNAL: [1, 10], WATER_PUMP: [5, 25], PUBLIC_BUILDING: [5, 40] }
const WO_COST = { FEEDER_PILLAR: [8_000, 60_000], BRIDGE: [1_50_000, 8_00_000], STREET_LIGHT: [2_000, 12_000], ROAD: [50_000, 4_00_000], TRAFFIC_SIGNAL: [12_000, 90_000], WATER_PUMP: [40_000, 3_00_000], PUBLIC_BUILDING: [25_000, 2_50_000] }

function specsFor(cat) {
  switch (cat) {
    case 'FEEDER_PILLAR': return { capacityKVA: pick([63, 100, 160]), circuits: int(4, 8), meterNumber: `EM-${int(100000, 999999)}` }
    case 'BRIDGE': return { structureType: pick(['RCC', 'PSC', 'Steel']), spanLengthM: int(20, 60), numberOfSpans: int(2, 8) }
    case 'STREET_LIGHT': return { lampType: 'LED', wattage: pick([70, 90, 120]), poleHeightM: pick([7, 8, 9]) }
    case 'ROAD': return { lengthKm: Math.round((0.5 + rand() * 3) * 10) / 10, lanes: pick([2, 4, 6]), surface: pick(['Bitumen', 'Concrete']) }
    case 'TRAFFIC_SIGNAL': return { signalHeads: int(4, 12), controller: pick(['Fixed-time', 'Adaptive']), solarBackup: rand() > 0.5 }
    case 'WATER_PUMP': return { pumps: int(2, 6), capacityMLD: int(5, 40), motorKW: int(30, 200) }
    case 'PUBLIC_BUILDING': return { floors: int(1, 5), builtUpAreaSqm: int(600, 6000), use: pick(['Office', 'Community Hall', 'Health Centre', 'School']) }
    default: return {}
  }
}

// ---- hero assets (drive the demo story) ----
const HEROES = {
  'BRG-0001': { ward: 'Riverside', condition: 2, installedOn: yearsAgo(48), overdueDays: 35, cost: 4_20_00_000, specs: { structureType: 'PSC', spanLengthM: 38, numberOfSpans: 6, crossing: 'Kalindi River' } },
  'BRG-0002': { ward: 'Station Road', condition: 3, installedOn: yearsAgo(14), cost: 38_50_00_000 },
  'FDP-0002': { condition: 2, installedOn: yearsAgo(11), cost: 4_85_000 },
  'STL-0007': { name: 'LED Street Light – Station Road #7', ward: 'Station Road', condition: 1 },
  'WTR-0001': { ward: 'Shivaji Nagar', condition: 4, warrantyExpiry: new Date(NOW.getTime() + 20 * DAY) },
}
const OVERDUE = new Set(['BRG-0001', 'STL-0001', 'STL-0002', 'RDS-0001', 'TSG-0001', 'PBL-0001']) // exactly 6

async function main() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected. Clearing collections…')
  await Promise.all([User, Asset, Inspection, WorkOrder, Activity, Counter, Relationship].map((m) => m.deleteMany({})))
  await Promise.all([Asset, WorkOrder, Inspection, Activity, User, Relationship].map((m) => m.syncIndexes()))

  // Users
  const hash = await bcrypt.hash('Pravi@2026', 10)
  const users = await User.insertMany([
    { name: 'Meera Iyer', email: 'admin@navpur.gov.demo', role: 'ADMIN', designation: 'Executive Engineer (Admin)', passwordHash: hash },
    { name: 'Farhan Shaikh', email: 'engineer@navpur.gov.demo', role: 'ENGINEER', designation: 'Assistant Engineer, Roads & Bridges', passwordHash: hash },
    { name: 'Ananya Deshmukh', email: 'ananya@navpur.gov.demo', role: 'ENGINEER', designation: 'Assistant Engineer, Street Lighting', passwordHash: hash },
    { name: 'Vikram Solanki', email: 'vikram@navpur.gov.demo', role: 'ENGINEER', designation: 'Assistant Engineer, Traffic', passwordHash: hash },
    { name: 'Pooja Joshi', email: 'viewer@navpur.gov.demo', role: 'VIEWER', designation: 'Ward Councillor (read-only)', passwordHash: hash },
  ])
  const [admin, farhan, ananya, vikram] = users
  const engineers = [farhan, ananya, vikram]

  // Assets
  const assets = []
  let wardCursor = 0
  const pillarLocs = []
  for (const [cat, plan] of Object.entries(PLAN)) {
    const def = CATEGORIES[cat]
    plan.forEach((status, i) => {
      const code = `${def.prefix}-${String(i + 1).padStart(4, '0')}`
      const hero = HEROES[code] ?? {}
      // Place pillars in fixed wards and street lights next to the pillar that powers them
      let wardName, location
      if (cat === 'FEEDER_PILLAR') {
        wardName = FDP_WARDS[i]
      } else if (cat === 'STREET_LIGHT') {
        const pillar = pillarLocs[Math.floor(i / 6)]
        wardName = pillar.ward
        location = { lat: +(pillar.lat + (rand() - 0.5) * 0.005).toFixed(6), lng: +(pillar.lng + (rand() - 0.5) * 0.005).toFixed(6) }
      } else {
        wardName = hero.ward ?? WARDS[wardCursor++ % WARDS.length].name
      }
      const ward = WARDS.find((w) => w.name === wardName)
      location ??= { lat: +(ward.lat + (rand() - 0.5) * 0.012).toFixed(6), lng: +(ward.lng + (rand() - 0.5) * 0.012).toFixed(6) }
      if (cat === 'FEEDER_PILLAR') pillarLocs.push({ ward: wardName, ...location })
      const street = pick(STREETS)
      const name = hero.name ?? (cat === 'STREET_LIGHT' ? `LED Street Light – ${street} #${i + 1}` : cat === 'ROAD' ? `${NAMES.ROAD[i]} (${wardName})` : NAMES[cat][i])
      const installedOn = status === 'PLANNED' ? undefined : hero.installedOn ?? yearsAgo(int(...AGE[cat]), int(0, 300))
      let condition = hero.condition ?? (status === 'DAMAGED' ? pick([1, 2]) : pick([3, 4, 4, 4, 5, 5, 3, 2]))
      if (status === 'PLANNED') condition = 5
      assets.push({
        assetCode: code, name, category: cat, status, condition, ward: wardName,
        address: cat === 'STREET_LIGHT' ? `${street}, ${wardName}` : `${wardName}, Navpur`,
        location,
        installedOn, usefulLifeYears: def.usefulLifeYears,
        cost: hero.cost ?? round500(int(...COST[cat])),
        warrantyExpiry: hero.warrantyExpiry ?? (rand() > 0.7 && installedOn ? new Date(NOW.getTime() + int(60, 900) * DAY) : undefined),
        specs: hero.specs ?? specsFor(cat),
        createdBy: admin._id,
        createdAt: installedOn ?? daysAgo(int(10, 60)),
      })
    })
  }
  const inserted = await Asset.insertMany(assets)
  const byCode = Object.fromEntries(inserted.map((a) => [a.assetCode, a]))
  console.log(`Inserted ${inserted.length} assets`)

  // Inspections (+ due dates)
  const inspections = []
  const activities = inserted.map((a) => ({ asset: a._id, actor: admin._id, action: 'ASSET_CREATED', message: `${a.assetCode} registered`, createdAt: a.createdAt }))
  for (const a of inserted) {
    if (a.status === 'PLANNED') continue
    const interval = CATEGORIES[a.category].inspectionDays
    let last
    if (OVERDUE.has(a.assetCode)) last = daysAgo(interval + (HEROES[a.assetCode]?.overdueDays ?? int(5, 40)))
    else if (a.status === 'RETIRED') last = daysAgo(interval + 200)
    else last = daysAgo(int(5, Math.max(6, interval - 10)))
    const next = new Date(last.getTime() + interval * DAY)
    const insp = engineers[int(0, 2)]
    // Condition history (oldest -> latest) used by the failure forecast
    let history
    if (a.assetCode === 'BRG-0001') {
      history = [[daysAgo(1500), 5], [daysAgo(1000), 4], [daysAgo(500), 3], [last, 2]]
    } else {
      const c1 = Math.min(5, a.condition + pick([0, 0, 1, 1, 1]))
      const c0 = Math.min(5, c1 + pick([0, 1, 1]))
      history = [[new Date(last.getTime() - 2 * interval * DAY), c0], [new Date(last.getTime() - interval * DAY), c1], [last, a.condition]]
    }
    history.forEach(([date, condition], idx) => {
      const isLast = idx === history.length - 1
      inspections.push({
        asset: a._id, inspector: insp._id, date, condition,
        notes: condition <= 2 ? 'Significant deterioration found. Repair recommended at the earliest.' : condition === 3 ? 'Moderate wear observed. Monitor at next inspection.' : 'Routine inspection completed. Asset functioning normally.',
        nextDueDate: isLast ? next : history[idx + 1][0],
      })
    })
    a.lastInspectedAt = last
    a.nextInspectionDue = next
    activities.push({ asset: a._id, actor: insp._id, action: 'INSPECTION_RECORDED', message: `Inspection recorded: condition ${a.condition}`, createdAt: last })
  }
  await Inspection.insertMany(inspections)

  // Work orders: 6 in progress (one per UNDER_MAINTENANCE), 4 open (damaged), 20 completed
  const wos = []
  const um = inserted.filter((a) => a.status === 'UNDER_MAINTENANCE')
  for (const a of um) {
    const started = daysAgo(int(1, 8))
    const isFlyover = a.assetCode === 'BRG-0002'
    wos.push({
      asset: a._id, title: isFlyover ? 'Deck resurfacing & crash barrier repair' : `Scheduled overhaul – ${a.name}`.slice(0, 120),
      type: isFlyover ? 'REPAIR' : 'PREVENTIVE', priority: isFlyover ? 'HIGH' : 'MEDIUM', status: 'IN_PROGRESS',
      assignedTo: pick(engineers)._id, createdAt: new Date(started.getTime() - DAY), startedAt: started, dueDate: new Date(NOW.getTime() + int(3, 14) * DAY),
    })
  }
  const openTargets = [
    ['FDP-0002', 'Cable fault – feeder pillar tripped', 'MANUAL'],
    ['STL-0007', 'Lamp not working – citizen complaint', 'CITIZEN'],
    ['BRG-0005', 'Expansion joint damage – urgent repair', 'MANUAL'],
    ['STL-0015', 'Pole tilted after vehicle impact', 'MANUAL'],
    ['TSG-0006', 'Signal controller failure', 'MANUAL'],
  ]
  for (const [code, title, source] of openTargets) {
    const created = daysAgo(int(1, 4))
    wos.push({ asset: byCode[code]._id, title, type: 'REPAIR', priority: 'HIGH', status: 'OPEN', source, createdAt: created, dueDate: new Date(created.getTime() + 3 * DAY) })
  }
  const activeAssets = inserted.filter((a) => a.status === 'ACTIVE')
  for (let i = 0; i < 20; i++) {
    const a = activeAssets[int(0, activeAssets.length - 1)]
    const completedAt = daysAgo(int(3, 175))
    const startedAt = new Date(completedAt.getTime() - int(1, 3) * DAY)
    const type = rand() > 0.45 ? 'REPAIR' : 'PREVENTIVE'
    wos.push({
      asset: a._id, title: type === 'REPAIR' ? `Repair – ${a.name}`.slice(0, 120) : `Preventive maintenance – ${a.name}`.slice(0, 120),
      type, priority: pick(['LOW', 'MEDIUM', 'MEDIUM', 'HIGH']), status: 'COMPLETED', assignedTo: pick(engineers)._id,
      createdAt: new Date(startedAt.getTime() - DAY), startedAt, completedAt, dueDate: completedAt,
      cost: round500(int(...WO_COST[a.category])), resolutionNotes: 'Work completed and verified on site.',
    })
  }
  wos.sort((x, y) => x.createdAt - y.createdAt)
  wos.forEach((w, i) => { w.woNumber = `WO-${String(i + 1).padStart(4, '0')}`; w.createdBy = admin._id })
  await WorkOrder.insertMany(wos)
  const assetById = Object.fromEntries(inserted.map((a) => [String(a._id), a]))
  for (const w of wos) {
    const a = assetById[String(w.asset)]
    activities.push({ asset: w.asset, actor: w.createdBy, action: 'WO_CREATED', message: `${w.woNumber} created: ${w.title}`, createdAt: w.createdAt })
    if (w.completedAt) activities.push({ asset: w.asset, actor: w.assignedTo, action: 'WO_COMPLETED', message: `${w.woNumber} completed (₹${w.cost.toLocaleString('en-IN')})`, createdAt: w.completedAt })
    if (w.status === 'IN_PROGRESS') activities.push({ asset: w.asset, actor: w.assignedTo, action: 'STATUS_CHANGED', message: `Status changed from ACTIVE to UNDER_MAINTENANCE — Work order ${w.woNumber} started`, meta: { from: 'ACTIVE', to: 'UNDER_MAINTENANCE', automatic: true }, createdAt: w.startedAt })
    void a
  }
  for (const a of inserted.filter((x) => ['DAMAGED', 'RETIRED'].includes(x.status))) {
    activities.push({ asset: a._id, actor: admin._id, action: 'STATUS_CHANGED', message: `Status changed from ACTIVE to ${a.status} — ${a.status === 'RETIRED' ? 'End of service life, replaced by new LED fixture' : 'Damage reported during field visit'}`, meta: { from: 'ACTIVE', to: a.status }, createdAt: daysAgo(int(2, 20)) })
  }
  await Activity.insertMany(activities)

  // Dependencies: pillars power street lights, bridges carry roads, pumping stations supply buildings
  const rels = []
  for (let i = 1; i <= 24; i++) rels.push({ source: byCode[`FDP-${String(Math.ceil(i / 6)).padStart(4, '0')}`]._id, target: byCode[`STL-${String(i).padStart(4, '0')}`]._id, type: 'POWERS' })
  for (let i = 1; i <= 4; i++) rels.push({ source: byCode[`BRG-000${i}`]._id, target: byCode[`RDS-000${i}`]._id, type: 'CARRIES' })
  for (let i = 1; i <= 4; i++) rels.push({ source: byCode[`WTR-000${i}`]._id, target: byCode[`PBL-000${i}`]._id, type: 'SUPPLIES' })
  rels.push({ source: byCode['FDP-0003']._id, target: byCode['TSG-0002']._id, type: 'POWERS' })
  await Relationship.insertMany(rels.map((x) => ({ ...x, createdBy: admin._id })))

  // Health scores
  const openRepair = {}
  for (const w of wos) if (w.type === 'REPAIR' && ['OPEN', 'IN_PROGRESS'].includes(w.status)) openRepair[String(w.asset)] = (openRepair[String(w.asset)] ?? 0) + 1
  await Asset.bulkWrite(inserted.map((a) => ({
    updateOne: {
      filter: { _id: a._id },
      update: { $set: { lastInspectedAt: a.lastInspectedAt, nextInspectionDue: a.nextInspectionDue, healthScore: computeHealth({ ...a.toObject(), nextInspectionDue: a.nextInspectionDue, openRepairCount: openRepair[String(a._id)] ?? 0 }) } },
    },
  })))

  // Counters so new codes continue the sequence
  await Counter.insertMany([
    ...Object.entries(PLAN).map(([cat, plan]) => ({ _id: CATEGORIES[cat].prefix, seq: plan.length })),
    { _id: 'WO', seq: wos.length },
  ])

  // Report
  const final = await Asset.find().lean()
  const count = (fn) => final.filter(fn).length
  const act = count((a) => a.status === 'ACTIVE'), umC = count((a) => a.status === 'UNDER_MAINTENANCE'), dmg = count((a) => a.status === 'DAMAGED')
  console.log('\n=== PRAVI seed report ===')
  console.log('Total assets (non-retired):', count((a) => a.status !== 'RETIRED'))
  console.log('By status:', { ACTIVE: act, UNDER_MAINTENANCE: umC, DAMAGED: dmg, PLANNED: count((a) => a.status === 'PLANNED'), RETIRED: count((a) => a.status === 'RETIRED') })
  console.log('Operational %:', Math.round((act / (act + umC + dmg)) * 1000) / 10)
  console.log('Inspections overdue:', count((a) => a.nextInspectionDue && a.nextInspectionDue < new Date() && !['RETIRED', 'PLANNED'].includes(a.status)))
  console.log('Open work orders:', wos.filter((w) => w.status !== 'COMPLETED').length)
  console.log('BRG-0001 health:', final.find((a) => a.assetCode === 'BRG-0001').healthScore)
  console.log('Dependency links:', rels.length)
  console.log('\nLogins (password Pravi@2026): admin@navpur.gov.demo · engineer@navpur.gov.demo · viewer@navpur.gov.demo')
  await mongoose.disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await mongoose.disconnect()
  process.exit(1)
})
