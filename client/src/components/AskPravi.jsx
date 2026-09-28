import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, X, Send, RotateCcw, KeyRound } from 'lucide-react'
import { api } from '../lib/api'

const SUGGESTIONS = [
  'Which assets will reach critical condition in the next 90 days?',
  'What is affected by the damaged feeder pillar?',
  'Show damaged street lights in Station Road',
  'Summarise the health of city infrastructure',
  'Tell me about BRG-0001',
]

// Inline formatting: **bold** and asset codes (BRG-0001) turned into links when known
function Inline({ text, links, onNavigate }) {
  return text.split(/(\*\*[^*]+\*\*|\b[A-Z]{3}-\d{4}\b)/g).map((chunk, i) => {
    if (/^\*\*[^*]+\*\*$/.test(chunk)) {
      // Bold text may itself contain asset codes (e.g. **BRG-0005**), so format its contents too
      return <strong key={i} className="font-semibold text-ink"><Inline text={chunk.slice(2, -2)} links={links} onNavigate={onNavigate} /></strong>
    }
    if (/^[A-Z]{3}-\d{4}$/.test(chunk)) {
      const id = links[chunk]
      return id
        ? <Link key={i} to={`/assets/${id}`} onClick={onNavigate} className="rounded bg-brand-50 px-1 font-mono text-[12px] font-semibold text-brand-700 hover:underline">{chunk}</Link>
        : <span key={i} className="font-mono text-[12px] font-semibold">{chunk}</span>
    }
    return <Fragment key={i}>{chunk}</Fragment>
  })
}

// Minimal, safe markdown: paragraphs + bullet / numbered lists (no HTML injection)
function Answer({ text, links, onNavigate }) {
  const blocks = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    const clean = line.replace(/^#+\s*/, '')
    if (bullet) {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'list') last.items.push(bullet[1])
      else blocks.push({ type: 'list', items: [bullet[1]] })
    } else blocks.push({ type: 'p', text: clean })
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => b.type === 'list' ? (
        <ul key={i} className="space-y-1 pl-4">
          {b.items.map((it, j) => <li key={j} className="list-disc marker:text-ink-4"><Inline text={it} links={links} onNavigate={onNavigate} /></li>)}
        </ul>
      ) : <p key={i}><Inline text={b.text} links={links} onNavigate={onNavigate} /></p>)}
    </div>
  )
}

const TOOL_LABEL = {
  search_assets: 'searched assets', get_asset_details: 'read asset details', get_city_overview: 'read city KPIs',
  get_failure_forecast: 'ran failure forecast', get_service_impact: 'checked service impact', list_work_orders: 'read work orders',
}

const POS_KEY = 'pravi-ask-pos'
const MARGIN = 12
const DRAG_THRESHOLD = 5 // px of movement before a press counts as a drag (not a click)

const clampPos = ({ x, y }, w, h) => ({
  x: Math.round(Math.min(Math.max(MARGIN, x), window.innerWidth - w - MARGIN)),
  y: Math.round(Math.min(Math.max(MARGIN, y), window.innerHeight - h - MARGIN)),
})

function loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY))
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
  } catch { return null }
}
function savePos(p) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* storage unavailable */ }
}

// Drag the floating button anywhere on screen (mouse + touch via Pointer Events).
// null position = default bottom-right corner.
function useDraggable() {
  const ref = useRef(null)
  const [pos, setPos] = useState(loadPos)
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const size = () => {
    const r = ref.current?.getBoundingClientRect()
    return { w: r?.width ?? 130, h: r?.height ?? 44 }
  }

  // Keep the button on-screen when the window is resized
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p, size().w, size().h) : p))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handlers = {
    onPointerDown(e) {
      if (e.button !== 0) return
      const r = ref.current.getBoundingClientRect()
      drag.current = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e) {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD) return
      if (!d.moved) setDragging(true)
      d.moved = true
      setPos(clampPos({ x: e.clientX - d.ox, y: e.clientY - d.oy }, d.w, d.h))
    },
    onPointerUp() {
      const d = drag.current
      drag.current = null
      setDragging(false)
      if (d?.moved) {
        suppressClick.current = true // the click that follows a drag must not open the chat
        setPos((p) => { if (p) savePos(p); return p })
      }
    },
    onPointerCancel() { drag.current = null; setDragging(false) },
    // Keyboard alternative: Shift + arrow keys move the button
    onKeyDown(e) {
      const step = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key]
      if (!step || !e.shiftKey) return
      e.preventDefault()
      const r = ref.current.getBoundingClientRect()
      const next = clampPos({ x: r.left + step[0], y: r.top + step[1] }, r.width, r.height)
      setPos(next)
      savePos(next)
    },
  }
  const consumeDragClick = () => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }
  const reset = () => { setPos(null); try { localStorage.removeItem(POS_KEY) } catch { /* ignore */ } }
  return { ref, pos, dragging, handlers, consumeDragClick, reset, size }
}

// Place the chat panel next to the button, on the side with more room, fully on-screen
function panelStyle(pos, btn) {
  if (!pos) return undefined
  const vw = window.innerWidth, vh = window.innerHeight
  const w = Math.min(420, vw - 32), h = Math.min(600, vh - 32)
  const onRight = pos.x + btn.w / 2 > vw / 2
  const onBottom = pos.y + btn.h / 2 > vh / 2
  const left = onRight ? pos.x + btn.w - w : pos.x
  const top = onBottom ? pos.y + btn.h - h : pos.y
  return {
    left: Math.min(Math.max(16, left), vw - w - 16),
    top: Math.min(Math.max(16, top), vh - h - 16),
    right: 'auto', bottom: 'auto',
  }
}

