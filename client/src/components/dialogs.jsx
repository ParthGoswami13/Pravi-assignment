import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { ALLOWED_TRANSITIONS, STATUS, CONDITION } from '../lib/constants'
import { toInputDate } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { Button, Dialog, Field, Input, Select, Textarea } from './ui'

export function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    ['asset', 'assets', 'dashboard', 'workorders', 'activity', 'inspections', 'map', 'attention', 'relationships', 'prediction', 'forecast', 'impact']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export function StatusDialog({ asset, open, onClose }) {
  const { user } = useAuth()
  const invalidate = useInvalidate()
  const options = (ALLOWED_TRANSITIONS[asset.status] ?? []).filter((s) => s !== 'RETIRED' || user.role === 'ADMIN')
  const [to, setTo] = useState(options[0] ?? '')
  const [reason, setReason] = useState('')
  const [installedOn, setInstalledOn] = useState(toInputDate(new Date()))
  const [createWorkOrder, setCreateWorkOrder] = useState(true)
  const m = useMutation({
    mutationFn: () => api.post(`/assets/${asset._id}/status`, { to, reason, installedOn: to === 'ACTIVE' && asset.status === 'PLANNED' ? installedOn : undefined, createWorkOrder }),
    onSuccess: (d) => {
      const notes = [d.workOrder && `${d.workOrder.woNumber} created for the repair`, d.impact?.count && `${d.impact.count} dependent asset(s) affected`].filter(Boolean)
      toast.success(`${asset.assetCode} is now ${STATUS[to].label.toLowerCase()}`, { description: notes.join(' · ') || undefined })
      invalidate()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog
      open={open} onClose={onClose} title="Change status"
      description={`Current status: ${STATUS[asset.status].label}. Only valid next states are shown.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={to === 'RETIRED' ? 'danger' : 'primary'} loading={m.isPending} disabled={!to || reason.trim().length < 5} onClick={() => m.mutate()}>Confirm change</Button></>}
    >
      {options.length === 0 ? (
        <p className="text-sm text-ink-3">No further status changes are possible for this asset.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {options.map((s) => (
              <button
                key={s} type="button" onClick={() => setTo(s)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${to === s ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-line hover:bg-page'}`}
              >
                <span className="mr-2 inline-block size-2 rounded-full" style={{ background: STATUS[s].fg }} />{STATUS[s].label}
              </button>
            ))}
          </div>
          {to === 'ACTIVE' && asset.status === 'PLANNED' && (
            <Field label="Commissioned on"><Input type="date" value={installedOn} max={toInputDate(new Date())} onChange={(e) => setInstalledOn(e.target.value)} /></Field>
          )}
          <Field label="Reason" hint="Recorded in the asset's history (min 5 characters)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={to === 'DAMAGED' ? 'e.g. Lamp not working after storm; pole leaning' : 'Why is the status changing?'} />
          </Field>
          {to === 'DAMAGED' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand-600" checked={createWorkOrder} onChange={(e) => setCreateWorkOrder(e.target.checked)} />
              Create a high-priority repair work order automatically
            </label>
          )}
          {to === 'RETIRED' && <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">Retiring is permanent. History is preserved but the asset leaves all operational views.</p>}
        </div>
      )}
    </Dialog>
  )
}

