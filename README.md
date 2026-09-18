# Ligero.Tools

Una aplicación web de herramientas sencillas, construida con React, TypeScript y Vite. El catálogo está en `/`; por ahora solo está disponible el compresor en `/comprimir-video`. No hay backend, cuentas, base de datos ni dependencias nuevas para la plataforma.

## Compresor

Ligero.Compressor procesa videos localmente con FFmpeg.wasm. Acepta un video de hasta 500 MB, permite elegir un presupuesto en MB decimales y descargar MP4 (H.264 + AAC cuando hay audio). La resolución se ajusta automáticamente, con un máximo de 720p; no hay selector de resolución. El objetivo es un presupuesto, no un tamaño exacto garantizado.

Conserva presets, progreso, errores, cancelación y modo rápido opcional de hasta cuatro hilos. El motor del modo elegido se carga al comprimir, reutiliza una instancia entre trabajos y elimina archivos temporales y listeners. Al salir de la herramienta se cancela el trabajo, se libera el motor y se revocan las URLs de vista previa y descarga. Volver a entrar inicia un estado nuevo.

## Desarrollo y verificación

```sh
npm ci
npm run dev
npm run lint
npx tsc -b
npm run build
node --test compressor.test.mjs platform.test.mjs
npm run preview
```

`build` también ejecuta los checks de TypeScript. Usa el servidor preview para probar producción, no abras `dist/index.html` directamente.

Las pruebas usan `node:test`, TypeScript y mocks, sin otro framework. Las del motor cubren progreso, reutilización, reintentos, cancelación y liberación; no ejecutan FFmpeg real. Las de plataforma cubren metadatos, rutas, enlaces, marcas y el límite de imports diferidos. La compresión real, los workers, WebAssembly y la descarga requieren una prueba en navegador.

## Estructura y límites

```text
src/
  App.tsx                         Layout, selección de página y metadatos del documento
  app/toolPages.ts                Entradas React.lazy, por ID de herramienta
  app/PageBoundary.tsx            Error de página sin perder la navegación
  app/platform.css                Estilos del catálogo y layout
  catalog/tools.ts                Metadatos públicos y resolución de rutas
  catalog/router.ts              Adaptador pequeño de History API
  catalog/HomePage.tsx            Catálogo responsive
  shared/Header.tsx               Marca parametrizada y tema persistente
  shared/AppLink.tsx              Enlace nativo con navegación interna
  tools/compressor/
    CompressorPage.tsx            Estado, validación, archivos y presentación
    compressor.css                Estilos aislados y cargados con la herramienta
  compressor.ts                   Motor existente, exclusivo del compresor
  index.css                       Base visual y estilos compartidos
```

Vite/React no proporciona rutas basadas en archivos y este proyecto no tenía router. Se usa History API con `popstate`, enlaces reales y soporte de atrás/adelante; no se agrega una biblioteca para estas rutas planas. `App` mantiene el header fuera de Suspense y del límite de errores. El foco pasa al contenido al navegar y hay enlace para saltar la navegación.

El registro solo contiene datos e iconos ligeros: nunca importa páginas, motores o clientes de API. La tabla `toolPages` hace imports dinámicos. El catálogo no carga el código del compresor ni su motor. Los estilos de herramienta deben estar acotados a su clase raíz, porque el CSS descargado puede permanecer después de navegar.

## Agregar la próxima herramienta

1. Crea `src/tools/<herramienta>/<Nombre>Page.tsx` con un componente exportado por defecto, su estado local y su CSS aislado. La página aporta contenido y un `h1`, no otro header, footer ni `main`.
2. Añade una entrada a `src/catalog/tools.ts`: `id` estable, `path` único (absoluto y sin barra final), `name`, `brandSuffix`, `description`, `category` e `icon`. Esto define su ruta, tarjeta e identidad. Registra solo herramientas disponibles, no placeholders.
3. Asocia ese ID a `lazy(() => import('../tools/<herramienta>/<Nombre>Page'))` en `src/app/toolPages.ts`. TypeScript exige una página por ID. No hace falta modificar `App`, el header ni otra herramienta.
4. Define el sufijo explícitamente, independiente del nombre y la URL: `QR` produce **Ligero.QR**, `Downloader` produce **Ligero.Downloader**. La home usa **Ligero.Tools**. QR y Downloader no están implementados ni registrados todavía.
5. Reutiliza el layout y `AppLink` para navegación interna; usa enlaces normales para descargas, anclas y URLs externas. Mantén el tema `ligero-tema` y los estados de foco accesibles.
6. Importa dependencias pesadas únicamente desde la página diferida o al iniciar la operación. Limpia workers, peticiones (`AbortController`), timers y URLs al desmontar. Maneja los errores de trabajo dentro de la herramienta; el límite de página protege fallos de carga/renderizado.
7. Ejecuta lint, tipos, build y pruebas. Verifica ida/vuelta, atrás/adelante, entrada directa y recarga, header, errores, descarga si corresponde, móvil/escritorio, teclado y ambos temas. Comprueba en Network que la home fresca no descarga el nuevo motor.

La lógica de negocio, validaciones, formatos, estado y clientes de API pertenecen a cada herramienta. Comparte componentes o utilidades solo cuando exista reutilización real; no importes una herramienta desde otra ni añadas estado global para trabajo local. Una herramienta futura puede tener su propio cliente de API sin afectar a las demás. No se implementa esa infraestructura ahora, y no deben extenderse a otras herramientas las garantías de procesamiento local del compresor.

## Rutas, workers y despliegue

Netlify y Vercel publican `dist` y tienen fallback a `index.html` para navegación SPA; los assets existentes se sirven como archivos. Vite dev/preview también resuelve rutas de la SPA. Una URL desconocida muestra la página «Esta página no existe» con retorno al catálogo; el fallback estático responde HTTP 200, no un 404 del servidor.

Se conservan COOP `same-origin` y COEP `require-corp` en Vite, Netlify y Vercel. El modo rápido requiere además `crossOriginIsolated` y `SharedArrayBuffer`. Se conserva `optimizeDeps.exclude` para `@ffmpeg/ffmpeg` y `@ffmpeg/util`, los assets `?url` y el worker multihilo `?url&no-inline`. Los recursos emitidos por Vite se referencian desde la raíz y no dependen de la ruta de la página.

En otro hosting, configura fallback SPA sin reemplazar assets por HTML y las mismas cabeceras. Comprueba MIME de WASM/JS, acceso directo, recarga y ambos modos del compresor en el destino real. No se realizó ningún despliegue como parte de esta migración.
