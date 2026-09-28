// Pure health score calculation (unit tested in tests/health.test.js)
//   score = condition x 20
//   -15 if inspection overdue, -20 if older than useful life,
//   -10 per open repair work order (max -30), capped at 30 when DAMAGED.
//   RETIRED / PLANNED -> null
export function computeHealth({ status, condition, nextInspectionDue, installedOn, usefulLifeYears, openRepairCount = 0 }, now = new Date()) {
  if (status === 'RETIRED' || status === 'PLANNED') return null
  let score = (condition ?? 3) * 20
  if (nextInspectionDue && new Date(nextInspectionDue) < now) score -= 15
  if (installedOn && usefulLifeYears) {
    const ageYears = (now - new Date(installedOn)) / (365.25 * 24 * 3600 * 1000)
    if (ageYears > usefulLifeYears) score -= 20
  }
  score -= Math.min(30, openRepairCount * 10)
  if (status === 'DAMAGED') score = Math.min(score, 30)
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function healthBand(score) {
  if (score == null) return null
  if (score >= 70) return 'GOOD'
  if (score >= 40) return 'FAIR'
  return 'POOR'
}

export function isInspectionOverdue(asset, now = new Date()) {
  return !!asset.nextInspectionDue && new Date(asset.nextInspectionDue) < now && !['RETIRED', 'PLANNED'].includes(asset.status)
}
