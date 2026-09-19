# REELMASTER — FASE 1G

## Estado

**PASS WITH ISSUES. Fase 1G terminada.** El pipeline real funciona de principio a fin, incluidos caché, validación 1D, binding, PreparedReel, CompositionSnapshot y MP4. La calidad editorial de las imágenes no pasa: las escenas IA contienen pseudotexto molesto y una composición tipo lámina que se desvía del guion. La demo es técnica, no está lista para publicar.

Fecha: 12 de septiembre de 2026. No se inicia ninguna fase posterior.

## ComfyUIImageProvider

Adaptador real del puerto ImageGenerationProvider existente, implementado con HTTP nativo de Node. Se reutiliza GeneratedImageResolver y el pipeline importVisualAsset de 1D; no se crea un segundo pipeline. ComfyUI queda en infraestructura y en recibos privados. ReelDraft, ProductionPlan, PreparedReel, CompositionSnapshot, VisualAsset semántico y Remotion no incorporan el backend.

Los ?nicos ajustes genéricos son defaults de imagen validados, admisión de dos iteraciones, cierre/timeout opcionales del provider, errores tipados, métricas y ampliación del recibo de infraestructura. [Documentación técnica](image-phase-1g.md).

## Configuración

La instalación de 1F.1 se localizó en su ruta existente y se verificó ComfyUI 0.3.76, commit `30c259cac8c08ff8d015f9aff3151cb525c9b702`. El checkpoint existente fue verificado de nuevo por SHA-256: `87e61f60b85d9f1c577bd9053872c7678b7d39f6f52d470081ff6ea3b49ddf98`.

La configuración privada está en `.local/phase-1g/comfy-config.json`, activada mediante REELMASTER_COMFY_CONFIG. Expresa URL loopback, checkpoint/ruta/hash, versión/commit, comando de arranque, tiempos y parámetros. No hay rutas personales en código versionado. Sin variable se conserva unavailable. No se reinstaló ComfyUI ni se modificó su instalación; se reutilizó su launcher offline con output-directory específico de 1G.

## ComfyUI API

GET `/system_stats`, `/object_info/CheckpointLoaderSimple`, `/queue`, `/history/{prompt_id}` y `/view`; POST `/prompt`, `/queue` y `/interrupt`. Implementación contrastada contra `server.py` de la instalación real. Sin UI, websocket obligatorio, SDK, API externa ni workflows externos.

## Lifecycle

Detección por system_stats y verificación de versión; SHA-256 del modelo por streaming, sin cargar sus 6,9 GB en memoria Node. Si no está activo, arranque ?nico con comando local conocido, sin shell y oculto. Readiness: 120 s; generación: 180 s; el resolver admite el presupuesto total más margen. El timeout no se deriva de los ~5 s calientes.

Dos lotes reales iniciaron y cerraron sus propios procesos: PID 17968 para integración y PID 22000 para demo. No quedan esos procesos ni listener 8188 al terminar; evidencia en `.local/phase-1g/backend-final.json`. La reutilización de backend externo y su conservación al cerrar están probadas con servidor falso; no se afirma que ese caso se haya repetido con el backend real.

## Concurrencia

Mutex por endpoint dentro de Node y directorio de bloqueo atómico por endpoint entre procesos ReelMaster. Una generación cada vez. El bloqueo registra PID, fecha y URL y se mantiene durante el lote. Antes de enviar se espera cola vacía; no se borran trabajos ajenos. Bloqueos abandonados tras crash requieren revisión manual. No se incorpora un job system.

## ImageGenerationRequest

Se mantiene el prompt builder de 1F, incluidas sus restricciones editoriales y de identidad. Prompt y negativo se transfieren a CLIPTextEncode; seed al sampler; dimensiones a EmptyLatentImage. Opciones genéricas admitidas se mapean estrictamente a 2 pasos/CFG 1/count 1. Otros parámetros, resoluciones y workflows se rechazan. Todas las generaciones reales usan la seed existente 42; no hubo búsqueda de seeds.

## Workflow

`sdxl-lightning-2step-v1`, siete nodos controlados: CheckpointLoaderSimple, dos CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode y SaveImage. Parámetros efectivos: 512×768, batch 1, 2 steps, CFG 1, Euler, sgm_uniform y denoise 1. Son los validados en 1F.1. El negativePrompt se conserva y mapea, pero CFG 1 no usa la rama negativa para guidance. No se genera 1080×1920.

## Generated images

Exactamente tres imágenes nuevas: una de integración y dos de demo. Ningún fallo técnico, reintento, OOM ni regeneración estética. Todas son 512×768, seed 42.