export default function AskPravi() {
  const [open, setOpen] = useState(false)
  const fab = useDraggable()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([]) // { role: 'user'|'model', text, links?, tools?, error? }
  const [links, setLinks] = useState({})
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get('/ai/status'), enabled: open, staleTime: 60_000 })

  const ask = useMutation({
    mutationFn: ({ message, history }) => api.post('/ai/ask', { message, history }),
    onSuccess: (d) => {
      const newLinks = Object.fromEntries(d.assets.map((a) => [a.assetCode, a._id]))
      setLinks((l) => ({ ...l, ...newLinks }))
      setMessages((m) => [...m, { role: 'model', text: d.answer, tools: [...new Set(d.toolsUsed)] }])
    },
    onError: (e) => setMessages((m) => [...m, { role: 'model', text: e.message, error: true }]),
  })

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, ask.isPending])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = (text) => {
    const message = (text ?? input).trim()
    if (!message || ask.isPending) return
    const history = messages.filter((m) => !m.error).slice(-8).map(({ role, text: t }) => ({ role, text: t }))
    setMessages((m) => [...m, { role: 'user', text: message }])
    setInput('')
    ask.mutate({ message, history })
  }

  const notConfigured = status.data && !status.data.enabled

  return (
    <>
      {!open && (
        <button
          ref={fab.ref}
          {...fab.handlers}
          onClick={() => { if (!fab.consumeDragClick()) setOpen(true) }}
          onDoubleClick={fab.reset}
          style={fab.pos ? { left: fab.pos.x, top: fab.pos.y } : undefined}
          className={`fixed z-40 flex touch-none select-none items-center gap-2 rounded-full bg-brand-600 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-[var(--shadow-pop)] hover:bg-brand-500 ${
            fab.pos ? '' : 'bottom-5 right-5'} ${fab.dragging ? 'cursor-grabbing scale-105 opacity-90' : 'cursor-grab transition-transform hover:scale-[1.03]'}`}
          aria-label="Open Ask PRAVI assistant. Drag, or press Shift and arrow keys, to move it"
          title="Click to open · drag to move · double-click to reset position"
        >
          <Sparkles className="size-4" /> Ask PRAVI
        </button>
      )}

      {open && (
        <section
          style={panelStyle(fab.pos, fab.size())}
          className="fixed bottom-4 right-4 z-40 flex h-[600px] max-h-[calc(100vh-2rem)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]"
          aria-label="Ask PRAVI assistant"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Sparkles className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Ask PRAVI</p>
              <p className="truncate text-[11px] text-ink-3">AI assistant · answers from live data · read-only{status.data?.model ? ` · ${status.data.model}` : ''}</p>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setLinks({}) }} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="New conversation" title="New conversation"><RotateCcw className="size-4" /></button>
            )}
            <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Close assistant"><X className="size-4" /></button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
            {notConfigured ? (
              <div className="mt-6 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-warn-bg text-warn"><KeyRound className="size-5" /></span>
                <p className="mt-3 font-semibold">Gemini API key not set</p>
                <p className="mt-1 text-sm text-ink-3">Add <code className="rounded bg-subtle px-1 font-mono text-xs">GEMINI_API_KEY=…</code> to <code className="rounded bg-subtle px-1 font-mono text-xs">server/.env</code>, then restart the server.</p>
              </div>
            ) : messages.length === 0 ? (
              <div>
                <p className="font-medium">Hi! Ask me anything about Navpur’s infrastructure.</p>
                <p className="mt-1 text-sm text-ink-3">I look up live data: assets, health, forecasts, outages and work orders. English or Hindi.</p>
                <div className="mt-4 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700">{s}</button>
                  ))}
                </div>
              </div>
            ) : messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-white">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-2">
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${m.error ? 'bg-bad-bg text-bad' : 'bg-brand-50 text-brand-600'}`}><Sparkles className="size-3.5" /></span>
                <div className={`min-w-0 max-w-[88%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 ${m.error ? 'bg-bad-bg text-bad' : 'bg-page text-ink-2'}`}>
                  {m.error ? m.text : <Answer text={m.text} links={links} onNavigate={() => window.innerWidth < 640 && setOpen(false)} />}
                  {m.tools?.length > 0 && <p className="mt-2 border-t border-line pt-1.5 text-[11px] text-ink-4">Checked: {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(' · ')}</p>}
                </div>
              </div>
            ))}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-sm text-ink-3">
                <span className="flex size-6 items-center justify-center rounded-md bg-brand-50 text-brand-600"><Sparkles className="size-3.5 animate-pulse" /></span>
                Looking up live data…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2 border-t border-line p-3">
            <textarea
              ref={inputRef} rows={1} value={input} maxLength={500} disabled={notConfigured}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={notConfigured ? 'Assistant not configured' : 'Ask about assets, failures, outages…'}
              className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/25"
              aria-label="Your question"
            />
            <button type="submit" disabled={!input.trim() || ask.isPending || notConfigured} className="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}
