import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHealth, healthBand } from '../services/health.service.js'
import { validateTransition } from '../services/core.service.js'

const NOW = new Date('2026-09-28')

test('health: excellent new asset scores 100', () => {
  assert.equal(computeHealth({ status: 'ACTIVE', condition: 5, installedOn: new Date('2024-01-01'), usefulLifeYears: 15 }, NOW), 100)
})

test('health: condition 2 + inspection overdue = 25 (Riverfront Bridge case)', () => {
  assert.equal(computeHealth({ status: 'ACTIVE', condition: 2, nextInspectionDue: new Date('2026-08-24'), installedOn: new Date('1978-09-28'), usefulLifeYears: 75 }, NOW), 25)
})

test('health: beyond useful life and 2 open repairs', () => {
  assert.equal(computeHealth({ status: 'ACTIVE', condition: 4, installedOn: new Date('2000-01-01'), usefulLifeYears: 15, openRepairCount: 2 }, NOW), 40)
})

test('health: damaged is capped at 30, retired/planned are null', () => {
  assert.equal(computeHealth({ status: 'DAMAGED', condition: 5 }, NOW), 30)
  assert.equal(computeHealth({ status: 'RETIRED', condition: 5 }, NOW), null)
  assert.equal(computeHealth({ status: 'PLANNED', condition: 5 }, NOW), null)
})

test('health bands', () => {
  assert.equal(healthBand(70), 'GOOD')
  assert.equal(healthBand(40), 'FAIR')
  assert.equal(healthBand(39), 'POOR')
})

test('lifecycle: legal transitions pass', () => {
  assert.doesNotThrow(() => validateTransition('PLANNED', 'ACTIVE', 'ENGINEER'))
  assert.doesNotThrow(() => validateTransition('ACTIVE', 'DAMAGED', 'ENGINEER'))
  assert.doesNotThrow(() => validateTransition('ACTIVE', 'RETIRED', 'ADMIN'))
})

test('lifecycle: illegal transitions are rejected with 422', () => {
  assert.throws(() => validateTransition('PLANNED', 'RETIRED', 'ADMIN'), (e) => e.status === 422)
  assert.throws(() => validateTransition('RETIRED', 'ACTIVE', 'ADMIN'), (e) => e.status === 422)
  assert.throws(() => validateTransition('UNDER_MAINTENANCE', 'RETIRED', 'ADMIN'), (e) => e.status === 422)
})

test('lifecycle: only admin can retire', () => {
  assert.throws(() => validateTransition('ACTIVE', 'RETIRED', 'ENGINEER'), (e) => e.status === 403)
})

// ---------- Failure forecast ----------
import { predictCondition } from '../services/prediction.service.js'
import { computeImpact, createsCycle } from '../services/impact.service.js'

test('forecast: steady decline projects the date condition reaches 1', () => {
  const p = predictCondition([
    { date: '2026-01-01', condition: 4 },
    { date: '2026-04-01', condition: 3 }, // 90 days per point
    { date: '2026-06-30', condition: 2 },
  ], new Date('2026-07-01'))
  assert.equal(p.trend, 'DECLINING')
  assert.equal(p.criticalDate.toISOString().slice(0, 10), '2026-09-28')
  assert.equal(p.r2, 1)
})

test('forecast: flat history is stable, single point is insufficient, condition 1 is critical now', () => {
  assert.equal(predictCondition([{ date: '2025-01-01', condition: 4 }, { date: '2026-01-01', condition: 4 }]).trend, 'STABLE')
  assert.equal(predictCondition([{ date: '2026-01-01', condition: 4 }]).trend, 'INSUFFICIENT_DATA')
  assert.equal(predictCondition([{ date: '2025-01-01', condition: 2 }, { date: '2026-01-01', condition: 1 }]).trend, 'CRITICAL_NOW')
})

// ---------- Dependency impact ----------
test('impact: a damaged pillar impacts the lights it powers (not retired ones)', () => {
  const assets = [
    { _id: 'p', status: 'DAMAGED' }, { _id: 'l1', status: 'ACTIVE' }, { _id: 'l2', status: 'RETIRED' }, { _id: 'x', status: 'ACTIVE' },
  ]
  const rels = [{ source: 'p', target: 'l1', type: 'POWERS' }, { source: 'p', target: 'l2', type: 'POWERS' }]
  const { impacted, groups } = computeImpact(assets, rels)
  assert.deepEqual([...impacted.keys()], ['l1'])
  assert.equal(groups[0].affected.length, 1)
})

test('impact: cycle detection', () => {
  const rels = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }]
  assert.equal(createsCycle('c', 'a', rels), true)
  assert.equal(createsCycle('a', 'c', rels), false)
})
