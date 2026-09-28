import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Megaphone, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { CATEGORIES } from '../lib/constants'
import { Button, Field, Input, Textarea } from '../components/ui'
import { Logo } from '../components/AppLayout'
import { ThemeToggle } from '../context/ThemeContext'

// Public page (no login): citizens report a fault on an asset using the code on its tag.
export default function ReportIssue() {
  const [form, setForm] = useState({ assetCode: new URLSearchParams(window.location.search).get('asset') ?? '', description: '', reporterPhone: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const m = useMutation({ mutationFn: () => api.post('/public/report', form) })
  // Confirm which asset is being reported (e.g. after scanning its QR tag)
  const code = form.assetCode.trim().toUpperCase()
  const lookup = useQuery({
    queryKey: ['public-asset', code],
    queryFn: () => api.get(`/public/assets/${code}`),
    enabled: /^[A-Z]{3}-\d{4}$/.test(code),
    retry: false,
  })
  const found = lookup.data?.asset
  const FoundIcon = found && CATEGORIES[found.category]?.icon

  return (
    <div className="relative flex min-h-full flex-col items-center bg-page px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <Logo className="mb-6" />
      <div className="w-full max-w-[480px] rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        {m.isSuccess ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-ok" strokeWidth={1.5} />
            <h1 className="mt-4 text-lg font-semibold">Complaint registered</h1>
            <p className="mt-1 text-sm text-ink-3">Your tracking number</p>
            <p className="mt-2 font-mono text-2xl font-semibold text-brand-700">{m.data.trackingNumber}</p>
            <p className="mt-4 text-sm text-ink-2">The Navpur Municipal Corporation maintenance team has been notified.</p>
            <Button variant="secondary" className="mt-6" onClick={() => { m.reset(); setForm({ assetCode: '', description: '', reporterPhone: '' }) }}>Report another issue</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Megaphone className="size-5" /></span>
              <div>
                <h1 className="text-lg font-semibold">Report a problem</h1>
                <p className="text-sm text-ink-3">Broken street light, damaged road, faulty signal…</p>
              </div>
            </div>
            <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
              <Field label="Asset code" hint="Printed on the tag attached to the pole or structure, e.g. STL-0007">
                <Input required value={form.assetCode} onChange={set('assetCode')} placeholder="STL-0007" className="font-mono uppercase" />
              </Field>
              {found && (
                <div className="flex items-start gap-3 rounded-lg border border-ok/30 bg-ok-bg px-3 py-2.5">
                  {FoundIcon && <FoundIcon className="mt-0.5 size-5 shrink-0 text-ok" strokeWidth={1.75} />}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-ink">{found.name}</p>
                    <p className="flex items-center gap-1 text-xs text-ink-3"><MapPin className="size-3" />{found.address}</p>
                  </div>
                </div>
              )}
              {lookup.isError && <p className="-mt-2 text-xs text-bad">No active asset found with code {code}. Check the tag and try again.</p>}
              <Field label="What is the problem?"><Textarea required minLength={10} value={form.description} onChange={set('description')} placeholder="The light has not been working for 3 nights." /></Field>
              <Field label="Mobile number (optional)" hint="Only used to update you on the repair."><Input inputMode="numeric" maxLength={10} value={form.reporterPhone} onChange={set('reporterPhone')} placeholder="9876543210" /></Field>
              {m.isError && <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">{m.error.message}</p>}
              <Button type="submit" size="lg" className="w-full" loading={m.isPending}>Submit report</Button>
            </form>
          </>
        )}
      </div>
      <p className="mt-6 text-xs text-ink-3">Navpur Municipal Corporation (demo) · Powered by PRAVI</p>
    </div>
  )
}
