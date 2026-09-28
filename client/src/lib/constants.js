import { Landmark, Lamp, Route, TrafficCone, Droplets, Building2, Zap } from 'lucide-react'

export const CATEGORIES = {
  BRIDGE: { label: 'Bridge', icon: Landmark, specs: [['structureType', 'Structure type'], ['spanLengthM', 'Span length (m)'], ['numberOfSpans', 'Number of spans']] },
  STREET_LIGHT: { label: 'Street Light', icon: Lamp, specs: [['lampType', 'Lamp type'], ['wattage', 'Wattage (W)'], ['poleHeightM', 'Pole height (m)']] },
  ROAD: { label: 'Road', icon: Route, specs: [['lengthKm', 'Length (km)'], ['lanes', 'Lanes'], ['surface', 'Surface']] },
  TRAFFIC_SIGNAL: { label: 'Traffic Signal', icon: TrafficCone, specs: [['signalHeads', 'Signal heads'], ['controller', 'Controller'], ['solarBackup', 'Solar backup']] },
  WATER_PUMP: { label: 'Water Pumping Station', icon: Droplets, specs: [['pumps', 'Pumps'], ['capacityMLD', 'Capacity (MLD)'], ['motorKW', 'Motor (kW)']] },
  PUBLIC_BUILDING: { label: 'Public Building', icon: Building2, specs: [['floors', 'Floors'], ['builtUpAreaSqm', 'Built-up area (m²)'], ['use', 'Use']] },
  FEEDER_PILLAR: { label: 'Feeder Pillar', icon: Zap, specs: [['capacityKVA', 'Capacity (kVA)'], ['circuits', 'Circuits'], ['meterNumber', 'Meter number']] },
}

// Mirrors server RELATIONSHIP_RULES: source provides service to target
export const RELATIONSHIP_RULES = {
  POWERS: { label: 'Powers', inverse: 'Powered by', source: ['FEEDER_PILLAR'], target: ['STREET_LIGHT', 'TRAFFIC_SIGNAL', 'WATER_PUMP'] },
  CARRIES: { label: 'Carries', inverse: 'Carried by', source: ['BRIDGE'], target: ['ROAD'] },
  SUPPLIES: { label: 'Supplies water to', inverse: 'Gets water from', source: ['WATER_PUMP'], target: ['PUBLIC_BUILDING'] },
}

export const STATUS = {
  PLANNED: { label: 'Planned', fg: 'var(--color-plan)', bg: 'var(--color-plan-bg)', pin: '#6b3fd4' },
  ACTIVE: { label: 'Active', fg: 'var(--color-ok)', bg: 'var(--color-ok-bg)', pin: '#1a9a4b' },
  UNDER_MAINTENANCE: { label: 'Under maintenance', fg: 'var(--color-warn)', bg: 'var(--color-warn-bg)', pin: '#e08a12' },
  DAMAGED: { label: 'Damaged', fg: 'var(--color-bad)', bg: 'var(--color-bad-bg)', pin: '#d4262e' },
  RETIRED: { label: 'Retired', fg: 'var(--color-ink-2)', bg: 'var(--color-subtle)', pin: '#8a93a3' },
}

// Mirrors server/src/constants.js ALLOWED_TRANSITIONS (server is the source of truth)
export const ALLOWED_TRANSITIONS = {
  PLANNED: ['ACTIVE'],
  ACTIVE: ['UNDER_MAINTENANCE', 'DAMAGED', 'RETIRED'],
  DAMAGED: ['UNDER_MAINTENANCE', 'ACTIVE', 'RETIRED'],
  UNDER_MAINTENANCE: ['ACTIVE', 'DAMAGED'],
  RETIRED: [],
}

export const CONDITION = {
  5: { label: 'Excellent', color: '#157f3c' },
  4: { label: 'Good', color: '#4d8a1f' },
  3: { label: 'Fair', color: '#b7791f' },
  2: { label: 'Poor', color: '#d9541e' },
  1: { label: 'Critical', color: '#c0262d' },
}

export const WARDS = ['Shivaji Nagar', 'Kalyan Park', 'Riverside', 'Old Market', 'Civic Centre', 'Station Road', 'Lake View', 'University Area']
export const WARD_CENTERS = {
  'Shivaji Nagar': [23.0525, 72.5594], 'Kalyan Park': [23.0525, 72.5834], Riverside: [22.9925, 72.5594], 'Old Market': [22.9925, 72.5834],
  'Civic Centre': [23.0345, 72.6064], 'Station Road': [23.0105, 72.6064], 'Lake View': [23.0345, 72.5364], 'University Area': [23.0105, 72.5364],
}
export const MAP_CENTER = [23.0225, 72.5714]

export const PRIORITY = {
  LOW: { fg: 'var(--color-ink-2)', bg: 'var(--color-subtle)' },
  MEDIUM: { fg: 'var(--color-info)', bg: 'var(--color-info-bg)' },
  HIGH: { fg: 'var(--color-warn)', bg: 'var(--color-warn-bg)' },
  CRITICAL: { fg: '#fff', bg: 'var(--color-bad)' },
}

export function healthBand(score) {
  if (score == null) return { label: '—', color: 'var(--color-ink-4)' }
  if (score >= 70) return { label: 'Good', color: 'var(--color-ok)' }
  if (score >= 40) return { label: 'Fair', color: '#b7791f' }
  return { label: 'Poor', color: 'var(--color-bad)' }
}