| Imagen        | Tiempo API generación | Bytes PNG | SHA-256 original y normalizado                                     |
| ------------- | --------------------- | --------- | ------------------------------------------------------------------ |
| Integración   | 19.017 s              | 528853    | `3e0947803818cc79bb94a15b20f3b35bf2f49a14947a8a0d8bfce8694bcc4ac2` |
| Demo escena 3 | 8.391 s               | 536075    | `3f8e3f286f638d56d8dd3cfc47be6b443a087c56e7100de83765379073970cd0` |
| Demo escena 4 | 4.400 s               | 576443    | `8e7f3638b889b24aaa61c4bd8c355267beeda32e42f0394f5bbf23b650585adb` |

Los PNG originales de ComfyUI y los derivados normalizados se conservaron. En estas tres imágenes la normalización de 1D mantuvo los mismos bytes/hash, después de validar y decodificar. Evidencia completa: `.local/phase-1g/final-evidence.json`, `integration.json`, `demo.json`, recibos por producción y `comfy-outputs/`.

## Provenance

VisualAsset contiene source=generatedLocalAI, resolver generatedImage-v1, recipeVersion 1, receiptHash, inputHash, promptHash, seed y contentHash. El recibo privado contiene runtime ComfyUI/versión/commit, modelo/hash, workflowVersion, promptVersion, request completa, hash combinado del prompt, hash del negativo separado, parámetros, dimensiones y elapsedMs. El tiempo del recibo cubre provider completo; las métricas backend separan startup y generación. No se prometen resultados idénticos bit a bit en GPU.

## Cache

Tres misses reales y tres hits IA posteriores, más un hit del localGraphic. Los hits IA se comprobaron con el provider ya cerrado, que rechaza generate(): ninguna llamada al backend. Se revalidan hash, request, identidad, recibo sellado y 1D. Corrupción y PNG huérfano se prueban con fixtures: cuarentena de evidencia y exactamente una regeneración de recuperación, sin ejecutar ese escenario con el modelo real.

## Seguridad

Solo localhost/127.0.0.1 en HTTP; localhost se resuelve internamente a 127.0.0.1 sin DNS. Se rechazan LAN, dominios, IP alternativas, credenciales, rutas de base y todos los redirects. JSON y PNG tienen límites de tamaño. UUID propio de job y prefijo propio de SaveImage; solo una imagen output del nodo 7, subfolder vacío y nombre esperado. No se leen rutas locales recibidas del backend. PNG se verifica antes de entrar en 1D, que conserva su decodificación/normalización. Los prompts no se exponen en el servidor de medios.

Cancelación usa delete e interrupt con ID propio, nunca global. Espera hasta cinco segundos para confirmar drenaje y registra su resultado. Cancelación, timeout y OOM se prueban con servidor falso; no se provocó OOM en la GPU. No hay retry automático ante OOM/error/timeout ni reducción silenciosa de resolución.

## Privacidad

Inferencia enteramente local. Node usa el guard TCP existente y transporte loopback; Python reutiliza el launcher de 1F.1 que bloquea conexiones/DNS externos y configura modos offline. Custom/API nodes siguen desactivados. No se enviaron prompts, imágenes, narración ni metadata a Internet. No se introdujo telemetría. No se usaron servicios de imagen externos.

## Integration test

`npm run test:integration:image -- --real-local`: PASS. Request → ComfyUI → PNG → 1D → VisualAsset real. Verifica 512×768, source, contentHash y posterior cacheHit con backend cerrado. No está en npm test y exige configuración explícita fuera de CI.

## Demo Reel

Producción independiente `production-33cda8ec6bda7007e10fc3c2bb42f48d46ae2f32bec0ccc248731f99037c14aa`. No usa ProductionPlan ni draft histórico de Marcos. Audio técnico: tonos de 330 Hz, PCM estéreo 48 kHz, sin voz ni TTS. Los textos de captions son un guion técnico de prueba; no son una transcripción de esos tonos.

1. textOnly: «TRES RECURSOS VISUALES».
2. localGraphic: proceso «Idea visual → Generación local → Revisión humana».
3. generatedImage real: «IDEAS CONECTADAS».
4. generatedImage real: «NUEVAS POSIBILIDADES».
5. textOnly: «TODO EN LOCAL».

Los tres requirements de imagen constan validated; sus bindings usan contain, sin deformación. PreparedReel se selló, el renderer compiló el CompositionSnapshot y la producción terminó rendered.

## Render

