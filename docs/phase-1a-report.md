# Entrega de FASE 1A

## Estado

**PASS WITH ISSUES.** Pipeline local completo y MP4 real generados. La limitación principal es la precisión de los tiempos estimados: no existe alineación acústica por palabra ni validación auditiva humana realizada por el agente. FASE 1B no iniciada.

## Audio original detectado

`D:\Descargas\ReelMaster\VozMarcos.m4a`, extensión .m4a, contenedor M4A/MP4 (familia mov/mp4/m4a, marca mp42), una pista AAC, 23,168 s, 48.000 Hz, estéreo, bitrate de pista 192.096 bit/s; contenedor 202.387 bit/s; 586.115 bytes. Decodificación completa con FFmpeg: PASS.

SHA-256 antes y después: `625e39714ca1a420b2442b4a387ce9b736e46b76f4c3117be04fbd1b50d9b231`. El archivo original permanece intacto. Su detección e inspección precedieron a los cambios de código.

## VoiceProfile Marcos

VoiceProfile validado por Zod: id propio, nombre, locale, source y binding opcional. Marcos utiliza `voice-marcos`, `Marcos`, `es-ES`, `recorded-reference`, sin binding. Default del Reel y referencia en cada SceneAudio. Ninguna ruta ni ID de empresa define la identidad de Marcos. Los campos nuevos son opcionales para conservar el baseline sintético 0B.

## Preparación de audio

FFmpeg local mide sonoridad, normaliza en dos pasadas y genera `.local/marcos/normalized.wav`: PCM16, 48 kHz, dos canales conservados de la fuente. Objetivo −16 LUFS, −1,5 dBTP; resultado medido aproximadamente −16,31 LUFS / −1,50 dBTP. FFmpeg utiliza modo dinámico para respetar el techo de picos. No cambia velocidad ni recorta silencios originales; se mantiene el número de muestras fuente.

Genera cinco WAV segmentados en `.local/marcos/audio/`. Mediciones, hashes, receta, versión y límites quedan en `.local/marcos/preparation.json`. Solo existe un normalizado compartido; no hay copias personales en public ni bundle.

## Modelo temporal

1.112.064 muestras a 48 kHz → 23.168 ms medidos. Cada archivo de escena se mide individualmente: 4.985, 4.709, 6.610, 5.155 y 1.709 ms. El target de 5.000 ms expresa intención, no fuerza el audio. Padding de escena cero. El compilador existente convierte fronteras globales a 30 FPS: 695 frames. El dominio sigue en milisegundos enteros y conserva precisión de muestras.

## Alineación

**MEASURED:** muestras/duración de archivos y pausas por detección acústica de baja energía.

**ESTIMATED:** tiempos de tokens y, por derivación, líneas. Un AlignmentProvider local distribuye el transcript conocido, ponderado por grupos de vocales españolas, sobre regiones de habla. Método `es-syllables-speech-regions-v1`, registrado por artifact en prepared.json. Confidence no se inventa. No hay timings ALIGNED en esta fase.

No se encontraron alineadores/modelos locales entre las capacidades inspeccionadas. No se descargaron modelos. La alternativa provisional está autorizada por las especificaciones: puede desviarse centenares de milisegundos o más dentro de un párrafo. No hay error acústico por palabra medido ni garantía de karaoke. Ver [decisiones y contrato](audio-phase-1a.md).

## Subtítulos

Transcript aportado por Marcos, sin STT. Tokenización conserva puntuación, caracteres españoles y offsets UTF-16. Grupos preparados antes del renderer, máximo cuatro palabras y 26 caracteres para este fixture; permanencia de hasta 500 ms en pausas sin invadir otra línea. Texto centrado, 56 px en canvas 1080, blanco y alto contraste. HighlightActive=false evita aparentar precisión de palabra activa.

## Escenas

