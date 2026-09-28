import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Boxes, Map, Wrench, LogOut, Menu, X, Megaphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../context/ThemeContext'
import AskPravi from './AskPravi'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/assets', label: 'Assets', icon: Boxes },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/work-orders', label: 'Work orders', icon: Wrench },
]

const ROLE_STYLE = {
  ADMIN: 'bg-brand-50 text-brand-700',
  ENGINEER: 'bg-ok-bg text-ok',
  VIEWER: 'bg-subtle text-ink-2',
}

export function Logo({ className = '' }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <img src="/logo.svg" alt="" className="size-6" />
      <span className="text-[17px] font-bold tracking-[-0.02em] text-ink">PRAVI</span>
    </span>
  )
}

function Sidebar({ onNavigate }) {
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <div className="flex h-14 items-center border-b border-line px-5"><Logo /></div>
      <div className="flex-1 space-y-0.5 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) =>
              `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <a href="/report" target="_blank" rel="noreferrer" className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink">
          <Megaphone className="size-[18px]" strokeWidth={1.75} /> Citizen report page
        </a>
        <p className="mt-3 px-2.5 text-[11px] leading-4 text-ink-4">Navpur Municipal Corporation<br />Demo data is fictional</p>
      </div>
    </nav>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)

  return (
    <div className="min-h-full lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-line bg-surface lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-[var(--shadow-pop)]">
            <button className="absolute right-3 top-4 rounded p-1 text-ink-3" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-4" /></button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-md p-1.5 text-ink-2 hover:bg-subtle lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
        <Logo className="lg:hidden" />
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-4 text-ink">{user.name}</p>
            <p className="text-xs text-ink-3">{user.designation}</p>
          </div>
          <ThemeToggle />
          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide ${ROLE_STYLE[user.role]}`}>{user.role}</span>
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{initials}</span>
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Sign out" title="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>
      <AskPravi />
    </div>
  )
}
