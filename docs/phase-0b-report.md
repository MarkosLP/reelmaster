# Entrega · FASE 0B

## Estado

**PASS.** Contrato endurecido, once tests aprobados, nuevo MP4 renderizado e inspeccionado. FASE 1 no iniciada.

## Afirmaciones de Claude verificadas

La petición recibida contiene C1 y requisitos de endurecimiento; no se recibió otro archivo de auditoría con afirmaciones distintas. Se contrastan aquí todos los puntos señalados con el código original leído antes de modificarlo.

| Punto                                         | Veredicto           | Evidencia inicial y resolución                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1, transición aceptada que falla             | CONFIRMED           | Se añadió y ejecutó un test contra SceneSchema original antes de modificar producción. Falló en 32 pares: D=2F o D=2F+1, F=15…30. `docs/evidence/c1-before.txt` conserva salida. El compilador limita F a floor((D−2)/2).       |
| Tiempo canónico en frames                     | CONFIRMED           | WordSchema, SceneSchema y timeline usaban frames. Ahora dominio ms y conversión unidireccional.                                                                                                                                 |
| Audio global rígido                           | CONFIRMED           | CompositionSchema admitía solo test-tone.wav y Reel lo montaba globalmente. Ahora SceneAudio y tres archivos locales.                                                                                                           |
| Narración y duración independientes           | CONFIRMED           | durationFrames era autoría sin medición. Ahora target separado y duración final derivada de audio medido + padding.                                                                                                             |
| Grupos de cuatro y desaparición en silencios  | CONFIRMED           | SceneView usaba floor(active/4) y [] si active<0. Ahora líneas explícitas y visibilidad por intervalo de línea.                                                                                                                 |
| Estilo hardcodeado                            | PARTIALLY CONFIRMED | Accent ya era dato; colores/tamaño de captions no. Theme/captionStyle ahora controlan esas propiedades. Posiciones siguen siendo plantilla simple.                                                                              |
| Identidad y hash                              | CONFIRMED           | Existían id/revision pero hashes solo en documentación. Ahora hashes de inputs, bytes y snapshot diferenciados. Revision conserva finalidad de concurrencia futura.                                                             |
| FPS y dimensiones literales                   | CONFIRMED           | El schema imponía 30/1080/1920 y límite 1.800. Ahora perfil explícito y límites en ms.                                                                                                                                          |
| Falta compilador / transformación en renderer | CONFIRMED           | Reel calculaba timeline. Ahora compileCompositionSnapshot prepara todo fuera de composición.                                                                                                                                    |
| Parseo completo por frame                     | CONFIRMED           | Reel ejecutaba CompositionSchema.parse en su cuerpo. Ahora renderer no importa ni ejecuta Zod.                                                                                                                                  |
| Determinismo insuficientemente protegido      | PARTIALLY CONFIRMED | Dependencias exactas, lockfile y assets locales ya existían; no se encontraron Date.now/Math.random/fetch en composición. Faltaban engines/.nvmrc y reglas preventivas, ahora añadidos y probados.                              |
| Carga/fallback de fuentes                     | PARTIALLY CONFIRMED | Fuente local y licencia ya existían. Faltaba bloqueo explícito y fallback. Ahora carga FontFace con delayRender y cancelación ante fallo. Ausencia de caracteres españoles: NOT REPRODUCED; cmap contiene los nueve requeridos. |
| Bundle por Reel                               | CONFIRMED           | scripts/render.ts invocaba bundle en cada ejecución. Ahora build y render son comandos separados; render reutiliza bundle.                                                                                                      |
| Cobertura de tests insuficiente               | CONFIRMED           | Solo tres tests del modelo anterior. Ahora once tests y stills seleccionados.                                                                                                                                                   |
| Documentación vs contrato                     | CONFIRMED           | Había propuestas más amplias que el contrato implementado, aunque etiquetadas. architecture.md ahora especifica campos y límites ejecutables; futuro aislado al final.                                                          |

