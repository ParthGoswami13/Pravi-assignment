import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { CATEGORIES, CONDITION, WARDS, WARD_CENTERS } from '../lib/constants'
import { toInputDate } from '../lib/format'
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from '../components/ui'

const EMPTY = { category: '', name: '', status: 'ACTIVE', ward: '', address: '', lat: '', lng: '', installedOn: '', cost: '', warrantyExpiry: '', condition: 4, specs: {} }

function Section({ title, description, children }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-line p-5 last:border-0 lg:grid-cols-[240px_1fr] lg:gap-8">
      <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-ink-3">{description}</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  )
}

export default function AssetForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const existing = useQuery({ queryKey: ['asset', id], queryFn: () => api.get(`/assets/${id}`), enabled: isEdit })

  useEffect(() => {
    const a = existing.data?.asset
    if (a) setForm({ ...EMPTY, ...a, lat: a.location.lat, lng: a.location.lng, installedOn: toInputDate(a.installedOn), warrantyExpiry: toInputDate(a.warrantyExpiry), cost: a.cost ?? '', specs: a.specs ?? {} })
  }, [existing.data])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setSpec = (k) => (e) => setForm((f) => ({ ...f, specs: { ...f.specs, [k]: e.target.value } }))

  const pickWard = (ward) => {
    const c = WARD_CENTERS[ward]
    setForm((f) => ({ ...f, ward, ...(c && !f.lat && !f.lng ? { lat: (c[0] + (Math.random() - 0.5) * 0.004).toFixed(6), lng: (c[1] + (Math.random() - 0.5) * 0.004).toFixed(6) } : {}) }))
  }

  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, ward: form.ward, address: form.address,
        location: { lat: Number(form.lat), lng: Number(form.lng) },
        condition: Number(form.condition), installedOn: form.installedOn || null,
        cost: form.cost === '' ? undefined : Number(form.cost), warrantyExpiry: form.warrantyExpiry || null,
        specs: Object.fromEntries(Object.entries(form.specs).filter(([, v]) => v !== '' && v != null)),
      }
      return isEdit ? api.patch(`/assets/${id}`, body) : api.post('/assets', { ...body, category: form.category, status: form.status })
    },
    onSuccess: (d) => {
      toast.success(isEdit ? 'Changes saved' : `${d.asset.assetCode} registered`)
      qc.invalidateQueries()
      navigate(`/assets/${d.asset._id}`)
    },
    onError: (e) => {
      const map = {}
      e.details?.forEach?.((x) => { map[x.path?.split('.').pop()] = x.message })
      setErrors(map)
      toast.error(e.message)
    },
  })

  if (isEdit && existing.isLoading) return <Skeleton className="h-96" />
  const cat = CATEGORIES[form.category]

  return (
    <>
      <PageHeader title={isEdit ? `Edit ${existing.data?.asset.assetCode}` : 'Register asset'} description={isEdit ? 'Status is changed from the asset page, not here.' : 'The asset code is generated automatically when you save.'} />
      <form onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <Card>
          {!isEdit && (
            <div className="border-b border-line p-5">
              <h2 className="text-sm font-semibold">Asset type</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, category: k, specs: {} }))}
                    className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-center text-[13px] font-medium transition-colors ${form.category === k ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/20' : 'border-line text-ink-2 hover:bg-page'}`}>
                    <c.icon className="size-5" strokeWidth={1.75} />{c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(isEdit || form.category) && <>
            <Section title="Identity" description="What the asset is called and its starting state.">
              <Field label="Name" error={errors.name} className="sm:col-span-2"><Input required minLength={3} value={form.name} onChange={set('name')} placeholder={form.category === 'STREET_LIGHT' ? 'LED Street Light – MG Road #12' : 'e.g. Kalindi Link Bridge'} /></Field>
              {!isEdit && (
                <Field label="Initial status" hint="Use Active for existing infrastructure being onboarded.">
                  <Select value={form.status} onChange={set('status')}><option value="ACTIVE">Active (already in service)</option><option value="PLANNED">Planned (not built yet)</option></Select>
                </Field>
              )}
              <Field label="Condition">
                <Select value={form.condition} onChange={set('condition')}>{[5, 4, 3, 2, 1].map((c) => <option key={c} value={c}>{c} – {CONDITION[c].label}</option>)}</Select>
              </Field>
            </Section>
            <Section title="Location" description="Ward and coordinates place the asset on the city map.">
              <Field label="Ward" error={errors.ward}><Select required value={form.ward} onChange={(e) => pickWard(e.target.value)}><option value="">Select ward</option>{WARDS.map((w) => <option key={w}>{w}</option>)}</Select></Field>
              <Field label="Address" error={errors.address}><Input required value={form.address} onChange={set('address')} placeholder="Street, landmark" /></Field>
              <Field label="Latitude" error={errors.lat} hint="Auto-filled near the ward centre"><Input required type="number" step="any" min={-90} max={90} value={form.lat} onChange={set('lat')} /></Field>
              <Field label="Longitude" error={errors.lng}><Input required type="number" step="any" min={-180} max={180} value={form.lng} onChange={set('lng')} /></Field>
            </Section>
            <Section title="Lifecycle & finance" description="Used for age, warranty alerts and the health score.">
              <Field label="Installed / commissioned on"><Input type="date" max={toInputDate(new Date())} value={form.installedOn} onChange={set('installedOn')} /></Field>
              <Field label="Acquisition cost (₹)" error={errors.cost}><Input type="number" min="0" value={form.cost} onChange={set('cost')} /></Field>
              <Field label="Warranty expiry"><Input type="date" value={form.warrantyExpiry} onChange={set('warrantyExpiry')} /></Field>
            </Section>
            {cat && (
              <Section title="Specifications" description={`Technical details for ${cat.label.toLowerCase()}s.`}>
                {cat.specs.map(([k, label]) => <Field key={k} label={label}><Input value={form.specs[k] ?? ''} onChange={setSpec(k)} /></Field>)}
              </Section>
            )}
          </>}
          <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-lg border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" loading={m.isPending} disabled={!isEdit && !form.category}>{isEdit ? 'Save changes' : 'Register asset'}</Button>
          </div>
        </Card>
      </form>
    </>
  )
}
