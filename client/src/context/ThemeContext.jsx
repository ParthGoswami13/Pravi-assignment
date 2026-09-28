import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const ThemeContext = createContext({ theme: 'light', toggle: () => {} })
const KEY = 'pravi-theme'

// Initial theme is applied before React loads by public/theme-init.js (no white flash)
const initial = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Follow the OS setting until the user picks a theme explicitly
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => {
      try { if (localStorage.getItem(KEY)) return } catch { /* storage unavailable */ }
      setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem(KEY, next) } catch { /* storage unavailable */ }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

export function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      className={`rounded-md p-1.5 text-ink-3 transition-colors hover:bg-subtle hover:text-ink ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