Un párrafo por escena. Cuatro pausas internas ≥460 ms definen los cortes, en sus puntos medios: 4.985, 9.694, 16.304 y 21.459 ms desde el inicio. La grabación se reconoce por hash y se exige el número esperado de pausas; no se extrapola esta receta a cualquier audio.

Los tests comprueban cortes dentro de pausas y reconstrucción exacta de todas las muestras del normalizado al concatenar los cinco segmentos. El redondeo a frames puede cambiar las pausas unos milisegundos; no hay conversión inversa al dominio. Los subtítulos de cada escena son relativos a ella.

## Privacidad

El audio no se subió ni se envió a un proveedor; no hubo clonación, entrenamiento, STT ni APIs. Original en raíz, derivados en `.local/marcos/`, outputs con voz en `out/marcos/`; todos excluidos de Git por reglas específicas/existentes.

El acceso del renderer a los segmentos fue exclusivamente por loopback 127.0.0.1, con allowlist de archivos, hash verificado, ruta temporal no registrada y servidor cerrado al finalizar. No se expuso a LAN ni se añadieron rutas públicas de producto. No hay bytes/base64 de audio en logs. El bundle inspeccionado solo contiene Inter/licencia y tonos sintéticos del baseline, no archivos de Marcos.

Los comandos de esta fase precargan un bloqueo de TCP externo en Node; se prueba que rechaza una conexión antes de intentarla. Navegador local explícito, sin descarga automática. npm ci se ejecutó offline con caché existente. No se hizo captura global de tráfico del SO ni se presenta esta protección como firewall del sistema.

## Tests

**19/19 PASS.** Once tests conservados de 0B y ocho de FASE 1A:

1. Detección/inspección del original y hash inalterado.
2. Normalización PCM medida, sonoridad y reconstrucción exacta de muestras por escenas.
3. Repreparación con hashes de audio idénticos.
4. VoiceProfile Marcos desacoplado, default y audio independiente por escena; referencia desconocida rechazada.
5. Transcript/tokenización/puntuación/español/offsets.
6. Procedencia estimada, tokens ordenados, líneas válidas, pausas, duración total y snapshot determinista.
7. Servicio privado por loopback/allowlist y ausencia de audio personal en public.
8. Rechazo de conexión TCP externa antes de realizarla.

## Validaciones

