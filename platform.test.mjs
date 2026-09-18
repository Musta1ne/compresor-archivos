import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const root = new URL('./src/', import.meta.url)

function harness() {
  const listeners = new Map()
  const entries = []
  const location = { pathname: '/', search: '', hash: '', href: 'http://localhost/', origin: 'http://localhost' }
  const window = {
    location,
    matchMedia: () => ({ matches: false }),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: (event) => listeners.delete(event),
    dispatchEvent: (event) => { listeners.get(event.type)?.() },
    history: { pushState: (_state, _unused, path) => { entries.push(path); Object.assign(location, { pathname: path, search: '', hash: '' }) } },
  }
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const exports = {}
    cache.set(path, exports)
    const source = readFileSync(path, 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(compiled, {
      exports, window, URL, localStorage: { getItem: () => null },
      PopStateEvent: class { constructor(type) { this.type = type } },
      require(name) {
        assert.ok(!name.includes('ffmpeg') && !name.includes('compressor'), `Unexpected heavy module: ${name}`)
        if (!name.startsWith('.')) return require(name)
        const base = resolve(dirname(path), name)
        const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync)
        assert.ok(file, `Module not found: ${name}`)
        return load(file)
      },
    })
    return exports
  }
  return { load: (path) => load(new URL(path, root).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), entries, window }
}

test('catalog routes and identities are unique and resolve only registered tools', () => {
  const { tools, findTool } = harness().load('catalog/tools.ts')
  assert.equal(new Set(tools.map((tool) => tool.id)).size, tools.length)
  assert.equal(new Set(tools.map((tool) => tool.path)).size, tools.length)
  for (const tool of tools) {
    assert.match(tool.path, /^\/[^/]+$/)
    for (const key of ['id', 'name', 'brandSuffix', 'description', 'category']) assert.ok(tool[key])
    assert.equal(findTool(tool.path), tool)
    assert.equal(findTool(`${tool.path}/`), tool)
  }
  assert.equal(findTool('/comprimir-video').brandSuffix, 'Compressor')
  assert.equal(findTool('/'), undefined)
  assert.equal(findTool('/comprimir-video/otra'), undefined)
  assert.equal(findTool('/no-existe'), undefined)
})

test('home renders only available tools without importing processing code', () => {
  const app = harness()
  const { HomePage } = app.load('catalog/HomePage.tsx')
  const { tools } = app.load('catalog/tools.ts')
  const html = renderToStaticMarkup(createElement(HomePage))
  assert.equal((html.match(/class="tool-card"/g) ?? []).length, tools.length)
  for (const tool of tools) assert.ok(html.includes(`href="${tool.path}"`))
})

test('header takes explicit suffix regardless of route and retains catalog navigation', () => {
  const { Header } = harness().load('shared/Header.tsx')
  for (const brandSuffix of ['Tools', 'Compressor', 'QR', 'Downloader', 'Otro']) {
    const isHome = brandSuffix === 'Tools'
    const html = renderToStaticMarkup(createElement(Header, { brandSuffix, isHome }))
    assert.ok(html.includes(`Ligero.${brandSuffix} — Ir al catálogo`))
    assert.ok(html.includes('href="/"'))
    assert.equal(html.includes('Volver al catálogo'), !isHome)
  }
})

test('internal links navigate while modified, external, anchor and download links stay native', () => {
  const app = harness()
  const { AppLink } = app.load('shared/AppLink.tsx')
  function click(props, eventProps = {}) {
    const event = { button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, ...eventProps }
    AppLink(props).props.onClick(event)
    return event.defaultPrevented
  }
  assert.equal(click({ href: '/comprimir-video' }), true)
  assert.equal(app.window.location.pathname, '/comprimir-video')
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) assert.equal(click({ href: '/' }, { [modifier]: true }), false)
  for (const props of [{ href: '/', target: '_blank' }, { href: '/', download: '' }, { href: '#contenido' }, { href: 'https://example.org/' }]) assert.equal(click(props), false)
  assert.equal(click({ href: '/' }, { button: 1 }), false)
  assert.equal(app.entries.length, 1)
})

test('navigation does not add duplicate history entries and notifies subscribers', () => {
  const app = harness()
  const { navigate } = app.load('catalog/router.ts')
  let notifications = 0
  app.window.addEventListener('popstate', () => notifications++)
  navigate('/')
  assert.equal(app.entries.length, 0)
  navigate('/comprimir-video')
  navigate('/comprimir-video')
  navigate('/')
  assert.deepEqual(app.entries, ['/comprimir-video', '/'])
  assert.equal(notifications, 2)
})

test('every catalog tool has a lazy module entry without eager page imports', () => {
  const { tools } = harness().load('catalog/tools.ts')
  const source = readFileSync(new URL('app/toolPages.ts', root), 'utf8')
  const file = ts.createSourceFile('toolPages.ts', source, ts.ScriptTarget.Latest, true)
  const lazyIds = []
  function visit(node) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) assert.equal(node.moduleSpecifier.text, 'react')
    if (ts.isPropertyAssignment(node)) {
      assert.ok(ts.isCallExpression(node.initializer))
      assert.equal(node.initializer.expression.getText(file), 'lazy')
      const loader = node.initializer.arguments[0]
      assert.ok(ts.isArrowFunction(loader) && ts.isCallExpression(loader.body))
      assert.equal(loader.body.expression.kind, ts.SyntaxKind.ImportKeyword)
      const modulePath = loader.body.arguments[0].text
      assert.ok(existsSync(new URL(`app/${modulePath}.tsx`, root)))
      lazyIds.push(node.name.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.deepEqual(lazyIds.sort(), Array.from(tools, (tool) => tool.id).sort())
})
