import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Printer, Download, Search, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { CATEGORIES, RELATIONSHIP_RULES } from '../lib/constants'
import { useInvalidate } from './dialogs'
import { AssetCode, Button, Dialog, Field, Input, Select, StatusBadge } from './ui'

// Printable QR sticker: scanning opens the public report page with the asset code pre-filled
export function QrTagDialog({ asset, open, onClose }) {
  const url = `${window.location.origin}/report?asset=${asset.assetCode}`
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#12151b', light: '#ffffff' } }).then(setSrc)
  }, [url])
  const Icon = CATEGORIES[asset.category]?.icon
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  return (
    <Dialog
      open={open} onClose={onClose} title="Asset QR tag" width={440}
      description="Print and fix this sticker on the asset. Citizens scan it to report a problem — no app or login needed."
      footer={<>
        <a href={src} download={`${asset.assetCode}-qr.png`}><Button variant="secondary" disabled={!src}><Download className="size-4" />Download</Button></a>
        <Button onClick={() => window.print()} disabled={!src}><Printer className="size-4" />Print tag</Button>
      </>}
    >
      {/* Sticker is always black-on-white so it prints and scans reliably in either theme */}
      <div className="print-area mx-auto w-[300px] rounded-xl border-2 border-[#12151b] bg-white p-5 text-center text-[#12151b]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5"><img src="/logo.svg" alt="" className="size-5" /><span className="text-sm font-bold tracking-tight">PRAVI</span></span>
          <span className="text-[10px] font-semibold uppercase tracking-wide">Navpur Municipal Corp.</span>
        </div>
        {src ? <img src={src} alt={`QR code for ${asset.assetCode}`} className="mx-auto my-3 size-[200px]" /> : <div className="mx-auto my-3 size-[200px] animate-pulse rounded bg-[#eef0f3]" />}
        <p className="font-mono text-2xl font-bold tracking-wider">{asset.assetCode}</p>
        <p className="mt-0.5 flex items-center justify-center gap-1 text-xs">{Icon && <Icon className="size-3.5" />}{asset.name}</p>
        <p className="mt-3 rounded bg-[#12151b] py-1.5 text-xs font-semibold text-white">Scan to report a problem</p>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-1 text-xs font-medium text-brand-700 hover:underline">
        Open report page <ExternalLink className="size-3" />
      </a>
      {isLocal && <p className="mt-1 text-center text-[11px] text-ink-4">Running on localhost: phone scanning works once the app is deployed.</p>}
    </Dialog>
  )
}

// Link this asset to another (e.g. feeder pillar POWERS street light)
export function LinkDialog({ asset, open, onClose }) {
  const invalidate = useInvalidate()
  // Rules where this asset can be the source ("Powers …") or the target ("Powered by …")
  const options = Object.entries(RELATIONSHIP_RULES).flatMap(([type, r]) => [
    ...(r.source.includes(asset.category) ? [{ key: `${type}:out`, type, dir: 'out', label: r.label, categories: r.target }] : []),
    ...(r.target.includes(asset.category) ? [{ key: `${type}:in`, type, dir: 'in', label: r.inverse, categories: r.source }] : []),
  ])
  const [optKey, setOptKey] = useState(options[0]?.key ?? '')
  const opt = options.find((o) => o.key === optKey)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)

  const results = useQuery({
    queryKey: ['assets', 'link-search', optKey, q],
    queryFn: () => api.get(`/assets?limit=8&sort=assetCode&category=${opt.categories.join(',')}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    enabled: open && !!opt,
  })
  const m = useMutation({
    mutationFn: () => api.post('/relationships', {
      type: opt.type,
      sourceId: opt.dir === 'out' ? asset._id : picked._id,
      targetId: opt.dir === 'out' ? picked._id : asset._id,
    }),
    onSuccess: () => { toast.success('Dependency linked'); invalidate(); onClose() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog
      open={open} onClose={onClose} title="Link dependency" description={`${asset.assetCode} · ${asset.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!picked} onClick={() => m.mutate()}>Create link</Button></>}
    >
      {options.length === 0 ? <p className="text-sm text-ink-3">This asset type has no supported dependency links.</p> : (
        <div className="space-y-4">
          <Field label="Relationship">
            <Select value={optKey} onChange={(e) => { setOptKey(e.target.value); setPicked(null) }}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label} → {o.categories.map((c) => CATEGORIES[c].label).join(' / ')}</option>)}
            </Select>
          </Field>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
            <Input className="w-full pl-8" placeholder="Search asset code or name" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {results.data?.items.filter((a) => a._id !== asset._id).map((a) => (
              <li key={a._id}>
                <button type="button" onClick={() => setPicked(a)} className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-page ${picked?._id === a._id ? 'bg-brand-50' : ''}`}>
                  <input type="radio" readOnly checked={picked?._id === a._id} className="accent-brand-600" aria-label={`Select ${a.assetCode}`} />
                  <span className="min-w-0 flex-1"><AssetCode>{a.assetCode}</AssetCode><span className="block truncate text-[13px]">{a.name}</span></span>
                  <StatusBadge status={a.status} />
                </button>
              </li>
            ))}
            {results.data?.items.length === 0 && <li className="px-3 py-4 text-center text-sm text-ink-3">No matching assets</li>}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
