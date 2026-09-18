import { Component } from 'react'
import type { ReactNode } from 'react'

export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <section className="route-message" role="alert">
      <h1>No pudimos abrir esta página.</h1>
      <p>Puede haber un problema de conexión o una nueva versión disponible. Puedes recargar o volver al catálogo desde la navegación.</p>
      <button className="catalog-jump" type="button" onClick={() => window.location.reload()}>Recargar página</button>
    </section>
    return this.props.children
  }
}
