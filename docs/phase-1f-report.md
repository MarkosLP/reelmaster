# Informe FASE 1F

## Estado

PASS WITH ISSUES. Rama de arquitectura C completada y validada; la generación IA real permanece unavailable por ausencia de runtime/modelo local verificado. No es un PASS de inferencia ni de calidad de imagen. No se inicia 1G.

## Hardware audit

Auditoría inicial de solo lectura, antes de modificar el proyecto o ejecutar npm ci, el 11 de septiembre de 2026, aproximadamente 19:33 Europe/Madrid:

| Recurso                   | Observado                                                             |
| ------------------------- | --------------------------------------------------------------------- |
| GPU                       | NVIDIA GeForce RTX 2060, WDDM                                         |
| VRAM total                | 6.144 MiB (6 GiB)                                                     |
| VRAM usada/libre inicial  | 1.184 MiB usados; 4.960 MiB libres calculados                         |
| Driver / NVIDIA-SMI       | 610.88                                                                |
| CUDA anunciada por driver | CUDA UMD 13.3                                                         |
| CUDA toolkit              | nvcc no encontrado; sin CUDA_PATH ni toolkit en ubicación habitual    |
| CUDA para inferencia      | No verificada; driver compatible no equivale a PyTorch/CUDA instalado |
| CPU                       | Intel Core i7-9700K @ 3,60 GHz, 8 cores / 8 hilos                     |
| RAM visible/libre         | 33.490.208 / 15.813.600 KiB (31,94 / 15,08 GiB)                       |
| Disco C libre             | Aproximadamente 1,23 TB decimales                                     |
| Disco D libre             | Aproximadamente 793,6 GB decimales                                    |
| Volumen G                 | FAT32, 16,1 GB totales, 8,64 GB libres                                |
| Python                    | 3.12.10 x64 y 3.14.2 x64                                              |

Hay memoria gráfica ocupada por escritorio y aplicaciones. No se cerró ninguna ni se lanzó inferencia para forzar disponibilidad. Node y el stack Chromium/FFmpeg de ReelMaster siguen disponibles. Docker Desktop y Ollama están instalados; WSL enumera únicamente docker-desktop.

## Local AI audit

Inspeccionados directorio del usuario (incluidos caches, Downloads/Documents/AppData), D:/Descargas, directorios Program Files de C y D, C:/ProgramData y G. Búsqueda de nombres/checkpoints .safetensors/.ckpt, model_index.json, entornos Python y nombres de runtimes; sin red. Se excluyeron node_modules, .git, .codex y caches de navegador. Las rutas protegidas no accesibles no se consideran auditadas exhaustivamente.

No se encontraron checkpoints o instalaciones utilizables de Stable Diffusion, ComfyUI, AUTOMATIC1111, Forge, Invoke o Diffusers en ese ámbito. Python 3.12 y 3.14 no tienen paquetes torch/diffusers/transformers/onnx de la consulta. El venv de .hf-cli contiene huggingface_hub 1.3.4: es un cliente, no un runtime de imagen; el cache habitual de Hugging Face no contiene modelos. Un model_index.json encontrado pertenece al recomendador NuGet de Visual Studio, no a generación de imágenes. CurseForge Windows no es Forge de imágenes.

Ollama contiene qwen3.5:9b, qwen2.5:7b-instruct, qwen2.5:14b-instruct, qwen3:1.7b, qwen3:4b, qwen3-embedding:0.6b y mistral:latest; ninguno se ha utilizado como generador de imágenes. Puerto 11434 activo, sin listeners en 7860/8188/9090 en la consulta. Docker images no muestra un runtime reconocible de imágenes; no se arrancaron ni descargaron contenedores.

La conclusión es «no se encontró un backend utilizable», no una garantía de que ningún archivo oculto o directorio inaccesible contenga un modelo.

## Viability decision

**C.** Hay GPU local, pero generar realmente requiere instalar/descargar dependencias y un checkpoint, además de implementar y verificar un adaptador concreto. Se completa únicamente arquitectura/provider/contratos con unavailable y tests falsos explícitos. No se solicita ni presupone autorización de descarga en esta fase.

## GeneratedImageResolver

Implementa VisualResolver; usa ImageGenerationProvider mediante inyección, límite de tiempo y contexto privado. Reutiliza importVisualAsset y bindings de 1D. La fábrica de producción no dispone de backend y siempre devuelve UnavailableImageProvider. [Contrato detallado](image-phase-1f.md).

## ImageGenerationRequest

IDs, prompt/negativePrompt, aspect ratio, dimensiones, seed uint32, estilo, locale, safety de text-to-image y opciones genéricas limitadas. Zod estricto rechaza rutas, URLs, claves de proveedor, referencias de imágenes, tamaños agresivos y parámetros inválidos.

## Visual prompt

Descripción de escena + narración como contexto + purpose + tono/paleta. Pide sujeto conceptual anónimo, composición vertical y ausencia de texto/logos/capturas reales. No contiene instrucciones Remotion. Prohíbe solicitar Marcos/retratos/capturas desde esta ruta. No se envió ningún prompt a IA real.

## Resolution policy

TextOnly y gráficos informativos conservan 1E. Prefijo editorial explícito Imagen IA conceptual: selecciona generatedImage; sin capacidad queda unavailable y missing, sin fallback. Presenter, capturas reales y broll siguen manuales. El histórico de 1C/1D no cambia.

## Backend

