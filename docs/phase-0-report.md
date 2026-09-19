# Entrega de FASE 0

## Estado

PASS. Arquitectura propuesta y motor mínimo ejecutado. Sin avance a FASE 1.

## Arquitectura propuesta

Ver [architecture.md](architecture.md): separación entre dominio, generación, composición, render y almacenamiento; diseño de contratos, jobs, caché, reintentos, seguridad y costes. Next.js/React/TypeScript/Tailwind para la futura web, PostgreSQL/Supabase y Storage para persistencia, worker independiente para tareas largas. En esta fase únicamente se instala el motor.

## Decisiones técnicas

Remotion 4.0.523 compone y renderiza. FFmpeg realiza procesamiento y codificación multimedia; no se duplica el layout en filtros. Dependencias exactas y lockfile, fuente local Inter con licencia, animaciones basadas únicamente en fotogramas. Exportación con H.264, AAC, yuv420p, BT.709 y frames PNG. El audio es una señal sintética local reproducible, no voz.

## Modelo de datos

Implementados ReelCompositionData, Scene, palabras y timeline con Zod estricto, límites temporales y escenas identificadas de manera estable. Propuestos, aún sin persistencia: ReelProject, revisiones, AudioArtifact, CaptionArtifact, RenderArtifact y puertos de proveedores. La documentación distingue ambos alcances. Los subtítulos son relativos a cada escena y el inicio global se deriva, para conservar las escenas posteriores al editar una duración.

## Pipeline

Datos de prueba → validación → bundle → descubrimiento de ReelDemo → render programático → inspección de metadatos y captura. La generación IA y el pipeline asíncrono futuro están diseñados, no ejecutados.

## Prueba de render

Resultado final: **1080 × 1920, 30 FPS, 360 fotogramas, vídeo de 12 segundos, contenedor de 12,053333 segundos y 1.868.206 bytes (1,87 MB)**. H.264/AAC, yuv420p y BT.709 confirmados por inspección del archivo.

`out/reel-demo.mp4`: tres escenas de cuatro segundos, texto animado, motivos gráficos, fundidos al fondo, subtítulos simulados por palabra y pista sonora de prueba. `out/preview.png` fue inspeccionado visualmente para verificar el encaje de la primera escena. No se afirma revisión visual exhaustiva ni escucha de la pista de audio. Metadatos finales en `out/validation.json`; inspección adicional de pistas en `out/ffprobe.json`.

## Validaciones ejecutadas

| Comando                                                            | Resultado                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm install --save-exact ...` y `npm install -D --save-exact ...` | Dependencias instaladas; versiones en package.json y lockfile                |
| `npm ci`                                                           | PASS, 344 paquetes añadidos, 345 auditados, cero vulnerabilidades informadas |
| `npm run audio`                                                    | PASS, WAV local de 12 segundos generado                                      |
| `npm run lint`                                                     | PASS                                                                         |
| `npm run typecheck`                                                | PASS tras corregir posible duración nula                                     |
| `npm test`                                                         | PASS, 3 tests: timeline, entradas inválidas, independencia de escenas        |
| `npm run format:check`                                             | PASS                                                                         |
| `npm run discover`                                                 | PASS, ReelDemo, 1080×1920, 30 FPS, 360 frames                                |
| `npm run render`                                                   | PASS, MP4 real y captura generados                                           |
| FFprobe, comando inferior                                          | PASS, archivo y pistas inspeccionados                                        |

Comando de inspección en PowerShell, usando el binario incluido en Remotion:

```powershell
& './node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe' -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration,nb_frames,pix_fmt,color_range -show_entries format=duration,size -of json out/reel-demo.mp4
```

Incidencias resueltas: typecheck detectó una duración nullable y se añadió comprobación explícita. El primer MP4 informó yuvj420p/rango completo; se cambió a conversión BT.709 con frames PNG y se repitió el render. La pista AAC añade unos 53 ms al contenedor; la pista de vídeo conserva 360 frames/12 segundos.

## Archivos creados/modificados

La carpeta estaba vacía; todos son nuevos:

- Configuración: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore`, `.prettierignore`.
- Documentación: `README.md`, `docs/architecture.md`, `docs/phase-0-report.md`.
- Dominio y fixture: `src/domain/reel.ts`, `src/fixtures/demo.ts`.
- Composición: `src/composition/index.tsx`, `src/composition/Reel.tsx`, `src/composition/SceneView.tsx`.
- Scripts: `scripts/audio.ts`, `scripts/render.ts`.
- Tests: `tests/domain.test.ts`.
- Assets: `public/test-tone.wav`, `public/ReelSans.woff2`, `public/FONT-LICENSE.txt`.
- Generados: `out/reel-demo.mp4`, `out/preview.png`, `out/validation.json`, `out/ffprobe.json`. Fuera de control de versiones.

## Riesgos encontrados

No están probadas voz/alineación real, publicación en Instagram, carga concurrente ni recuperación de jobs. El determinismo depende de fijar también navegador y entorno; no se ha demostrado igualdad binaria entre renders. Revisar licencia comercial de Remotion antes de lanzamiento. Los contratos persistentes y la arquitectura de servicios necesitan implementación en fases posteriores; no se han creado integraciones incompletas para simular que existen. La instalación inicial descarga un navegador; `npm ci` puede obligar a descargarlo otra vez. La revisión visual de guiones extremos queda pendiente.

## Próxima fase recomendada

Validar los contratos propuestos y una voz real en español con timestamps/alineación, midiendo calidad, coste y duración antes de conectar una interfaz mínima. Requiere autorización; no iniciada.
