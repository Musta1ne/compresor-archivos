import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('./src/compressor.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function harness(outputSizes = [1000, 1000], hooks = {}) {
  let instances = 0
  let executions = 0
  const engines = []
  const exports = {}
  class FFmpeg {
    loaded = false
    terminations = 0
    deleted = []
    listeners = new Map()
    constructor() { instances++; engines.push(this) }
    on(event, callback) { this.listeners.set(event, callback) }
    off(event) { this.listeners.delete(event) }
    async load() { this.loaded = true }
    async writeFile() {}
    async deleteFile(path) { this.deleted.push(path); await hooks.deleteFile?.(path) }
    async ffprobe() { return 0 }
    terminate() { this.loaded = false; this.terminations++ }
    async exec() {
      executions++
      const progress = this.listeners.get('progress')
      if (executions > 1) {
        for (const value of [1152921504606.847, NaN, Infinity, -1, 1.1]) progress({ progress: value })
      }
      for (const value of [0, 0.2, 0.6, 0.4, 1]) progress({ progress: value })
      return 0
    }
    async readFile(path) {
      if (path === 'probe.json') return JSON.stringify({ format: { duration: '8' }, streams: [{ codec_type: 'video' }] })
      return new Uint8Array(outputSizes[executions - 1])
    }
  }
  vm.runInNewContext(compiled, {
    exports, Blob, Uint8Array, DOMException, SharedArrayBuffer,
    crossOriginIsolated: true,
    require(name) {
      if (name === '@ffmpeg/ffmpeg') return { FFmpeg }
      if (name === '@ffmpeg/util') return { fetchFile: async () => new Uint8Array(1) }
      if (name.startsWith('@ffmpeg/core')) return { default: name }
      throw new Error(`Unexpected module: ${name}`)
    },
  })
  const run = async (signal = new AbortController().signal) => {
    const updates = []
    await exports.compressVideo({ size: 2_000_000 }, { targetMB: 1 }, (update) => updates.push(update), signal)
    return updates
  }
  return { run, dispose: exports.disposeIdleEngine, instances: () => instances, engines }
}

test('reused engine ignores invalid progress and continues advancing', async () => {
  const engine = harness()
  const first = await engine.run()
  const second = await engine.run()
  assert.equal(engine.instances(), 1)
  assert.deepEqual(second, first.filter((update) => update.phase !== 'loading'))
  assert.deepEqual(second.filter((update) => update.phase === 'compressing').map((update) => update.progress), [0, 0, 0.17, 0.51, 0.51, 0.85])
  assert.equal(second.at(-1).progress, 1)
})

test('retry ignores sentinel progress before processing its frames', async () => {
  const engine = harness([1_200_000, 900_000])
  const updates = await engine.run()
  const retry = updates.filter((update) => update.message.startsWith('Ajustando'))
  assert.equal(retry.length, 6)
  assert.equal(retry[0].progress, 0.85)
  assert.equal(retry[1].progress, 0.85)
  assert.ok(retry[2].progress > 0.85 && retry[2].progress < 0.9)
  assert.ok(retry[3].progress > retry[2].progress && retry[3].progress < 0.99)
  assert.equal(retry[4].progress, retry[3].progress)
  assert.equal(retry[5].progress, 0.99)
  assert.equal(updates.at(-1).progress, 1)
})

test('dispose idle engine repeatedly and on a fresh module instance', async () => {
  const fresh = harness()
  fresh.dispose()
  fresh.dispose()
  assert.equal(fresh.instances(), 0)
  await fresh.run()
  fresh.dispose()
  fresh.dispose()
  assert.equal(fresh.instances(), 1)
  assert.equal(fresh.engines[0].terminations, 1)
  assert.equal(fresh.engines[0].loaded, false)
  assert.equal(fresh.engines[0].listeners.size, 0)
  assert.deepEqual(fresh.engines[0].deleted, ['input', 'probe.json', 'output.mp4'])
})

test('compression after dispose loads a new engine instead of reusing', async () => {
  const engine = harness([1000, 1000, 1000])
  await engine.run()
  engine.dispose()
  const updates = await engine.run()
  assert.equal(engine.instances(), 2)
  assert.equal(updates[0].phase, 'loading')
  assert.equal(engine.engines[0].terminations, 1)
  assert.equal(engine.engines[1].terminations, 0)
  await engine.run()
  assert.equal(engine.instances(), 2)
})

test('cancel during load aborts and disposes without reusing the engine', async () => {
  const engine = harness()
  const controller = new AbortController()
  const pending = engine.run(controller.signal)
  controller.abort()
  engine.dispose()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(engine.instances(), 1)
  assert.ok(engine.engines[0].terminations > 0)
  assert.equal(engine.engines[0].listeners.size, 0)
  await engine.run()
  assert.equal(engine.instances(), 2)
})

test('cancel during temporary file cleanup cannot cache the engine afterwards', async () => {
  const controller = new AbortController()
  let engine
  engine = harness([1000, 1000], {
    deleteFile(path) {
      if (path === 'input') {
        controller.abort()
        engine.dispose()
      }
    },
  })
  await assert.rejects(engine.run(controller.signal), { name: 'AbortError' })
  assert.ok(engine.engines[0].terminations > 0)
  assert.equal(engine.engines[0].listeners.size, 0)
  engine.dispose()
  await engine.run()
  assert.equal(engine.instances(), 2)
})
