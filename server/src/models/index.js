import mongoose from 'mongoose'
import {
  ROLES, STATUSES, CATEGORY_KEYS, WARD_NAMES, WO_TYPES, WO_PRIORITIES, WO_STATUSES, RELATIONSHIP_TYPES,
} from '../constants.js'

const { Schema, model } = mongoose

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    designation: String,
  },
  { timestamps: true },
)
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    delete ret.__v
    return ret
  },
})

const assetSchema = new Schema(
  {
    assetCode: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    category: { type: String, enum: CATEGORY_KEYS, required: true },
    status: { type: String, enum: STATUSES, default: 'ACTIVE' },
    condition: { type: Number, min: 1, max: 5, default: 4 },
    ward: { type: String, enum: WARD_NAMES, required: true },
    address: { type: String, required: true, trim: true },
    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    installedOn: Date,
    usefulLifeYears: { type: Number, min: 1, max: 150 },
    cost: { type: Number, min: 0, default: 0 },
    warrantyExpiry: Date,
    specs: { type: Schema.Types.Mixed, default: {} },
    lastInspectedAt: Date,
    nextInspectionDue: Date,
    healthScore: { type: Number, min: 0, max: 100, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false },
)
assetSchema.index({ status: 1 })
assetSchema.index({ category: 1 })
assetSchema.index({ ward: 1 })
assetSchema.index({ healthScore: 1 })
assetSchema.index({ name: 'text', assetCode: 'text', address: 'text' })

const inspectionSchema = new Schema(
  {
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    inspector: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, required: true },
    condition: { type: Number, min: 1, max: 5, required: true },
    notes: { type: String, required: true },
    nextDueDate: { type: Date, required: true },
  },
  { timestamps: true },
)

const workOrderSchema = new Schema(
  {
    woNumber: { type: String, required: true, unique: true },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    type: { type: String, enum: WO_TYPES, default: 'REPAIR' },
    priority: { type: String, enum: WO_PRIORITIES, default: 'MEDIUM' },
    status: { type: String, enum: WO_STATUSES, default: 'OPEN', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    startedAt: Date,
    completedAt: Date,
    cost: { type: Number, min: 0, default: 0 },
    resolutionNotes: String,
    source: { type: String, enum: ['MANUAL', 'CITIZEN'], default: 'MANUAL' },
    reporterPhone: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// Append-only audit trail (no update/delete routes exist)
const activitySchema = new Schema({
  asset: { type: Schema.Types.ObjectId, ref: 'Asset', index: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  message: { type: String, required: true },
  meta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
})

// Dependency link: source provides service to target (e.g. feeder pillar POWERS street light)
const relationshipSchema = new Schema(
  {
    source: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    target: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    type: { type: String, enum: RELATIONSHIP_TYPES, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
relationshipSchema.index({ source: 1, target: 1, type: 1 }, { unique: true })

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } })

export const User = model('User', userSchema)
export const Asset = model('Asset', assetSchema)
export const Inspection = model('Inspection', inspectionSchema)
export const WorkOrder = model('WorkOrder', workOrderSchema)
export const Activity = model('Activity', activitySchema)
export const Counter = model('Counter', counterSchema)
export const Relationship = model('Relationship', relationshipSchema)
