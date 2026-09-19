# Informe FASE 1D

## Estado

PASS. Implementación y demo técnica verificadas. La producción real permanece bloqueada por entradas reales pendientes, conforme al alcance. Fase siguiente no iniciada.

## VisualAsset

Contrato tipado con tipo semántico, origen local, hash de original y derivado, metadatos medidos, privacidad, identidad opcional de presentador y receta. [Detalle completo](visual-phase-1d.md).

## VisualAssetManifest

Se deriva del plan sin cambiar el borrador. Guarda requirements, assets y bindings, producción/hash de origen, estado y contador. Persistencia privada por producción.

## Requirements

Presenter, screenCapture, broll e image; missing → assigned → validated o rejected. TextOnly no requiere asset.

## SceneVisualBinding

Asociación explícita escena/requirement/asset. Contain/cover, focal manual, offset, muted obligatorio y rechazo de vídeo corto. Validación final en frames medidos.

## Presenter Marcos

Admite foto/vídeo local con presenterId correspondiente. No se ha asignado ninguna imagen inventada ni generado avatar. La selección manual declara la identidad, sin reconocimiento facial.

## ScreenCapture

Tipo semántico independiente, imagen o vídeo, contain por defecto. La demo usa una captura de interfaz simulada y etiquetada.

## B-roll

Imagen o vídeo local seleccionado manualmente. Vídeo silenciado, sin bucles ni congelación para cubrir faltantes.

## Validación de assets

Firma, tamaño, dimensiones, códec, orientación, fps, duración, streams, decodificación completa y hashes. PNG/JPEG/WebP estático hacia PNG; vídeo compatible hacia H.264 CFR 30, sin audio. Rotación de vídeo probada. EXIF de imagen no normal se rechaza explícitamente.

## Privacidad

Originales y derivados bajo `.local/productions/<id>/visual-assets`. Fuentes iniciales intactas. Servidor privado existente ampliado con allowlist, token, hashes, rangos y MIME. Multimedia fuera de public y bundle, publicable=false.

## Renderer

Img/OffthreadVideo reciben decisiones resueltas. Caja visual separada de título y captions. La pista de audio visual se elimina y el componente permanece muted.

## CompositionSnapshot

Extensión aditiva de v1 con imagen/vídeo y template local-media-v1. Snapshot tipográfico de 1A conserva hash lógico `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`.

## Estados de producción

Narración medida + todos los recursos validados habilitan renderable; render exitoso produce rendered. Recursos sin narración permanecen waitingForNarration. Clip insuficiente descubierto tras importar audio deja prepared, conserva el audio válido y exige corregir el recurso. Plan preparado y manifest quedan sellados por hash al habilitar render.

## Demo principal

`production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6`: waitingForNarration; 5 missing: presenter escenas 1 y 5; screenCapture escenas 2, 3 y 4. Sin assets asignados ni narración inventada. Plan original idéntico por hash.

## Demo técnica

`production-338af977ef88f9f9092778326ad0320d06b809aa9fc27cedc36882cff1b90ede`: rendered. Patrón PNG, vídeo móvil de 4 s, captura simulada y textOnly; tonos sintéticos con pausas como audio técnico. No representa voz o imagen de Marcos.

Directorio de salida relativo al proyecto:

`.local/productions/production-338af977ef88f9f9092778326ad0320d06b809aa9fc27cedc36882cff1b90ede/imports/2355f77071625271deb2de28f01ab701204077ba6aa9e1f10c71eda7961d97ab/`

MP4 `reel-aaa0b0d1-8efd-43a3-959a-eb27839f90b8.mp4`, SHA-256 `546c0b5a3c67a6868c413dfcd1c993528b615960614e3fab9ba408ce0050ec02`. FFprobe: H.264, 1080×1920, 30 fps, 240 frames/8 s; AAC estéreo 48 kHz. Contenedor 8,042667 s por padding AAC; 739.098 bytes. Cuatro PNG de escenas revisados visualmente: encuadre y captions correctos, contain conserva capturas y cover recorta vídeo según binding. Render-validation.json registra metadatos completos.

## Tests

89/89 PASS: 73 previos y 16 nuevos. Incluyen hashes, MIME/rangos/traversal, corrupción, tipos incompatibles, presenter, rotación, EXIF, normalización reproducible, offsets, vídeo corto, asignación antes/después del audio y sellado. Log `.local/phase-1d/tests.log`.

## Validaciones

PASS: npm ci offline sin dependencias nuevas; lint; typecheck; test; format:check; build:renderer; discover; integración Ollama local; prepare:marcos; render 1A; preparación idempotente del plan 1C; manifiesto principal; demo visual y render técnico con stills. Logs adicionales en `.local/phase-1d/`.

## Regresiones

0B: tests de contratos/snapshot y renderer pasan. 1A: audio original y prepared/snapshot conservados por hash; render H.264/AAC completo 695 frames. 1B: tests y Ollama real local pasan, sin descargar modelo. 1C: tests previos, preparación idempotente y plan principal inalterado; importación de audio revisada sigue vigente. Comparación registrada en `.local/phase-1d/regression-hashes.json`; lockfile sin cambios.

## Coste

API cost = 0 €. Sin servicios externos, descargas de assets ni generación de avatar. Computación local.

## Archivos modificados

Código y documentación editados:

- package.json
- README.md
- scripts/render-production.ts
- src/application/production-plan.ts
- src/application/prepared-reel.ts
- src/domain/reel.ts
- src/snapshot/types.ts
- src/snapshot/compile.ts
- src/composition/Reel.tsx
- src/composition/SceneView.tsx
- src/infrastructure/audio/private-server.ts
- src/infrastructure/production/operations.ts

Archivos nuevos:

- docs/visual-phase-1d.md
- docs/phase-1d-report.md
- scripts/visual-assets.ts
- scripts/demo-visual.ts
- src/domain/visual-asset.ts
- src/application/visual-manifest.ts
- src/infrastructure/visual/import-asset.ts
- src/infrastructure/visual/operations.ts
- src/composition/MediaSceneView.tsx
- tests/visual.test.ts
- tests/fixtures/visual-fixtures.ts

Artefactos generados: manifiesto real 1D; producción técnica con plan, manifests, originales, derivados, audio técnico preparado, snapshot, MP4 y cuatro stills; fixtures temporales privados; logs y evidencia bajo `.local/phase-1d`; nuevo resultado del smoke Ollama bajo `.local/generated`; bundle `build/renderer`; regeneración 1A en `.local/marcos` y `out/marcos`. El audio original y package-lock.json no se modifican. Los artefactos de intentos técnicos fallidos quedan privados y no se publican.

## Deuda técnica

FFmpeg disponible limita formatos y tratamiento EXIF; vídeos requieren píxeles cuadrados. Servidor carga buffers con límite agregado 256 MiB. Focal e identidad requieren selección humana. No hay limpieza automática de copias rechazadas ni transacción recuperable entre todas las escrituras del prepared/manifest/plan. Captions siguen estimados, como en 1C. No existe editor de assets.

## Qué pertenece a la siguiente fase

Recomendaciones: interfaz de selección/revisión, recuperación transaccional y limpieza explícita; más formatos y orientación EXIF. Automatización visual y avatar requieren fase y autorización propias. STOP tras 1D.