| Comando                                                       | Resultado                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm ci` con npm_config_offline=true, audit=false, fund=false | PASS, 344 paquetes instalados desde caché; sin consulta de auditoría remota |
| `npm run lint`                                                | PASS                                                                        |
| `npm run typecheck`                                           | PASS                                                                        |
| `npm test`                                                    | PASS, 19/19                                                                 |
| `npm run format:check`                                        | PASS                                                                        |
| `npm run prepare:marcos`                                      | PASS, 5 escenas y 23.168 ms medidos                                         |
| `npm run build:renderer`                                      | PASS, build sin audio personal                                              |
| `npm run discover`                                            | PASS, ReelDemo, 1080×1920, 30 FPS, 695 frames                               |
| `npm run render`                                              | PASS, nuevo MP4 y cinco stills                                              |
| FFprobe del MP4                                               | PASS, dos pistas y parámetros verificados                                   |
| FFmpeg decodificación de pista final de audio                 | PASS                                                                        |

Comando de inspección final:

```powershell
& './node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe' -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames,sample_rate,channels -show_entries format=duration,size -of json out/marcos/reel-marcos.mp4
```

Incidencias resueltas durante desarrollo: el binario FFmpeg incluido no contiene volumedetect; se utilizó loudnorm disponible. ESLint exigió importar process explícitamente en el guard .mjs. El test de guard requirió convertir la ruta Windows a file URL para --import. Los comandos volvieron a pasar tras corregirlos.

## Render final

`out/marcos/reel-marcos.mp4`: **1080×1920, 9:16, 30 FPS, 695 frames**, vídeo H.264 de **23,166667 s**, pista AAC estéreo a **48 kHz** de 23,210667 s; duración de contenedor **23,210667 s**. **2.841.200 bytes (2,84 MB)**. yuv420p / BT.709.

La diferencia de duración de contenedor incluye padding AAC; no se fuerza la duración anterior de 12 s. Los metadatos completos están en out/marcos/validation.json y ffprobe.json. Se inspeccionaron visualmente las capturas de escenas 0,2,4: títulos y subtítulos sin recortes y con buen contraste. No se afirma escucha subjetiva de voz o revisión frame a frame.

Snapshot SHA-256: `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`, idéntico después de volver a preparar el fixture. El registro adicional de procedencia no altera ese snapshot ni requiere un nuevo render.

## Rendimiento

Última preparación medida: **3,023 s**, incluyendo inspección, normalización, segmentación y mediciones. Render MP4: **58,317 s**, sin incluir build ni stills, concurrencia 2. No es un benchmark de carga. API cost = **0**. Node 22.19.0, Remotion 4.0.523, FFmpeg n7.1.

## Archivos modificados

Modificados:

- `.gitignore`
- `.prettierignore`
- `eslint.config.mjs`
- `package.json`
- `README.md`
- `docs/architecture.md`
- `scripts/render.ts`
- `src/domain/reel.ts`
- `src/composition/Reel.tsx`
- `src/composition/SceneView.tsx`

Añadidos:

- `docs/audio-phase-1a.md`
- `docs/phase-1a-report.md`
- `scripts/local-only.mjs`
- `scripts/prepare-marcos.ts`
- `scripts/render-baseline.ts` (copia conservada del script 0B)
- `src/domain/voice.ts`
- `src/fixtures/marcos.ts`
- `src/ports/alignment.ts`
- `src/ports/prepared-audio.ts`
- `src/application/captions.ts`
- `src/application/prepare-marcos.ts`
- `src/infrastructure/alignment/local-estimator.ts`
- `src/infrastructure/audio/browser.ts`
- `src/infrastructure/audio/ffmpeg.ts`
- `src/infrastructure/audio/inspect.ts`
- `src/infrastructure/audio/prepare.ts`
- `src/infrastructure/audio/private-server.ts`
- `tests/marcos.test.ts`

Generados locales, fuera de Git:

- `.local/marcos/normalized.wav`
- `.local/marcos/audio/marcos-0.wav` a `marcos-4.wav`
- `.local/marcos/preparation.json`, `prepared.json`, `snapshot.json`
- `.local/tools/chrome-headless-shell-win64/` (copia de navegador ya instalado, no audio)
- `build/renderer/` reconstruido sin audio de Marcos
- `out/marcos/reel-marcos.mp4`, `validation.json`, `ffprobe.json`
- `out/marcos/marcos-scene-0.png` a `marcos-scene-4.png`

El original VozMarcos.m4a no fue creado ni modificado por esta fase. No se añadieron dependencias npm; package-lock conserva el conjunto instalado. Los informes de 0/0B se mantienen históricos.

## Deuda técnica restante

Timings estimados sin precisión acústica por palabra medida; revisión auditiva humana pendiente. Segmentación de fixture reconocida por hash, no algoritmo general. Adaptador multimedia limitado a Windows x64 y navegador local requerido. Un token futuro demasiado largo necesitaría política de layout. El puerto local es síncrono; una implementación remota futura podría requerir firma asíncrona. No hay garantía de MP4 binariamente idéntico entre entornos, aunque audio preparado y snapshot sí se comprobaron deterministas aquí.

## Qué pertenece a FASE 1B

Revisar el MP4 junto a Marcos y decidir qué precisión de sincronización exige el producto. Solo con nuevas especificaciones, evaluar el siguiente mecanismo de alineación o generación de voz conservando VoiceProfile y artifacts por escena. No se instaló ni probó proveedor externo; no se implementaron clonación, avatar, persistencia, jobs, workers ni ninguna otra fase.
