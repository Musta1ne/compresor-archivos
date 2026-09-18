import { ArrowRight } from 'lucide-react'
import { tools } from './tools'
import { AppLink } from '../shared/AppLink'

export function HomePage() {
  return <>
    <section className="intro catalog-intro">
      <div className="eyebrow"><span className="tiny-line" /> MENOS VUELTAS. MÁS POSIBILIDADES.</div>
      <h1>Lo que necesitas.<br /><span>Un poco más ligero.</span></h1>
      <p>Herramientas sencillas para resolver tareas cotidianas.<br className="desktop-break" /> Elige una herramienta y empieza, sin crear una cuenta.</p>
      <a className="catalog-jump" href="#herramientas">Explorar herramientas <ArrowRight size={17} aria-hidden="true" /></a>
    </section>
    <section className="catalog-section" id="herramientas" aria-labelledby="catalog-title">
      <div className="catalog-heading"><div><span className="eyebrow">TU CAJA DE HERRAMIENTAS</span><h2 id="catalog-title">Herramientas disponibles</h2></div><span>{tools.length} disponible{tools.length === 1 ? '' : 's'}</span></div>
      <ul className="tool-grid">
        {tools.map((tool) => <li key={tool.id}>
          <AppLink className="tool-card" href={tool.path}>
            <div className="tool-card-top"><span className="tool-icon"><tool.icon size={26} aria-hidden="true" /></span><span className="tool-category">{tool.category}</span></div>
            <h3>{tool.name}</h3><p>{tool.description}</p>
            <span className="tool-card-action">Abrir herramienta <ArrowRight size={18} aria-hidden="true" /></span>
          </AppLink>
        </li>)}
      </ul>
    </section>
    <section className="catalog-note" aria-labelledby="catalog-note-title"><h2 id="catalog-note-title">Una tarea. Una herramienta.</h2><p>Empieza con el compresor de video: selecciona tu archivo, define el tamaño objetivo y descarga el resultado. Las opciones y los límites se explican dentro de la herramienta.</p></section>
  </>
}
