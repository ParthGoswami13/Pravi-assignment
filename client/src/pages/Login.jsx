import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck, HardHat, Eye } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Field, Input } from '../components/ui'
import { Logo } from '../components/AppLayout'
import { ThemeToggle } from '../context/ThemeContext'

const DEMO = [
  { label: 'Admin', email: 'admin@navpur.gov.demo', icon: ShieldCheck },
  { label: 'Engineer', email: 'engineer@navpur.gov.demo', icon: HardHat },
  { label: 'Viewer', email: 'viewer@navpur.gov.demo', icon: Eye },
]

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={location.state?.from || '/'} replace />

  const submit = async (e, creds) => {
    e?.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(creds?.email ?? email, creds?.password ?? password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-full flex-col items-center justify-center px-4 py-10"
      style={{ backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
    >
      <ThemeToggle className="absolute right-4 top-4" />
      <Logo className="mb-6 scale-110" />
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <h1 className="text-lg font-semibold">Sign in to Navpur Municipal Corporation</h1>
        <p className="mt-1 text-sm text-ink-3">Infrastructure asset intelligence platform</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@navpur.gov.demo" />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>Sign in</Button>
        </form>
        <div className="mt-6">
          <div className="flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />One-click demo accounts<span className="h-px flex-1 bg-line" /></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMO.map(({ label, email: demoEmail, icon: Icon }) => (
              <button
                key={label} type="button" disabled={loading}
                onClick={() => submit(null, { email: demoEmail, password: 'Pravi@2026' })}
                className="flex flex-col items-center gap-1 rounded-lg border border-line py-2.5 text-xs font-medium text-ink-2 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
              >
                <Icon className="size-4" strokeWidth={1.75} />{label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-6 text-xs text-ink-3">PRAVI · Demo organisation and data are fictional</p>
    </div>
  )
}
