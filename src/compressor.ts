import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

export interface CompressionSettings {
  targetMB: number
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
let idleEngine: FFmpeg | undefined

export function planBitrate(durationSec: number, targetMB: number, fileBytes: number, hasAudio = true) {
  if (![durationSec, targetMB, fileBytes].every(Number.isFinite) || durationSec <= 0 || targetMB <= 0 || fileBytes <= 0) {
    throw new Error('La duración o el tamaño objetivo no son válidos.')
  }
  const targetBytes = Math.min(targetMB * 1_000_000, fileBytes)
  const overheadBytes = 2048 + durationSec * 400
  const budget = targetBytes * 0.98 - overheadBytes
  const totalKbps = budget * 8 / durationSec / 1000
  const audioKbps = hasAudio ? (totalKbps < 160 ? 32 : totalKbps < 300 ? 64 : 96) : 0
  const videoKbps = Math.floor(totalKbps - audioKbps)
  if (videoKbps < 50) throw new Error('El objetivo es demasiado pequeño. Aumenta los MB o utiliza un video más corto.')
  return { videoKbps, audioKbps, targetBytes, overheadBytes }
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
  const ffmpeg = idleEngine ?? new FFmpeg()
  idleEngine = undefined
  const abort = () => ffmpeg.terminate()
  signal.addEventListener('abort', abort, { once: true })
  let encoding = false
  let reusable = false
  let durationSec = 0
  let lastProgress = 0
  let attempt = 0
  const reportProgress = (progress: number) => {
    if (!encoding || signal.aborted || !Number.isFinite(progress)) return
    const scaled = attempt === 0 ? progress * 0.85 : 0.85 + progress * 0.14
    lastProgress = Math.max(lastProgress, Math.min(0.99, Math.max(0, scaled)))
    onUpdate({ phase: 'compressing', progress: lastProgress, message: attempt === 0 ? 'Comprimiendo en tu dispositivo…' : 'Ajustando el bitrate para respetar el tamaño objetivo…' })
  }
  const onProgress = ({ progress }: { progress: number }) => reportProgress(progress)
  const onLog = ({ message }: { message: string }) => {
    const match = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
    if (match && durationSec > 0) reportProgress((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) / durationSec)
  }
  ffmpeg.on('progress', onProgress)
  ffmpeg.on('log', onLog)
  try {
    if (!ffmpeg.loaded) {
      onUpdate({ phase: 'loading', progress: 0, message: 'Cargando el motor WASM local (aprox. 32 MB)…' })
      await ffmpeg.load({ coreURL, wasmURL })
    }
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
      if (!probe || !Array.isArray(probe.streams)) throw new Error()
    } catch {
      throw new Error('No se puede leer este video. Comprueba que no esté dañado.')
    }
    if (!probe.streams?.some((stream) => stream.codec_type === 'video')) throw new Error('El archivo no contiene una pista de video compatible.')
    durationSec = Number(probe.format?.duration)
    const hasAudio = probe.streams.some((stream) => stream.codec_type === 'audio')
    const plan = planBitrate(durationSec, settings.targetMB, file.size, hasAudio)
    let videoKbps = plan.videoKbps
    for (attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted()
      encoding = true
      reportProgress(0)
      const code = await ffmpeg.exec([
        '-y', '-i', 'input', '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
        '-vf', "scale=w=-2:h='trunc(min(ih,720)/2)*2',setsar=1", '-c:v', 'libx264', '-preset', 'superfast',
        '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps}k`, '-bufsize', `${videoKbps * 2}k`,
        '-pix_fmt', 'yuv420p', ...(hasAudio ? ['-c:a', 'aac', '-b:a', `${plan.audioKbps}k`] : ['-an']),
        '-map_metadata', '-1', '-movflags', '+faststart', 'output.mp4',
      ])
      encoding = false
      signal.throwIfAborted()
      if (code !== 0) throw new Error('No se pudo comprimir. El formato puede no ser compatible o puede faltar memoria. Prueba con un video más pequeño.')
      const data = await ffmpeg.readFile('output.mp4')
      if (typeof data === 'string' || !data.length) throw new Error('El resultado está vacío.')
      if (data.length <= settings.targetMB * 1_000_000) {
        onUpdate({ phase: 'finalizing', progress: 0.99, message: 'Preparando tu MP4…' })
        const blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
        signal.throwIfAborted()
        reusable = true
        onUpdate({ phase: 'finalizing', progress: 1, message: 'Video listo para descargar.' })
        return { blob, videoKbps, durationSec }
      }
      const fixedBytes = plan.audioKbps * 1000 * durationSec / 8 + plan.overheadBytes
      videoKbps = Math.floor(videoKbps * Math.max(0, plan.targetBytes * 0.96 - fixedBytes) / Math.max(1, data.length - fixedBytes))
      if (videoKbps < 50) break
      await ffmpeg.deleteFile('output.mp4')
    }
    throw new Error('No se pudo alcanzar el tamaño objetivo en dos intentos. Prueba con un objetivo mayor o un video más corto.')
  } catch (error) {
    if (signal.aborted) throw new DOMException('Compresión cancelada.', 'AbortError')
    throw error
  } finally {
    ffmpeg.off('progress', onProgress)
    ffmpeg.off('log', onLog)
    if (reusable && !signal.aborted) {
      try {
        for (const path of ['input', 'probe.json', 'output.mp4']) await ffmpeg.deleteFile(path)
      } catch {
        reusable = false
      }
    }
    signal.removeEventListener('abort', abort)
    if (reusable && !signal.aborted && !idleEngine) idleEngine = ffmpeg
    else ffmpeg.terminate()
    signal.throwIfAborted()
  }
}
