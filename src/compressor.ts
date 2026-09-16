import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

export type Resolution = 'original' | '720' | '1080'
export interface CompressionSettings {
  targetMB: number
  resolution: Resolution
}
export interface CompressionUpdate {
  phase: 'loading' | 'analyzing' | 'compressing' | 'finalizing'
  progress: number
  message: string
}
export interface CompressionResult {
  blob: Blob
  videoKbps: number
  durationSec: number
}
export const MAX_INPUT_BYTES = 500_000_000

export function planBitrate(durationSec: number, targetMB: number, fileBytes: number) {
  if (![durationSec, targetMB, fileBytes].every(Number.isFinite) || durationSec <= 0 || targetMB <= 0 || fileBytes <= 0) {
    throw new Error('La duración o el tamaño objetivo no son válidos.')
  }
  const budget = Math.min(targetMB * 1_000_000, fileBytes) * 0.95
  const audioKbps = 96
  const videoKbps = Math.floor(budget * 8 / durationSec / 1000 - audioKbps)
  if (videoKbps < 50) throw new Error('El objetivo es demasiado pequeño. Aumenta los MB o utiliza un video más corto.')
  return { videoKbps, audioKbps }
}

export async function compressVideo(
  file: File,
  settings: CompressionSettings,
  onUpdate: (update: CompressionUpdate) => void,
  signal: AbortSignal,
): Promise<CompressionResult> {
  signal.throwIfAborted()
  if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error('Selecciona un video de hasta 500 MB que no esté vacío.')
  if (!Number.isFinite(settings.targetMB) || settings.targetMB <= 0) throw new Error('Introduce un tamaño objetivo mayor que cero.')
  if (!globalThis.crossOriginIsolated) throw new Error('Faltan las cabeceras COOP/COEP. Usa localhost o un despliegue HTTPS con la configuración incluida.')
  const ffmpeg = new FFmpeg()
  const abort = () => ffmpeg.terminate()
  signal.addEventListener('abort', abort, { once: true })
  let encoding = false
  let durationSec = 0
  let lastProgress = 0
  const reportProgress = (progress: number) => {
    if (!encoding || signal.aborted || !Number.isFinite(progress)) return
    lastProgress = Math.max(lastProgress, Math.min(0.99, Math.max(0, progress)))
    onUpdate({ phase: 'compressing', progress: lastProgress, message: 'Comprimiendo en tu dispositivo…' })
  }
  ffmpeg.on('progress', ({ progress }) => reportProgress(progress))
  ffmpeg.on('log', ({ message }) => {
    const match = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
    if (match && durationSec > 0) reportProgress((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) / durationSec)
  })
  try {
    onUpdate({ phase: 'loading', progress: 0, message: 'Cargando el motor WASM local (aprox. 32 MB)…' })
    await ffmpeg.load({ coreURL, wasmURL })
    signal.throwIfAborted()
    onUpdate({ phase: 'analyzing', progress: 0, message: 'Leyendo el video y calculando el bitrate…' })
    const bytes = await fetchFile(file)
    signal.throwIfAborted()
    await ffmpeg.writeFile('input', bytes)
    const probeCode = await ffmpeg.ffprobe(['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', 'input', '-o', 'probe.json'])
    if (probeCode !== 0 && probeCode !== -1) throw new Error('No se puede leer este video. Comprueba que no esté dañado.')
    const probeText = await ffmpeg.readFile('probe.json', 'utf8')
    if (typeof probeText !== 'string') throw new Error('No se pudo analizar el video.')
    let probe: { format?: { duration?: string }; streams?: { codec_type?: string }[] }
    try {
      probe = JSON.parse(probeText)
    } catch {
      throw new Error('No se puede leer este video. Comprueba que no esté dañado.')
    }
    if (!probe.streams?.some((stream) => stream.codec_type === 'video')) throw new Error('El archivo no contiene una pista de video compatible.')
    durationSec = Number(probe.format?.duration)
    const { videoKbps, audioKbps } = planBitrate(durationSec, settings.targetMB, file.size)
    const height = settings.resolution === 'original' ? 'ih' : `min(ih,${settings.resolution})`
    const filter = `scale=w=-2:h='trunc(${height}/2)*2',setsar=1`
    signal.throwIfAborted()
    encoding = true
    reportProgress(0)
    const code = await ffmpeg.exec([
      '-i', 'input', '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast',
      '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', `${audioKbps}k`,
      '-map_metadata', '-1', '-movflags', '+faststart', 'output.mp4',
    ])
    encoding = false
    signal.throwIfAborted()
    if (code !== 0) throw new Error('No se pudo comprimir. El formato puede no ser compatible o puede faltar memoria. Prueba con un video más pequeño.')
    onUpdate({ phase: 'finalizing', progress: 0.99, message: 'Preparando tu MP4…' })
    const data = await ffmpeg.readFile('output.mp4')
    if (typeof data === 'string' || !data.length) throw new Error('El resultado está vacío.')
    const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
    signal.throwIfAborted()
    onUpdate({ phase: 'finalizing', progress: 1, message: 'Video listo para descargar.' })
    return { blob, videoKbps, durationSec }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Compresión cancelada.', 'AbortError')
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    ffmpeg.terminate()
  }
}