[MP4 de la demo](../out/phase-1g/reelmaster-1g.mp4). H.264, yuv420p, BT.709, 1080×1920, 30 FPS; AAC estéreo 48 kHz. Vídeo: 15,000 s y 450 frames. Contenedor/audio: 15,061333 s; hay 61 ms adicionales en la pista AAC, sin alterar los 450 frames visuales. Tamaño: 1.542.063 bytes.

SHA-256: `c6d3d449ab86949452e81e48a68421b8861fa42c8d3d1294193e5aa06799ccac`. FFprobe validado por render-production; JSON ?ntegro en render-validation.json de la producción y copiado en final-evidence.json. Copia entregable cotejada por SHA-256.

## Stills

Cinco stills renderizados e inspeccionados realmente al frame central de cada escena: 45, 135, 225, 315 y 405. También se inspeccionaron los tres PNG IA originales.

| Escena                           | Inspección                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1](../out/phase-1g/scene-1.png) | Título, elemento IA y captions legibles; márgenes seguros y contraste correcto. La línea de caption es un fragmento temporal del guion.                                                                                                                           |
| [2](../out/phase-1g/scene-2.png) | Flujo de tres pasos legible y consistente con la paleta; título repetido en recurso/gráfico, sin colisiones. Captions separados.                                                                                                                                  |
| [3](../out/phase-1g/scene-3.png) | Dos objetos circulares verdes en una lámina blanca, sin la conexión de tres esferas solicitada. Pseudotexto visible y molesto, especialmente en bordes. Contain conserva la imagen completa con bandas laterales negras; no la deforma. Título/caption correctos. |
| [4](../out/phase-1g/scene-4.png) | ?rbol verde reconocible y relación genérica con crecimiento; no es una pequeña planta entre cubos. Lámina blanca con pseudotexto. Mismo encuadre contain; título/caption legibles.                                                                                |
| [5](../out/phase-1g/scene-5.png) | Cierre coherente con escena 1, texto seguro y contrastado. Audio de prueba claramente descrito por el guion.                                                                                                                                                      |

No aparecen personas ni manos, por lo que no hay defectos de manos observados. No se observan marcas identificables. La ausencia de pseudotexto **no se cumple** y el fondo claro rompe parte de la coherencia dark-tech. La integración inicial también produjo una lámina con pseudotexto. Se conservó la evidencia y no se gastaron generaciones adicionales para esconder el problema. El binding existente no garantiza eliminar estos artefactos. No se declara calidad editorial aprobada.

## Rendimiento

| Métrica                                                  | Resultado               |
| -------------------------------------------------------- | ----------------------- |
| Arranque integración                                     | 58,290 s                |
| Generación fría integración                              | 19,017 s                |
| Arranque demo                                            | 7,207 s                 |
| Primera generación demo, proceso recién iniciado         | 8,391 s                 |
| Segunda generación demo, caliente                        | 4,400 s                 |
| Import/validación integración                            | 1.047 s                 |
| Import/validación scene-3                                | 0.194 s                 |
| Import/validación scene-4                                | 0.185 s                 |
| Cache IA integración / demo 3 / demo 4, con revalidación | 0.194 / 0.179 / 0.176 s |
| Render + FFprobe + cinco stills                          | 35.365 s                |
| Pico VRAM global observado                               | 5092 MiB / 6144 MiB     |

VRAM muestreada con nvidia-smi aproximadamente cada segundo: 182 muestras. Es VRAM global, incluye otras aplicaciones y puede omitir picos breves; no es VRAM exclusiva del modelo. No se añadió monitorización al producto. La diferencia entre arranques refleja estados de caché/recursos del sistema; las muestras no constituyen una prueba prolongada. El hashing del checkpoint es previo y está incluido en el total del resolver, no en startup ni en generación API.

## Tests

**137/137 PASS**, cero fallos/skips. Cobertura de mapping, seed, dimensiones, workflow/parametrización fija, loopback, hosts y redirects rechazados, polling/success, unavailable, startup/generation timeout, cancelación dirigida, OOM, error de workflow, output inválido, traversal, outputs ajenos, caché/recibos/provenance, recuperación de corrupción/huérfanos, concurrencia y ownership startup/shutdown. Las pruebas normales usan fake HTTP/fake provider o un pequeño proceso Node, nunca Python ni ComfyUI.

Se volvió a ejecutar npm test con REELMASTER_COMFY_CONFIG apuntando deliberadamente a un fichero inexistente: PASS, demostrando que el preloader de tests desactiva configuración real heredada. No se simula un PASS de inferencia: esta está acreditada separadamente por los tres PNG reales.

