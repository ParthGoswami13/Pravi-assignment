import { z } from 'zod'
import { CATEGORY_KEYS, STATUSES, WARD_NAMES, WO_PRIORITIES, WO_TYPES } from '../constants.js'

const optionalDate = z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((v) => (v === '' ? null : v))

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const assetBase = {
  name: z.string().trim().min(3).max(120),
  ward: z.enum(WARD_NAMES),
  address: z.string().trim().min(3).max(200),
  location: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }),
  condition: z.coerce.number().int().min(1).max(5).optional(),
  installedOn: optionalDate,
  usefulLifeYears: z.coerce.number().int().min(1).max(150).optional(),
  cost: z.coerce.number().min(0).optional(),
  warrantyExpiry: optionalDate,
  specs: z.record(z.any()).optional(),
}

export const assetCreateSchema = z.object({
  ...assetBase,
  category: z.enum(CATEGORY_KEYS),
  status: z.enum(['PLANNED', 'ACTIVE']).default('ACTIVE'),
})

export const assetUpdateSchema = z.object(assetBase).partial().strict()

export const statusChangeSchema = z.object({
  to: z.enum(STATUSES),
  reason: z.string().trim().min(5, 'Please give a reason (min 5 characters)'),
  installedOn: optionalDate,
  createWorkOrder: z.boolean().optional(),
})

export const inspectionSchema = z.object({
  assetId: z.string().min(1),
  date: z.coerce.date().refine((d) => d <= new Date(Date.now() + 60_000), 'Inspection date cannot be in the future'),
  condition: z.coerce.number().int().min(1).max(5),
  notes: z.string().trim().min(10, 'Notes must be at least 10 characters'),
  nextDueDate: optionalDate,
})

export const workOrderCreateSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(WO_TYPES).default('REPAIR'),
  priority: z.enum(WO_PRIORITIES).default('MEDIUM'),
  assignedTo: z.string().optional().nullable(),
  dueDate: optionalDate,
})

export const workOrderCompleteSchema = z.object({
  cost: z.coerce.number().min(0),
  resolutionNotes: z.string().trim().min(5),
})

export const publicReportSchema = z.object({
  assetCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}-\d{4}$/, 'Asset code looks like STL-0007'),
  description: z.string().trim().min(10).max(1000),
  reporterPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional().or(z.literal('')),
})