No existe backend real habilitado. Solo interfaz y proveedor unavailable. FakeImageProvider es un test double no registrado en producción; sus PNG son patrones técnicos creados por código y su recibo declara fake-test-only/no-real-model/testOnly=true. No son imágenes IA.

## VRAM

6 GiB totales, unos 4,84 GiB libres en la muestra inicial. No se midió consumo de generación ni se provocó OOM. Defaults de arquitectura: 288×512, una imagen, 20 iteraciones, máximo 120 s y sin reintentos. La viabilidad/calidad con un modelo específico sigue sin demostrarse.

## Provenance

Asset conceptualImage/source generatedLocalAI, aiGeneration con resolver, versión, hashes y seed. Recibo privado por hash con runtime/modelo, modelHash si disponible, parámetros, elapsedMs y advertencia de que la seed no garantiza bytes idénticos. El asset semántico permanece independiente de proveedores; 1E conserva generatedLocal sin IA.

## Cache

Por request normalizada + promptVersion + identidad + parámetros + seed + resolver/receta. Verifica bytes, request, identidad y recibos, vuelve a validar por 1D. Pruebas de miss/hit e invalidación por seed/prompt/modelo/parámetros pasan. Bytes/recibos alterados se rechazan. No se ha medido rendimiento de caché IA real.

## Demo images

Ninguna imagen IA real generada. Los patrones de tests están identificados como technicalFixture y no se presentan como una demo.

## Demo Reel

No creado: falta generación real. No se fabricó un reel de 1F con imágenes falsas. Las demos históricas se conservan.

## Tests

119/119 PASS: 103 anteriores + 16 nuevos. Request/prompt/límites, unavailable, selección de estrategia, seed/hashes/provenance, caché/corrupción, salida inválida/dimensiones/decodificación, bindings, rechazo de presenter/capturas/broll, aislamiento de test provider, independencia del backend, ausencia de rutas arbitrarias y bloqueo TCP externo. Los tests con fake no validan capacidad de inferencia real.

## Validaciones

PASS: npm ci offline con dependencias existentes; lint; typecheck; npm test; format:check; build:renderer; discover. Auditoría hardware/software completada antes de cambios. Preparación 1A, preparación idempotente 1C y estados/manifiestos 1D/1E comprobados. Smoke Ollama local de 1B ejecutado sin descargar modelos. Integración y demo IA real: no ejecutadas, unavailable.

## Regresiones

0B–1E: 103 tests anteriores pasan. Sin cambios en VoiceProfile, PresenterProfile, ReelDraft, ProductionPlan, PreparedReel, CompositionSnapshot, servidor privado ni componentes Remotion. VisualPlan/VisualAsset se amplían aditivamente. Audio original, lockfile y plan principal se conservan. Snapshot 1A mantiene `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`. Producción principal: waitingForNarration, cinco recursos pendientes. Demo 1E anterior: rendered, assets íntegros; no se reemplazan por IA.

## Coste

API cost = 0 €. No se asigna un precio ficticio al cómputo local de auditoría/tests.

## Descargas realizadas

**NINGUNA.** npm ci usó el cache offline de dependencias ya fijadas. Sin pip install, git clone, pull de modelos, checkpoints, servicios externos ni descargas de navegador/fuentes.

## Archivos modificados

Editados:

- README.md
- src/domain/visual-plan.ts
- src/domain/visual-asset.ts
- src/application/visual-planning.ts
- src/infrastructure/visual/resolve-production.ts

Nuevos:

- docs/image-phase-1f.md
- docs/phase-1f-report.md
- src/domain/image-generation.ts
- src/application/image-prompt.ts
- src/application/ports/image-generation-provider.ts
- src/infrastructure/visual/image-provider.ts
- src/infrastructure/visual/generated-image-resolver.ts
- tests/image-generation.test.ts
- tests/fixtures/fake-image-provider.ts

Evidencia privada en .local/phase-1f: logs, hashes e inventario changed-files.json. Fixtures y recibos falsos únicamente bajo producciones privadas de tests. Bundle regenerado y artefactos de regresión 1A/1B; ningún MP4 ni output de IA real 1F. package.json y package-lock.json no cambian.

## Deuda técnica

Sin adaptador real ni validación de VRAM, calidad, cancellation/backend o reproducibilidad GPU. El timeout aborta la solicitud, pero la futura implementación debe garantizar detener inferencia y liberar recursos. Reglas editoriales por palabras/prefijos y safety declarativa no equivalen a moderación visual. Cache por producción sin limpieza; output parcial requiere revisión y no se sobrescribe. Persisten las limitaciones transaccionales de 1D/1E. Recibo de infraestructura mantiene trazabilidad por hash sin acoplar el renderer al backend.

## Qué necesitamos para continuar

Autorización posterior para una instalación concreta y acotada. Opciones de integración a evaluar: un runtime local como ComfyUI con adaptador local, o un entorno Python dedicado con biblioteca de inferencia. En ambos casos faltan dependencias compatibles con Windows/GPU y un checkpoint text-to-image cuya licencia, integridad y presupuesto de memoria se revisen. No se ha seleccionado ni validado una combinación de versiones/modelo.

Tras disponer de esos recursos: verificar carga offline con margen real de VRAM, generar solo 2–3 conceptos anónimos, medir tiempo/memoria, inspeccionar resultados y entonces probar el reel mixto. Este trabajo no se ha iniciado. STOP tras 1F.