El primer intento de reproducción mediante código inline falló por quoting de PowerShell, no por Remotion. Se sustituyó por un archivo de test y esa ejecución sí demostró C1. El test histórico final usa el predicado antiguo congelado y exige los 32 fallos conocidos; los tests nuevos comprueban la corrección sin depender del schema antiguo.

## Cambios realizados

Contrato preparado de Reel en ms; audio por escena; captions enlazados al hash del audio; líneas explícitas; estilo como dato; perfil de render; compilador de snapshot; hash JSON canonicalizado; carga bloqueante de fuente; reglas ESLint; build separado; fixture con pausas y tres tonos locales. Sin proveedores ni persistencia.

## Nuevo modelo temporal

Milisegundos enteros en dominio. Autoría: targetDurationMs, padding y transición. Medición: audio.measuredDurationMs y precisión en muestras cuando exista. Duración final = audio + padding. Fronteras globales redondeadas una sola vez mediante el FPS del perfil, sin reconstruir ms desde frames. Reglas y límites exactos en [architecture.md](architecture.md).

## Nuevo modelo de audio

artifactId editable/referencial; inputHash de receta; contentHash SHA-256 de bytes; measuredDurationMs; precision opcional con durationSamples/sampleRate; mimeType y volumen. Cada escena monta su archivo dentro de Sequence. Verificación de hash antes de render. No TTS; no se atribuye alineación real a los tonos.

## Nuevo modelo de subtítulos

Tokens con ID, texto, intervalo ms, offsets UTF-16 y confidence opcional. Líneas con tokenIds e intervalo propio. Zod comprueba correspondencia de texto, orden, unicidad, referencias y límites. Pausas de 150ms en fixture; línea visible sin palabra activa. No agrupamiento por índice en renderer.

## Compilador de snapshot

compileCompositionSnapshot valida Reel y manifiesto, resuelve perfil/assets, calcula frames/offsets/duración, copia presentación y prepara líneas. La composición consume solo snapshot tipado. Snapshots externos arbitrarios no son una API admitida; el punto de entrada es el compilador.

## Determinismo

Node 22.19.0 (.nvmrc) / 22.19.x (engines), versiones exactas y lockfile. Fuente local con espera explícita y fallback defensivo. Reglas ESLint contra Date.now, Math.random, fetch, Date e imports de infraestructura/dominio/Node en composición; test confirma los rechazos. Snapshot idéntico y hash independiente del orden de claves. No se promete MP4 binariamente idéntico entre sistemas.

## Tests añadidos

Once tests: reproducción histórica C1; reglas ESLint; conversión ms/frame; target vs medición; redondeo sin deriva acumulada; rechazos de datos incoherentes; sustitución local de audio y cambio de estilo; líneas durante silencio; snapshot/hash determinista; offsets españoles; barrido de fronteras de transición (duraciones 1.000–2.100ms, paso 1ms y fundidos en límites). Sin librería de property testing adicional.

Stills generados: frames 18,45,119,120,165,285 y prueba española. Frame 45 cae en pausa entre tokens y comprueba que la línea no desaparece. Frame 119/120 comprueba límite de fundido. La fuente contiene á, é, í, ó, ú, ü, ñ, ¿, ¡ según auditoría cmap.

## Validaciones ejecutadas

