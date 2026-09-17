import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Check, FileVideo, HardDrive, Info, LoaderCircle, LockKeyhole, Minimize2, Moon, ShieldCheck, SlidersHorizontal, Sun, Upload, X } from 'lucide-react'
import { compressVideo, MAX_INPUT_BYTES, supportsMultithreading } from './compressor'
import type { CompressionResult, CompressionUpdate } from './compressor'

const size = (bytes: number) => `${(bytes / 1_000_000).toLocaleString('es', { maximumFractionDigits: 2 })} MB`
const THEME_KEY = 'ligero-tema'
const FAST_MODE_KEY = 'ligero-modo-rapido'
const multithreadingSupported = supportsMultithreading()

const PRESETS = [
  { name: 'WhatsApp', value: 180 },
  { name: 'Discord gratis', value: 20 },
  { name: 'Nitro Basic', value: 50 },
  { name: 'Gmail', value: 25 },
]

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [target, setTarget] = useState('100')
  const [themePreference, setThemePreference] = useState<'light' | 'dark' | null>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      return stored === 'light' || stored === 'dark' ? stored : null
    } catch { return null }
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const theme = themePreference ?? (systemDark ? 'dark' : 'light')
  const [fastMode, setFastMode] = useState(() => {
    try { return localStorage.getItem(FAST_MODE_KEY) === 'true' } catch { return false }
  })
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [update, setUpdate] = useState<CompressionUpdate | null>(null)
  const [result, setResult] = useState<CompressionResult | null>(null)
  const [downloadURL, setDownloadURL] = useState('')
  const [previewURL, setPreviewURL] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => () => { if (previewURL) URL.revokeObjectURL(previewURL) }, [previewURL])
  useEffect(() => () => { if (downloadURL) URL.revokeObjectURL(downloadURL) }, [downloadURL])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161b19' : '#f9f9f6')
  }, [theme])
  useEffect(() => {
    try { localStorage.setItem(FAST_MODE_KEY, String(fastMode)) } catch { return }
  }, [fastMode])
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

  function selectFiles(files: FileList | null) {
    if (controller.current || !files?.length) return
    setError('')
    if (files.length > 1) { setError('Selecciona un solo video a la vez.'); return }
    const selected = files[0]
    if (!selected.type.startsWith('video/') && !/\.(mp4|mov|avi|mkv|webm|m4v|mpeg|mpg|3gp|mts)$/i.test(selected.name)) {
      setError('Selecciona un archivo de video: MP4, MOV, AVI, MKV o WebM.'); return
    }
    if (!selected.size || selected.size > MAX_INPUT_BYTES) {
      setError('El video debe pesar entre 1 byte y 500 MB.'); return
    }
    setFile(selected)
    setPreviewURL(URL.createObjectURL(selected))
    clearResult()
  }

  async function start() {
    if (!file || controller.current) return
    if (!Number.isFinite(Number(target)) || Number(target) <= 0) { setError('Introduce un objetivo mayor que cero.'); return }
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    setError('')
    clearResult()
    try {
      const output = await compressVideo(file, { targetMB: Number(target), fastMode: fastMode && multithreadingSupported }, (value) => {
        if (controller.current === current) setUpdate(value)
      }, current.signal)
      if (controller.current === current) {
        setResult(output)
        setDownloadURL(URL.createObjectURL(output.blob))
      }
    } catch (cause) {
      if (controller.current === current && !current.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'No se pudo procesar el video. Intenta con un archivo más pequeño.')
      }
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false) }
    }
  }

  function cancel() {
    controller.current?.abort()
    controller.current = null
    setBusy(false)
    setUpdate(null)
  }

  function clearResult() { setResult(null); setDownloadURL(''); setUpdate(null) }
  const percent = Math.round((update?.progress ?? 0) * 100)
  const savings = file && result ? Math.round((1 - result.blob.size / file.size) * 100) : 0

  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="#"><span className="brand-icon"><Minimize2 size={22} /></span> ligero<span className="brand-dot">.</span></a>
        <nav aria-label="Navegación principal"><a href="#como-funciona">Cómo funciona <ArrowRight size={14} /></a><button type="button" className="theme-toggle" aria-label="Modo oscuro" aria-pressed={theme === 'dark'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button><span className="privacy-pill"><span /> 100 % local</span></nav>
      </header>

      <main>
        <section className="intro">
          <div className="eyebrow"><span className="tiny-line" /> MENOS PESO. MÁS POSIBILIDADES.</div>
          <h1>Tus videos, <span>más ligeros.</span></h1>
          <p>Comprime, descarga y comparte. Sin subir tus archivos a ningún sitio.<br className="desktop-break" /> Sin anuncios, sin cuentas. Solo tu video y tu navegador.</p>
          <div className="intro-tags"><span><ShieldCheck size={15} /> Privado por naturaleza</span><span><Check size={15} /> Siempre gratis</span><span><HardDrive size={15} /> Procesado en tu dispositivo</span></div>
        </section>

        <section className="workspace" aria-label="Compresor de video">
          <div className="upload-panel">
            <div className="section-title"><span className="step">01</span><h2>Tu video</h2><span className="section-note">El original no se modifica</span></div>
            <input ref={inputRef} type="file" id="video-input" className="sr-only" accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.mpeg,.mpg,.3gp,.mts" disabled={busy} onChange={(event) => { selectFiles(event.target.files); event.target.value = '' }} />
            {!file ? (
              <button type="button" className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(event.dataTransfer.files) }}>
                <div className="file-illustration"><span className="illustration-back" /><span className="illustration-front"><FileVideo size={36} strokeWidth={1.4} /><span className="mini-badge"><ArrowDownToLine size={14} /></span></span></div>
                <strong>Arrastra tu video aquí</strong><span className="drop-description">o selecciónalo desde tu dispositivo</span>
                <span className="select-button"><Upload size={16} /> Elegir video</span>
                <span className="formats">MP4, MOV, AVI, MKV, WebM · Hasta 500 MB</span>
              </button>
            ) : (
              <div className="selected-video">
                <div className="preview"><video key={previewURL} src={previewURL} controls preload="metadata" playsInline /><span>Vista previa · según compatibilidad del navegador</span></div>
                <div className="file-details"><FileVideo size={25} /><div><strong title={file.name}>{file.name}</strong><span>{size(file.size)} · Video original</span></div><button className="icon-button" disabled={busy} aria-label="Quitar video" onClick={() => { setFile(null); setPreviewURL(''); clearResult(); setError('') }}><X size={18} /></button></div>
              </div>
            )}
            <div className="local-note"><LockKeyhole size={16} /><p>Tu video se queda contigo.<br /><span>Todo el procesamiento ocurre en este navegador.</span></p></div>
          </div>

          <div className="settings-panel">
            <div className="section-title"><span className="step">02</span><h2>Hazlo más ligero</h2><SlidersHorizontal className="settings-icon" size={17} /></div>
            <fieldset disabled={busy}>
              <label className="field-label" htmlFor="target">Tamaño objetivo <span>Presupuesto</span></label>
              <div className="size-input"><input id="target" type="number" min="0.1" step="0.1" value={target} onChange={(event) => { setTarget(event.target.value); clearResult() }} /><span>MB</span></div>
              <div className="presets">{PRESETS.map((preset) => <button key={preset.name} type="button" className={Number(target) === preset.value ? 'active' : ''} aria-pressed={Number(target) === preset.value} onClick={() => { setTarget(String(preset.value)); clearResult() }}><span className="preset-name">{preset.name}</span><strong>{preset.value} MB</strong></button>)}</div>
              <p className="field-hint">Presupuesto objetivo, no un tamaño garantizado: el bitrate se calcula según la duración y al terminar verás el tamaño exacto.</p>
              <div className="output-format"><span>Formato de salida</span><strong>MP4 <span>H.264 + AAC</span></strong></div>
              <div className="fast-mode">
                <label htmlFor="fast-mode"><input id="fast-mode" type="checkbox" checked={fastMode && multithreadingSupported} disabled={!multithreadingSupported} aria-describedby={multithreadingSupported ? 'fast-mode-hint' : 'fast-mode-hint fast-mode-support'} onChange={(event) => { setFastMode(event.target.checked); clearResult() }} />Modo rápido</label>
                <p id="fast-mode-hint">Usa más CPU y memoria RAM, no la GPU, con hasta 4 hilos. La mejora de rapidez depende de tu dispositivo.</p>
                {!multithreadingSupported && <p id="fast-mode-support" className="fast-mode-support">Modo rápido no disponible: este navegador o página necesita aislamiento de origen cruzado y SharedArrayBuffer. Se usará un solo hilo.</p>}
              </div>
            </fieldset>
            {busy ? <button className="primary-button cancel" onClick={cancel}><X size={17} /> Cancelar compresión</button> : <button className="primary-button" disabled={!file || !Number.isFinite(Number(target)) || Number(target) <= 0} onClick={() => void start()}><Minimize2 size={18} /> {result ? 'Comprimir de nuevo' : 'Comprimir video'}<ArrowRight size={17} /></button>}
            <p className="button-caption">{file ? 'Mantén esta pestaña abierta durante el proceso.' : 'Selecciona un video para comenzar.'}</p>
          </div>
        </section>

        {error && <div className="error-message" role="alert"><Info size={20} /><span>{error}</span></div>}
        {busy && update && <section className="status-card" aria-live="polite"><div className="status-heading"><LoaderCircle className="spin" size={21} /><strong>{update.message}</strong><span>{update.phase === 'compressing' || update.phase === 'finalizing' ? `${percent} %` : 'Un momento…'}</span></div><div className={`progress-track ${update.phase === 'loading' || update.phase === 'analyzing' ? 'indeterminate' : ''}`} role="progressbar" aria-label="Progreso de compresión" aria-valuemin={0} aria-valuemax={100} aria-valuenow={update.phase === 'compressing' || update.phase === 'finalizing' ? percent : undefined}><div style={{ width: `${percent}%` }} /></div><p>Los videos largos pueden tardar varios minutos. No cierres esta pestaña.</p></section>}
        {result && file && <section className="result-card" aria-live="polite"><div className="result-heading"><span className="success-icon"><Check size={24} /></span><div><h2>Listo para compartir.</h2><p>{size(file.size)} → <strong>{size(result.blob.size)}</strong> · {result.blob.size.toLocaleString('es')} bytes{savings > 0 ? ` · ${savings} % menos peso` : ' · Este video no se redujo; prueba un objetivo menor.'}</p></div></div><a className="download-button" href={downloadURL} download={`${file.name.replace(/\.[^.]+$/, '')}-comprimido.mp4`}><ArrowDownToLine size={18} /> Descargar MP4</a>{result.blob.size > Number(target) * 1_000_000 && <p className="result-warning">El resultado supera el presupuesto objetivo. Comprueba el tamaño exacto antes de enviarlo o prueba con menos MB.</p>}</section>}

        <div className="under-workspace"><Info size={15} /><span>Menos tamaño, un poco menos de calidad. Tú eliges el equilibrio.</span><span className="engine-label">POWERED BY FFMPEG.WASM</span></div>

        <section className="how-section" id="como-funciona"><div className="how-heading"><span className="eyebrow">ASÍ DE SIMPLE</span><h2>De pesado a compartido.</h2></div><div className="how-grid"><article><span>01 /</span><h3>Elige tu video</h3><p>Arrástralo o búscalo en tu dispositivo. No se sube a ningún servidor.</p></article><article><span>02 /</span><h3>Define el objetivo</h3><p>Elige un presupuesto en MB. Calculamos el bitrate y ajustamos la resolución, con un máximo de 720p.</p></article><article><span>03 /</span><h3>Descarga y comparte</h3><p>Tu MP4 está listo para llevarlo a donde quieras. Sin marcas de agua.</p></article></div></section>
        <section className="faq" aria-label="Preguntas frecuentes">
          <details><summary>¿Mis videos son realmente privados?</summary><p>Sí. FFmpeg se ejecuta en tu navegador mediante WebAssembly. Solo se descargan los archivos de la aplicación y su motor; el video nunca se envía a un servidor. Solo se carga el motor del modo elegido al comprimir y se reutiliza entre trabajos de la misma sesión. Si cambias de modo, al iniciar el próximo trabajo se libera el motor anterior y se carga el nuevo. Los archivos temporales se liberan al terminar cada compresión.</p></details>
          <details><summary>¿Cómo se calcula el tamaño final?</summary><p>Reservamos un 2 % para el contenedor y sumamos una sobrecarga proporcional a la duración; detectamos si el video tiene audio y repartimos el presupuesto entre video y audio. Hacemos una sola pasada rápida y solo reintentamos si el resultado supera el límite. La resolución se ajusta automáticamente, con un máximo de 720p, con el preset superfast.</p></details>
          <details><summary>¿Qué límites tienen WhatsApp, Discord y Gmail?</summary><p>WhatsApp: 180 MB es un objetivo conservador elegido para esta herramienta, no un límite oficial. Discord gratis permite 20 MB y Nitro Basic 50 MB, según la FAQ oficial actualizada en agosto de 2026. Gmail personal permite 25 MB en total entre todos los adjuntos: reduce el objetivo si añades otros archivos; por encima del límite, Gmail utiliza un enlace de Google Drive. Las cuentas de trabajo o estudios dependen de su administrador. Comprueba los límites vigentes en la <a className="faq-link" href="https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ" target="_blank" rel="noopener noreferrer">FAQ de adjuntos de Discord</a> y en la <a className="faq-link" href="https://support.google.com/mail/answer/6584?hl=en" target="_blank" rel="noopener noreferrer">ayuda de Gmail</a> antes de enviar.</p></details>
          <details><summary>¿Por qué tarda y qué límites tiene?</summary><p>Por defecto, el motor usa un solo hilo para priorizar la compatibilidad. El modo rápido permite hasta 4 hilos en navegadores compatibles, usando más CPU y memoria RAM, no la GPU. Ambos modos usan el preset superfast; la velocidad real depende de tu dispositivo, tu navegador y el contenido del video, así que no prometemos tiempos concretos. El límite de entrada es 500 MB; en móviles, incluso archivos menores pueden superar la memoria disponible. Puedes cancelar en cualquier momento.</p></details>
          <details><summary>¿El archivo tendrá exactamente el tamaño elegido?</summary><p>No. El objetivo es un presupuesto aproximado y el resultado depende del contenido. Comprueba el tamaño final exacto, mostrado en bytes al terminar, y los límites vigentes de tu aplicación antes de enviarlo. Si el original ya pesa menos, no intentamos rellenar el tamaño objetivo.</p></details>
        </section>
      </main>
      <footer><a className="brand footer-brand" href="#">ligero.</a><span>Un poco menos de peso. Un poco más de libertad.</span><span><LockKeyhole size={13} /> Sin anuncios. Sin subidas.</span></footer>
    </div>
  )
}

export default App
