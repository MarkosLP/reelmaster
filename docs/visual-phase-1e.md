# FASE 1E: planificación y gráficos locales

La intención editorial y el requirement expresan qué mostrar. `planVisuals` aplica una política determinista; `VisualPlan` registra cómo obtenerlo. `VisualResolver` devuelve un VisualAsset validado o VisualResolutionError. El adaptador local rasteriza; la asignación, privacidad, PreparedReel, snapshot y render son los de [1D](visual-phase-1d.md).

## Comandos

```powershell
$production = 'production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6'
# Planificar: no genera recursos.
npm run production:resolve-visuals -- --production $production
# Ejecutar exclusivamente estrategias locales compatibles.
npm run production:resolve-visuals -- --production $production --execute

# Demo independiente, audio técnico sin voz humana:
npm run demo:graphics -- --technical
$demo = Get-Content -Raw .local/phase-1e/demo.json | ConvertFrom-Json
npm run render:production -- --plan $demo.planPath --stills
```

Los planes, motivos y resultados quedan en `visual-plan.json` junto al plan de producción. Planificar no modifica el borrador ni el plan histórico. Una segunda ejecución no reasigna recursos sellados: conserva los GraphicSpec ya resueltos o identifica como existingAsset los assets manuales previamente validados. No existe búsqueda de archivos ni catálogo entre producciones.

## Contratos

VisualPlan v1: productionId, draftContentHash, sceneId, requirementId, semanticType, description, strategy, resolver, status, reason, provenance y, para generación local, GraphicSpec y VisualBrandProfile. Al resolver incorpora assetId. No contiene rutas arbitrarias, JSX, tiempos de Remotion ni proveedores. Zod valida combinaciones de estrategia, resolver, estado y tipo.

Estados: planned, manualRequired, resolved, failed y unsupported. Estrategias operativas: manual, localGraphic, localTextVisual y existingAsset. generatedImage, generatedVideo, stockSearch y avatar solo son nombres reservados con resolver unavailable y estado unsupported; no tienen adaptadores.

El puerto VisualResolver recibe el plan; la implementación obtiene por construcción únicamente su contexto local privado. Devuelve asset y métricas generationMs/cache/bytes/inputHash. Errores tipados: MANUAL_REQUIRED, UNSUPPORTED_STRATEGY, INVALID_SPEC, OVERFLOW, CACHE_CORRUPT, GENERATION_FAILED y STALE_PLAN. La aplicación mantiene el bloqueo de 1D por recursos inválidos o pendientes.

## Política conservadora

| Requirement                                        | Decisión                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| textOnly                                           | No genera requirement: renderer tipográfico existente |
| presenter                                          | Manual, nunca sustituir por gráfico                   |
| screenCapture                                      | Manual, nunca inventar una captura                    |
| broll                                              | Manual                                                |
| image explícitamente conceptual                    | LocalGraphic o LocalTextVisual                        |
| image ambigua, fotográfica o texto demasiado largo | Manual con explicación                                |
| Asset validado y asociado                          | Reutilizar binding existente                          |

La regla local requiere en la descripción palabras como conceptual, concepto, diagrama, infografía, gráfico o ilustrativo; rechaza términos que indiquen real, foto, fotografía, captura, marca, logotipo o retrato. No intenta interpretar lenguaje natural general. Una intención ambigua debe revisarse editorialmente.

Por defecto usa onScreenText como headline y narration como supportingText. Una descripción que indique lista o flujo usa los segmentos de narration separados por punto y coma como items. No inventa cifras ni resume libremente. Un contenido que exceda el contrato sigue manual; no lo recorta silenciosamente. No se llama a ningún LLM.

## GraphicSpec e identidad

Layouts implementados: title, list y flow. Title admite headline y supportingText; list/flow admiten 2–3 items. Flow representa una secuencia de pasos numerados. Límites: headline 60 caracteres, supportingText 140, cada item 60. Rechaza propiedades desconocidas, marcado y caracteres de control. Sin iconos, URLs ni código proporcionado por contenido.

