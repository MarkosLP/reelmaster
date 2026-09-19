# Informe FASE 1E

## Estado

PASS. Resolución automática local implementada, demo renderizada y comprobaciones completadas. Las necesidades reales pendientes permanecen pendientes. STOP tras 1E.

## VisualPlan

Contrato Zod v1 con producción, hash del borrador, escena, requirement, tipo, descripción, estrategia, resolver, estado, motivo y procedencia. Parámetros de generación tipados y assetId al resolver. Persistencia privada en visual-plan.json. [Contrato completo](visual-phase-1e.md).

## VisualResolver

Puerto de aplicación independiente de FFmpeg, Chromium, Remotion y proveedores. Recibe VisualPlan y devuelve VisualAsset preparado con métricas o error tipado. Contexto de storage privado cerrado en el adaptador. Estrategias futuras declaran unavailable; no están implementadas.

## LocalGraphicResolver

Canvas local con fuente Inter fijada produce PNG 900×1000. Genera títulos informativos, listas y secuencias numeradas. Usa el mismo importador, verificación y asignación de 1D. Remotion no genera estos assets.

## GraphicSpec

Layouts title/list/flow. Headline hasta 60 caracteres, apoyo hasta 140, 2–3 items de hasta 60 para listas/flujo. Programa fijo; contenido exclusivamente datos. Medición real de texto, fuente mínima de items 28 px y errores de overflow sin reducir indefinidamente la fuente.

## VisualBrandProfile

reelmaster-dark-v1: oscuro, Inter local, contraste alto, acento verde, margen 56 px y radio 24 px. Colores centralizados, contraste >=4,5 validado por esquema. Perfil separado del contenido y limitado a gráficos locales.

## Resolution policy

Imagen conceptual explícita → localGraphic; lista/flujo explícitos → localTextVisual. Presenter, screenCapture y broll → manualRequired con motivo. Image ambigua o demasiado larga → manual. TextOnly usa la composición existente. Assets ya validados se reutilizan sin reasignar la producción sellada.

## Provenance

Asset illustrativeGraphic, source generatedLocal, resolver localGraphic-v1, recipeVersion 1, inputHash, contentHash y hashes de fuente/navegador. No generado mediante IA. Solo compatible con requirements image.

## Cache

Caché privada por inputHash dentro de la producción. Demo: 3 miss iniciales y 3 hit posteriores, bytes y hashes idénticos. Tests adicionales regeneran sin caché y verifican determinismo; una caché alterada se rechaza. Los GraphicSpec resueltos se conservan en posteriores inspecciones.

## Demo real

Producción `production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6` conserva waitingForNarration. Presenter de escenas 1 y 5 y screenCapture de escenas 2, 3 y 4 siguen missing/manualRequired. Sin sustitución. Hash del ProductionPlan histórico conservado: `753461b267fa5b5712d51dc50461809990c515a8a63a757be7c0d3f8f8abbd9b`.

## Demo automática

Producción independiente `production-511603e61d2937c9b47f84e4f83c5c2086ff75680dfe068334a10caed62b11ed`, estado rendered. Hook y CTA textOnly; tres imágenes ilustrativas sobre correos, tareas y documentos. Audio: 15 s de tonos con pausas técnicas, sin voz humana. Parte de la idea conocida y registra su adaptación editorial; el histórico no cambia.

Índice y métricas: `.local/phase-1e/demo.json`. Salida bajo:

`.local/productions/production-511603e61d2937c9b47f84e4f83c5c2086ff75680dfe068334a10caed62b11ed/imports/8d09fe8b9e3283987098dfda15d6e896c84be21d980cd6cf2dae19b5d55f7ca1/`

## Render

`reel-a1f136b9-6ffa-46de-894a-87f89c3c24df.mp4`: FFprobe confirma H.264, yuv420p, 1080×1920, 30 fps, 450 frames/15 s. AAC estéreo 48 kHz; contenedor 15,061333 s por padding de audio. Tamaño: 1.291.780 bytes. SHA-256 `25c7a05d5eb05eaa6e85190ceddd8a2f82611880bfdb2642c79c32b39b39668d`. Metadata y tiempo en render-validation.json de la salida.

## Stills