## Validaciones

- `npm ci --offline --no-audit --no-fund`: PASS; 344 paquetes restaurados desde caché.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 137 pruebas.
- `npm run format:check`: PASS.
- `npm run build:renderer`: PASS.
- `npm run discover`: PASS, ReelDemo 1080×1920 a 30 FPS; duración baseline 695 frames, independiente de la demo 1G de 450.
- Integración real, demo mixta, render, FFprobe e inspección de cinco stills: ejecutados. Pipeline PASS; revisión editorial WITH ISSUES.
- Backend al cierre: apagado, procesos propios terminados.

## Regresiones

Pruebas 0B–1F completas pasando. Auditoría por SHA-256 frente al inicio: 99 archivos existentes sin cambios antes de actualizar la nota de continuidad. Sin cambios en voz/presenter, contratos editoriales, ProductionPlan, PreparedReel, VisualPlan estructural, VisualAssetManifest, LocalGraphicResolver, CompositionSnapshot, servidor privado ni renderer. VisualPlan solo amplía los códigos de error de su módulo. La lógica de captions estimados, fuentes, fixture histórico y código de Marcos permanece intacta. Los tests de audio conservan sus verificaciones previas.

## Coste

**API cost = 0 €.** Electricidad y almacenamiento locales no cuantificados.

## Descargas nuevas

**NINGUNA.** No se descargaron modelos, runtime, paquetes de red, SDK, navegador, LoRA ni auxiliares. npm ci reutilizó caché local. package-lock.json no cambió.

## Archivos modificados

Existentes:

- `src/application/ports/visual-resolver.ts`
- `src/infrastructure/visual/resolve-production.ts`
- `src/domain/visual-plan.ts`
- `src/infrastructure/visual/generated-image-resolver.ts`
- `src/application/ports/image-generation-provider.ts`
- `src/domain/image-generation.ts`
- `src/infrastructure/visual/image-provider.ts`
- `src/application/image-prompt.ts`
- `tests/image-generation.test.ts`
- `README.md`
- `package.json`
- `CONTINUAR-MANANA.md` (actualización del cierre de fase).

Nuevos:

- `src/infrastructure/visual/comfy-config.ts`
- `src/infrastructure/visual/comfy-image-provider.ts`
- `src/infrastructure/visual/comfy-workflow.ts`
- `scripts/demo-images.ts`
- `scripts/integration-image.ts`
- `scripts/phase-1g-fixture.ts`
- `scripts/test-environment.mjs`
- `tests/comfy-image-provider.test.ts`
- `tests/fixtures/comfy-server.mjs`
- `docs/image-phase-1g.md`
- `docs/phase-1g-report.md` (este informe).

Artefactos locales ignorados: `.local/phase-1g/` (configuración, logs, mediciones, outputs y evidencias), dos producciones técnicas nuevas en `.local/productions/`, audio `.local/recordings/mixed-demo-1g.wav` y `out/phase-1g/` (MP4 y cinco stills). Los tests/build también regeneran sus artefactos técnicos habituales. El listado completo de archivos y hashes de entrega queda en `.local/phase-1g/artifact-inventory.json`; auditoría del código en `file-audit.json`. No hay repositorio Git inicializado: la comparación se hizo contra los hashes de comienzo, no contra commits.

## Deuda técnica

1. Pseudotexto y baja fidelidad editorial en los tres outputs: el prompt builder de 1F no garantiza imágenes publicables con este modelo. CFG 1 limita la utilidad práctica del negativo. Es una limitación observada, no solucionada.
2. Recuperación manual del bloqueo tras un crash y necesidad de cerrar explícitamente providers inyectados. No hay supervisor persistente.
3. Cancelación cooperativa con drenaje acotado; concurrencia de aplicaciones locales ajenas fuera del control de ReelMaster.
4. La identidad de commit proviene de la instalación fijada de 1F.1/configuración; la API confirma versión y nombre de checkpoint, no proporciona atestación criptográfica del modelo cargado por un backend externo.
5. Solo tres generaciones reales, sin stress test. Arranque y hashing pueden ser considerablemente más lentos que generación caliente.

## Qué pertenece a la siguiente fase

Solo recomendaciones: mejorar y evaluar el prompt visual con el checkpoint existente, y definir un paso de revisión/selección editorial antes de considerar una imagen publicable. Estudiar recuperación de bloqueo tras crash si el uso real lo requiere. Ninguna de estas recomendaciones se implementa en esta fase.

**STOP. FASE 1G cerrada. No se inicia fase posterior.**
