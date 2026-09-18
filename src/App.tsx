import { Suspense, useEffect, useRef } from 'react'
import { HomePage } from './catalog/HomePage'
import { findTool } from './catalog/tools'
import { usePathname } from './catalog/router'
import { toolPages } from './app/toolPages'
import { PageBoundary } from './app/PageBoundary'
import { AppLink } from './shared/AppLink'
import { Header } from './shared/Header'
import './app/platform.css'

function App() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const tool = findTool(pathname)
  const Page = tool ? toolPages[tool.id] : undefined
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const brandSuffix = tool?.brandSuffix ?? 'Tools'

  useEffect(() => {
    document.title = isHome ? 'Ligero.Tools — Herramientas sencillas' : tool ? `Ligero.${tool.brandSuffix} — ${tool.name}` : 'Página no encontrada — Ligero.Tools'
    document.querySelector('meta[name="description"]')?.setAttribute('content', tool?.description ?? 'Herramientas sencillas para resolver tareas cotidianas. Empieza con el compresor de video.')
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      window.scrollTo(0, 0)
      previousPath.current = pathname
    }
  }, [pathname, isHome, tool])

  return <div className="app-shell platform-shell">
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <Header brandSuffix={brandSuffix} isHome={isHome} />
    <main id="contenido" ref={mainRef} tabIndex={-1}>
      <PageBoundary key={pathname}>
        <Suspense fallback={<section className="route-message" role="status"><h1>Cargando herramienta…</h1><p>Un momento, estamos preparando la página.</p></section>}>
          {isHome ? <HomePage /> : Page ? <Page /> : <section className="route-message"><span className="eyebrow">ERROR 404</span><h1>Esta página no existe.</h1><p>Encuentra las herramientas disponibles en el catálogo.</p><AppLink className="catalog-jump" href="/">Volver al catálogo</AppLink></section>}
        </Suspense>
      </PageBoundary>
    </main>
    <footer className="platform-footer"><AppLink href="/">Ligero.Tools</AppLink><span>Menos vueltas. Más posibilidades.</span></footer>
  </div>
}

export default App