export function InspectionDialog({ asset, open, onClose }) {
  const invalidate = useInvalidate()
  const [date, setDate] = useState(toInputDate(new Date()))
  const [condition, setCondition] = useState(asset.condition ?? 4)
  const [notes, setNotes] = useState('')
  const m = useMutation({
    mutationFn: () => api.post('/inspections', { assetId: asset._id, date, condition, notes }),
    onSuccess: (d) => {
      toast.success(`Inspection recorded · ${CONDITION[condition].label}`, { description: `Health is now ${d.asset.healthScore ?? '—'}` })
      invalidate()
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog
      open={open} onClose={onClose} title="Record inspection" description={`${asset.assetCode} · ${asset.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={notes.trim().length < 10} onClick={() => m.mutate()}>Save inspection</Button></>}
    >
      <div className="space-y-4">
        <Field label="Inspection date"><Input type="date" value={date} max={toInputDate(new Date())} onChange={(e) => setDate(e.target.value)} /></Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium">Condition</span>
          <div className="grid grid-cols-5 gap-1.5">
            {[5, 4, 3, 2, 1].map((c) => (
              <button
                key={c} type="button" onClick={() => setCondition(c)}
                className={`rounded-md border px-1 py-2 text-center text-xs font-medium transition-colors ${condition === c ? 'text-white' : 'border-line text-ink-2 hover:bg-page'}`}
                style={condition === c ? { background: CONDITION[c].color, borderColor: CONDITION[c].color } : undefined}
              >
                <span className="block text-base font-semibold">{c}</span>{CONDITION[c].label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Findings" hint="Min 10 characters. Next inspection date is set automatically from the asset category.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Minor spalling on pier 3, bearings OK, drainage clear." />
        </Field>
      </div>
    </Dialog>
  )
}

export function WorkOrderCreateDialog({ asset, open, onClose }) {
  const invalidate = useInvalidate()
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users'), enabled: open })
  const [form, setForm] = useState({ title: '', description: '', type: 'REPAIR', priority: 'MEDIUM', assignedTo: '', dueDate: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const m = useMutation({
    mutationFn: () => api.post('/workorders', { ...form, assetId: asset._id, assignedTo: form.assignedTo || null }),
    onSuccess: (d) => { toast.success(`${d.workOrder.woNumber} created`); invalidate(); onClose() },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog
      open={open} onClose={onClose} title="New work order" description={`${asset.assetCode} · ${asset.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={form.title.trim().length < 5} onClick={() => m.mutate()}>Create work order</Button></>}
    >
      <div className="space-y-4">
        <Field label="Title"><Input value={form.title} onChange={set('title')} placeholder="e.g. Replace damaged LED driver" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Select value={form.type} onChange={set('type')}><option value="REPAIR">Repair</option><option value="PREVENTIVE">Preventive</option></Select></Field>
          <Field label="Priority"><Select value={form.priority} onChange={set('priority')}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Assign to"><Select value={form.assignedTo} onChange={set('assignedTo')}><option value="">Unassigned</option>{users?.items.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</Select></Field>
          <Field label="Due date"><Input type="date" value={form.dueDate} min={toInputDate(new Date())} onChange={set('dueDate')} /></Field>
        </div>
        <Field label="Description (optional)"><Textarea value={form.description} onChange={set('description')} /></Field>
      </div>
    </Dialog>
  )
}

export function CompleteDialog({ workOrder, open, onClose }) {
  const invalidate = useInvalidate()
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const m = useMutation({
    mutationFn: () => api.post(`/workorders/${workOrder._id}/complete`, { cost: Number(cost), resolutionNotes: notes }),
    onSuccess: (d) => {
      toast.success(`${workOrder.woNumber} completed`, { description: d.asset.status === 'ACTIVE' ? `${d.asset.assetCode} is back in service` : undefined })
      invalidate(); onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog
      open={open} onClose={onClose} title={`Complete ${workOrder.woNumber}`} description={workOrder.title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={cost === '' || notes.trim().length < 5} onClick={() => m.mutate()}>Mark completed</Button></>}
    >
      <div className="space-y-4">
        <Field label="Total cost (₹)"><Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 3500" /></Field>
        <Field label="Resolution notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was done?" /></Field>
        <p className="text-xs text-ink-3">If no other work is in progress, the asset automatically returns to Active.</p>
      </div>
    </Dialog>
  )
}

export function useStartWorkOrder() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (wo) => api.post(`/workorders/${wo._id}/start`),
    onSuccess: (d) => {
      toast.success(`${d.workOrder.woNumber} started`, { description: d.asset.status === 'UNDER_MAINTENANCE' ? `${d.asset.assetCode} moved to under maintenance` : undefined })
      invalidate()
    },
    onError: (e) => toast.error(e.message),
  })
}