Inspeccionados scene-1.png a scene-5.png: títulos y captions dentro de sus áreas, sin corte ni solapamiento; gráficos contain, contraste y márgenes consistentes. Flujo de correo con tres pasos; lista de tareas con tres entradas; concepto de documentos con texto de apoyo completo. Encabezado repetido dentro del gráfico y en la composición es una decisión sencilla de esta plantilla. Hook/CTA conservan tipografía 1D. También se abrió un PNG de prueba con Á É Í Ó Ú, ñ, ü, ¿, ¡ y texto español: glifos y acentos correctos.

## Rendimiento

Mediciones locales de la demo, no estimaciones monetarias:

| Operación                              | Resultado                      |
| -------------------------------------- | ------------------------------ |
| Planificación                          | 10,16 ms                       |
| Generación + validación de tres assets | 4.337,95 / 875,92 / 851,08 ms  |
| Reutilización + validación             | 596,94 / 587,32 / 580,92 ms    |
| Tamaño de PNG                          | 65.814 / 69.165 / 62.396 bytes |
| Render técnico                         | 31,24 s                        |

El primer arranque de Chromium cuesta más. Cada hit vuelve a validar por 1D; no se omite esa comprobación por rendimiento.

## Tests

103/103 PASS: 89 anteriores y 14 nuevos. Cobertura agrupada: planes y estrategias, selección conservadora, layouts/spec inválidos, español, medidas/overflow, brand/contraste, determinismo fresco y caché, hashes/procedencia, corrupción, binding, PreparedReel/snapshot y separación de Remotion. Log `.local/phase-1e/tests.log`.

## Validaciones

PASS: npm ci offline (344 paquetes, sin nuevas dependencias); lint; typecheck; test; format:check; build:renderer; discover; smoke Ollama local; preparación/render 1A; preparación idempotente 1C; manifiesto 1D; nueva demo técnica 1D y render; demo automática 1E y render; FFprobe y cinco stills. Logs en `.local/phase-1e/`.

## Regresiones

0B: tests originales y build/discover pasan. 1A: audio original intacto; snapshot lógico `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`; render completo de 695 frames. 1B: Ollama local qwen2.5:7b-instruct PASS sin descarga. 1C: ProductionPlan histórico idéntico y revisión de audio vigente. 1D: tests previos pasan; demo técnica nueva `production-66a1a10be05df7bf7c9defa630a9dfc0bd644b1545172496424c0fd6de222612` renderiza con el mismo hash de vídeo anterior `546c0b5a3c67a6868c413dfcd1c993528b615960614e3fab9ba408ce0050ec02`. Renderer y servidor privado no se modifican en 1E.

## Coste

API cost = 0 €. Computación local; no se calcula un coste monetario ficticio de CPU/GPU. Sin servicios externos, modelos nuevos ni assets descargados.

## Archivos modificados

Editados:

- README.md
- package.json
- src/domain/visual-asset.ts
- src/infrastructure/visual/operations.ts

Nuevos:

- docs/visual-phase-1e.md
- docs/phase-1e-report.md
- scripts/resolve-visuals.ts
- scripts/demo-graphics.ts
- src/domain/visual-plan.ts
- src/application/visual-planning.ts
- src/application/ports/visual-resolver.ts
- src/infrastructure/visual/graphic-canvas.ts
- src/infrastructure/visual/local-graphic-resolver.ts
- src/infrastructure/visual/resolve-production.ts
- tests/graphic.test.ts

Artefactos: visual-plan.json del histórico; nueva producción 1E con planes, caché/recibos, originales/derivados PNG, bindings, audio técnico, prepared, snapshot, MP4 y cinco PNG; pruebas privadas bajo .local; logs, índice y evidencia en .local/phase-1e; nueva demo y actualización de índice técnico 1D; regeneración del bundle y render 1A; resultado del smoke Ollama. Inventario de código y hashes en `.local/phase-1e/changed-files.json`. package-lock.json y VozMarcos.m4a permanecen intactos.

## Deuda técnica

Política por palabras clave, sin interpretación semántica general. Tres layouts, alfabeto latino acotado y sin iconos. Dependencia de Windows/Chromium fijados. Caché solo por producción, sin limpieza/globalización. Arranque de proceso y revalidación en cada resolución. Persisten escrituras no transaccionales de 1D y el journal visual puede requerir reconstrucción tras interrupción. La demo evita sobrescrituras, pero no reanuda automáticamente una creación interrumpida. Captions siguen estimados.

## Qué pertenece a la siguiente fase

Solo recomendaciones: más reglas editoriales explícitas, revisión del diseño de plantillas, recuperación de interrupciones y limpieza controlada. Una UI de edición, proveedores generativos o avatar requieren otra fase autorizada. No iniciados.
