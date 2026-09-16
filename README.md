# Ligero · Compresor de video local

Aplicación React + TypeScript + Vite + Tailwind CSS. Comprime con FFmpeg.wasm en un Web Worker, sin API, cuentas, anuncios ni subidas de videos.

## 1. Instalar y ejecutar

Requiere Node.js 22.12 o superior compatible con Vite 8 y npm.

```sh
npm ci
npm run dev
```

Abre la dirección local que muestra Vite. Para reconstruir las dependencias manualmente, el proyecto utiliza:

```sh
npm install react react-dom @ffmpeg/ffmpeg @ffmpeg/util @ffmpeg/core lucide-react
npm install -D vite typescript @vitejs/plugin-react tailwindcss @tailwindcss/vite oxlint @types/node @types/react @types/react-dom
```

No son necesarios FFmpeg nativo ni un backend para usar la aplicación.

## 2. Organización del código

- `src/App.tsx`: selección y arrastre de video, ajustes, vista previa, progreso, cancelación, errores y descarga. Gestiona los AbortController y libera las URL de objetos.
- `src/compressor.ts`: carga diferida del núcleo local, análisis con FFprobe, cálculo del bitrate, codificación H.264/AAC y generación del Blob MP4. Cada operación tiene su propio Worker, que se termina al finalizar o cancelar para liberar memoria.
- `src/index.css`: Tailwind CSS 4, estilos responsivos y estados accesibles con movimiento reducido.
- `vite.config.ts`: plugins y cabeceras de aislamiento en desarrollo y preview; exclusión de FFmpeg del prebundling.
- `vercel.json` / `netlify.toml`: compilación estática, directorio de publicación y cabeceras de producción.

## 3. Cómo se comprime

1. Selecciona o arrastra un video de hasta 500 MB.
2. Introduce un objetivo en MB decimales (1 MB = 1.000.000 bytes) o utiliza 25, 50 o 100 MB.
3. Selecciona 720p, 1080p u original. Se limita la altura sin ampliar videos pequeños y se utilizan dimensiones pares compatibles con H.264.
4. El motor, servido desde el mismo sitio, se carga al pulsar Comprimir. El WASM pesa aproximadamente 32 MB antes de la compresión HTTP.
5. FFprobe obtiene la duración y verifica que exista video, incluso si el navegador no puede reproducir el original.
6. El presupuesto es `min(objetivoBytes, originalBytes) × 0,95`. El bitrate de video en kbps es `floor(presupuesto × 8 / duración / 1000 − 96)`. Los 96 kbps se reservan para audio AAC. Un bitrate de video menor que 50 kbps se rechaza.
7. FFmpeg utiliza `libx264`, preset `veryfast`, `yuv420p`, audio AAC y `+faststart`. Se conserva la primera pista de video y, si existe, la primera de audio. No se incluyen subtítulos ni metadatos globales.
8. Los eventos de progreso y los tiempos de los logs actualizan la barra. Al terminar, se ofrece el MP4 y se informa el peso real.

El tamaño es **aproximado**, no un límite garantizado. Una codificación de una pasada puede excederlo, especialmente en clips cortos. La interfaz avisa si supera el objetivo. Usa un margen adicional para mensajería y verifica el límite vigente de tu aplicación. No se asegura una reducción para todo video: algunos originales ya están muy comprimidos.

El núcleo 0.12.10 puede devolver `-1` desde FFprobe aun generando un JSON válido. Se admiten 0 y -1, pero se verifican el JSON, la pista de video y una duración positiva antes de codificar.

## 4. Verificaciones y build

```sh
npm run lint
npx tsc -b
npm run build
npm run preview
```

El build genera `dist/`, incluyendo el JavaScript y el WASM de `@ffmpeg/core` como assets locales. No se necesita un CDN. Prueba también la compresión desde preview antes de publicar.

Prueba manual recomendada: carga un MP4 con audio, comprime a un objetivo inferior al original, descarga y reproduce el resultado; cancela otra operación y vuelve a intentarlo. Repite con un AVI, un video sin audio y un archivo inválido. Comprueba el peso real y el diseño en móvil.

## 5. Desplegar en Vercel

1. Publica el repositorio en tu proveedor Git e impórtalo desde Vercel.
2. Selecciona Vite y Node.js 22 compatible (22.12 o posterior).
3. Usa `npm run build` como comando de compilación y `dist` como salida.
4. Despliega. `vercel.json` aplica las cabeceras a todos los recursos. No se requieren variables de entorno.

## 6. Desplegar en Netlify

1. Importa el repositorio desde Git en Netlify.
2. Usa una versión de Node.js compatible con Vite 8.
3. Netlify lee `netlify.toml`: comando `npm run build`, directorio `dist` y cabeceras de seguridad.
4. Despliega por HTTPS. Para una subida manual de `dist`, configura también las cabeceras en el hosting; no basta con copiar el HTML.

Ambas plataformas ofrecen planes gratuitos sujetos a sus condiciones y cuotas. Los videos no consumen almacenamiento del servidor; las descargas del WASM sí consumen transferencia del hosting.

## 7. Cabeceras y compatibilidad

El documento y los recursos deben servirse con:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Comprueba `window.crossOriginIsolated === true` en la consola. Usa localhost o HTTPS, no `file://`. Los navegadores integrados o iframes de terceros pueden impedir el aislamiento: abre la aplicación en una pestaña normal.

Se utiliza `@ffmpeg/core` de **un solo hilo**, que no necesita SharedArrayBuffer por sí mismo. Se incluyen y verifican las cabeceras solicitadas; son necesarias para una futura variante multihilo. El procesamiento sigue fuera del hilo de la interfaz.

FFmpeg.wasm es más lento y consume más memoria que FFmpeg nativo. Los 500 MB son un límite preventivo, no una garantía: en móviles el navegador puede quedarse sin memoria con archivos menores. Mantén la pestaña abierta y prueba con clips más pequeños cuando sea necesario. La vista previa depende de los codecs del navegador, pero la compresión depende de los codecs incluidos en FFmpeg.

Si redistribuyes el motor, revisa las obligaciones de licencia de FFmpeg y sus codecs; `@ffmpeg/core` declara GPL-2.0-or-later.
