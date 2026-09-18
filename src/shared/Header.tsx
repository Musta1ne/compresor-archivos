import { useEffect, useState } from 'react'
import { ArrowLeft, Minimize2, Moon, Sun } from 'lucide-react'
import { AppLink } from './AppLink'

const THEME_KEY = 'ligero-tema'

export function Header({ brandSuffix, isHome }: { brandSuffix: string; isHome: boolean }) {
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | null>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      return stored === 'light' || stored === 'dark' ? stored : null
    } catch { return null }
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = themePreference ?? (systemDark ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161b19' : '#f9f9f6')
  }, [theme])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystem = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onSystem)
    return () => media.removeEventListener('change', onSystem)
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setThemePreference(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { return }
  }

  return <header className="header platform-header">
    <AppLink className="brand" href="/" aria-label={`Ligero.${brandSuffix} — Ir al catálogo`}>
      <span className="brand-icon" aria-hidden="true"><Minimize2 size={22} /></span>
      <span>Ligero<span className="brand-period">.</span><span className="brand-suffix">{brandSuffix}</span></span>
    </AppLink>
    <nav aria-label="Navegación principal">
      {!isHome && <AppLink href="/" className="catalog-back"><ArrowLeft size={16} aria-hidden="true" /> Volver al catálogo</AppLink>}
      <button type="button" className="theme-toggle" aria-label="Modo oscuro" aria-pressed={theme === 'dark'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    </nav>
  </header>
}
