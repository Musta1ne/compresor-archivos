import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('./src/compressor.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

function harness(outputSizes = [1000, 1000]) {
  let instances = 0
  let executions = 0
  const exports = {}
  class FFmpeg {
    loaded = false
    listeners = new Map()
    constructor() { instances++ }
    on(event, callback) { this.listeners.set(event, callback) }
    off(event) { this.listeners.delete(event) }
    async load() { this.loaded = true }
    async writeFile() {}
    async deleteFile() {}
    async ffprobe() { return 0 }
    terminate() { this.loaded = false }
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
  const run = async () => {
    const updates = []
    await exports.compressVideo({ size: 2_000_000 }, { targetMB: 1 }, (update) => updates.push(update), new AbortController().signal)
    return updates
  }
  return { run, instances: () => instances }
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
