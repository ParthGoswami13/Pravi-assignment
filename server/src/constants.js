export const ROLES = ['ADMIN', 'ENGINEER', 'VIEWER']

export const STATUSES = ['PLANNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'DAMAGED', 'RETIRED']

// Lifecycle state machine: from -> allowed next statuses
export const ALLOWED_TRANSITIONS = {
  PLANNED: ['ACTIVE'],
  ACTIVE: ['UNDER_MAINTENANCE', 'DAMAGED', 'RETIRED'],
  DAMAGED: ['UNDER_MAINTENANCE', 'ACTIVE', 'RETIRED'],
  UNDER_MAINTENANCE: ['ACTIVE', 'DAMAGED'],
  RETIRED: [],
}

// Transitions only ADMIN may perform
export const ADMIN_ONLY_TARGETS = ['RETIRED']

export const CATEGORIES = {
  BRIDGE: { prefix: 'BRG', label: 'Bridge', usefulLifeYears: 75, inspectionDays: 180 },
  STREET_LIGHT: { prefix: 'STL', label: 'Street Light', usefulLifeYears: 15, inspectionDays: 90 },
  ROAD: { prefix: 'RDS', label: 'Road', usefulLifeYears: 20, inspectionDays: 180 },
  TRAFFIC_SIGNAL: { prefix: 'TSG', label: 'Traffic Signal', usefulLifeYears: 12, inspectionDays: 60 },
  WATER_PUMP: { prefix: 'WTR', label: 'Water Pumping Station', usefulLifeYears: 30, inspectionDays: 90 },
  PUBLIC_BUILDING: { prefix: 'PBL', label: 'Public Building', usefulLifeYears: 60, inspectionDays: 365 },
  FEEDER_PILLAR: { prefix: 'FDP', label: 'Feeder Pillar', usefulLifeYears: 25, inspectionDays: 90 },
}
export const CATEGORY_KEYS = Object.keys(CATEGORIES)

export const WARDS = [
  { name: 'Shivaji Nagar', lat: 23.0525, lng: 72.5594 },
  { name: 'Kalyan Park', lat: 23.0525, lng: 72.5834 },
  { name: 'Riverside', lat: 22.9925, lng: 72.5594 },
  { name: 'Old Market', lat: 22.9925, lng: 72.5834 },
  { name: 'Civic Centre', lat: 23.0345, lng: 72.6064 },
  { name: 'Station Road', lat: 23.0105, lng: 72.6064 },
  { name: 'Lake View', lat: 23.0345, lng: 72.5364 },
  { name: 'University Area', lat: 23.0105, lng: 72.5364 },
]
export const WARD_NAMES = WARDS.map((w) => w.name)

export const WO_TYPES = ['PREVENTIVE', 'REPAIR']
export const WO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const WO_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED']
export const OPEN_WO_STATUSES = ['OPEN', 'IN_PROGRESS']

// Statuses that mean an asset is not delivering service (its dependents are impacted)
export const DOWN_STATUSES = ['DAMAGED', 'UNDER_MAINTENANCE']

// Dependency links: source provides service to target
export const RELATIONSHIP_RULES = {
  POWERS: { label: 'Powers', inverse: 'Powered by', source: ['FEEDER_PILLAR'], target: ['STREET_LIGHT', 'TRAFFIC_SIGNAL', 'WATER_PUMP'] },
  CARRIES: { label: 'Carries', inverse: 'Carried by', source: ['BRIDGE'], target: ['ROAD'] },
  SUPPLIES: { label: 'Supplies water to', inverse: 'Gets water from', source: ['WATER_PUMP'], target: ['PUBLIC_BUILDING'] },
}
export const RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_RULES)