VisualBrandProfile `reelmaster-dark-v1`: fuente local Inter variable, espacio 56 px, radio 24 px, densidad comfortable, tono dark-tech. Colores centralizados: fondo #101216, superficie #1d2430, texto #f5f6f7, secundario #b9c5d5, acento #c4ff62. Zod exige contraste de texto/acento >=4,5 sobre fondo y superficie. Este perfil afecta a los assets locales; las composiciones tipográficas históricas conservan su identidad anterior.

## Rasterización y overflow

LocalGraphicResolver utiliza Canvas en el Chromium ya disponible, mediante CLI local. No utiliza componentes ni renderStill de Remotion para generar assets. Carga `inter-latin-wght-normal.woff2` del paquete fijado; no usa fuentes de sistema. HTML efímero contiene exclusivamente programa fijo y JSON escapado. CSP restringe recursos a scripts fijos inline y fuente data; el proceso deshabilita resolución de hosts y servicios de fondo. No se descargan navegador, fuentes ni recursos.

PNG RGB/RGBA de 900×1000, igual a la caja visual de 1D, con binding contain. El lienzo tiene margen interior, título 52 px, apoyo 32 px e items 28 px; rótulo 24 px. El texto se mide con la fuente cargada, se parte por palabras y tiene límites de líneas y de altura. Si una palabra no cabe o los bloques superan su área, devuelve OVERFLOW. No reduce la fuente. Admite español y puntuación latina; otros alfabetos o emojis no cubiertos se rechazan explícitamente.

Todos los gráficos se rotulan GRÁFICO ILUSTRATIVO. No imitan apps o marcas. Son estáticos: la composición mantiene su responsabilidad sobre movimiento.

## Pipeline, procedencia y caché

Archivo generado → importVisualAsset de 1D → inspección/decodificación/normalización → VisualAsset → assignVisualAsset → binding. No hay un segundo sistema de render, storage público ni servidor multimedia nuevo.

VisualAsset amplía su contrato aditivamente con `illustrativeGraphic`, source.kind generatedLocal y generation: resolver localGraphic-v1, recipeVersion 1, inputHash, contentHash, fontHash, browserHash, semanticType illustrativeGraphic. El esquema exige procedencia coherente y solo permite vincular este recurso a requirements image. Nunca se etiqueta como IA.

inputHash se calcula sobre GraphicSpec, brand, versión, hashes del navegador/fuente y programa fijo. No incluye producción, hora ni IDs aleatorios. Mismos inputs y entorno fijado producen los mismos bytes; se prueba con generación fresca en otro directorio, además del cache hit.

Caché mínima por producción en `visual-assets/generated/<inputHash>.png` y recibo de hash JSON. Un hit verifica bytes, vuelve a pasar por importación 1D y registra hit. Corrupción falla cerrada. Un PNG sin recibo solo se acepta después de regenerar y comparar bytes idénticos. El HTML temporal se elimina. La caché y copias originales no se publican; el servidor de 1D solo sirve derivados de la allowlist.

## Demo y límites

La producción histórica de «3 formas prácticas de utilizar IA para ahorrar tiempo» mantiene sus 2 presenter y 3 screenCapture pendientes. La variante independiente cambia explícitamente la edición a texto / flujo de correo / lista de tareas / concepto de documentos / texto. El audio son tonos de prueba, sin TTS. El recibo de revisión automatizado pertenece exclusivamente al fixture; no demuestra una lectura humana del guion.

La demo fija tiene identidad estable y una nueva invocación evita sobrescribirla. No ofrece reparación automática si se interrumpe a mitad de preparación. La caché es local a cada producción, sin limpieza ni deduplicación global. El entorno depende de Windows x64 y Chromium/Inter fijados. Persisten las limitaciones transaccionales de 1D entre escrituras de plan, prepared y manifests; el journal visual es informativo y no reemplaza los hashes del pipeline. La política por palabras clave es deliberadamente limitada. No hay editor, generación por IA, avatar ni proveedores externos.