| Comando                                                        | Resultado                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsx --test tests/audit-baseline.test.ts` antes del cambio | FAIL esperado, C1 reproducido con 32 combinaciones                                                                                             |
| `npm ci`                                                       | PASS al reintentar; primer intento EBUSY de Windows en fast-uri; segundo instaló 344 paquetes, 345 auditados, cero vulnerabilidades informadas |
| `npm run lint`                                                 | PASS                                                                                                                                           |
| `npm run typecheck`                                            | PASS                                                                                                                                           |
| `npm test`                                                     | PASS, 11/11                                                                                                                                    |
| `npm run format:check`                                         | PASS                                                                                                                                           |
| `python scripts/verify-font.py`                                | PASS, nueve codepoints presentes; herramienta opcional disponible en este entorno                                                              |
| `npm run build:renderer`                                       | PASS, bundle separado en build/renderer                                                                                                        |
| `npm run discover`                                             | PASS, ReelDemo 1080×1920, 30 FPS, 360 frames                                                                                                   |

## Render final

`out/reel-demo.mp4`: **1080×1920, 30 FPS, 360 frames, vídeo de 12 segundos**, contenedor de 12,053333 segundos. H.264, yuv420p, BT.709, rango TV; pista AAC presente. **1.897.332 bytes (1,90 MB)**. `npm run render`: PASS. FFprobe: PASS; salida completa en `out/ffprobe.json`. Hash de snapshot y entorno en `out/validation.json`.

```powershell
& './node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe' -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration,nb_frames,pix_fmt,color_range -show_entries format=duration,size -of json out/reel-demo.mp4
```

Se inspeccionaron visualmente frames 45,165,285,120 y spanish.png: texto legible sin recortes en las tres escenas, línea conservada durante la pausa, fondo limpio en la frontera del fundido y los nueve caracteres españoles correctos. No se afirma escucha de audio ni revisión visual de cada frame.

La primera captura española reutilizaba la composición descubierta con props anteriores y no mostraba el cambio de texto. Se corrigió descubriendo de nuevo la composición con el snapshot español y se repitieron los stills (`npx tsx scripts/render.ts --stills`: PASS), verificando visualmente el resultado. El MP4 no necesitaba repetición por este arreglo de la captura auxiliar. Lint, typecheck y formato volvieron a pasar tras el arreglo.

## Archivos modificados

- Modificados: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `README.md`, `docs/architecture.md`.
- Modificados: `src/domain/reel.ts`, `src/fixtures/demo.ts`, `src/composition/{index.tsx,Reel.tsx,SceneView.tsx}`, `scripts/{audio.ts,render.ts}`, `tests/domain.test.ts`.
- Añadidos: `.nvmrc`, `src/snapshot/{types.ts,compile.ts,hash.ts}`, `src/composition/{fonts.ts,timing.ts}`.
- Añadidos: `scripts/{prepare.ts,build-renderer.ts,verify-font.py}`, `tests/{audit-baseline.test.ts,determinism.test.ts}`.
- Añadidos: `src/fixtures/{assets.json,snapshot.json}`, `public/audio/scene-0.wav`, `scene-1.wav`, `scene-2.wav`.
- Añadidos: `docs/evidence/c1-before.txt`, `docs/phase-0b-report.md`.
- Eliminado: `public/test-tone.wav`, sustituido por audio por escena.
- Generados: `build/renderer/`, MP4, metadatos y stills en `out/` (ignorados por Git).

## Deuda técnica restante

Contrato solo para escenas preparadas con audio; aún falta un modelo de borrador. La validación de hashes no sustituye inspección general de archivos no confiables. Subtokens inferiores a un frame conservan texto pero pueden no tener resaltado; líneas que colapsan se omiten. No se ha demostrado sincronización semántica con voz, escalabilidad, recuperación de jobs ni identidad binaria de renders. El bundle local incluye assets de prueba; nuevos assets necesitan rebuild hasta añadir materialización en el worker futuro. Reglas ESLint directas no son sandbox contra alias deliberados. Fijar SO, navegador y encoder sigue pendiente para reproducibilidad entre entornos.

## Qué pertenece expresamente a Fase 1

Solo con autorización: voz real, proveedores, alineación, medición de duración/coste y diseño del siguiente incremento. Persistencia, workers, jobs, credenciales, auth, pagos, generación visual y publicación siguen fuera de FASE 0B; no se han implementado. No se presupone que todos deban entrar juntos en FASE 1.
