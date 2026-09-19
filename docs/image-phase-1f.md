# FASE 1F: arquitectura de imagen IA local

Decisión de viabilidad C: la generación real necesita instalar un runtime y obtener un modelo. Se implementan contratos, resolver, interfaz de adaptador, unavailable y pruebas con un proveedor falso. No existe una integración real habilitada. [Auditoría y resultados](phase-1f-report.md).

## Política

Los comandos de 1E no cambian. `production:resolve-visuals -- --production <id>` planifica y `--execute` resuelve únicamente capacidades disponibles.

| Intención/necesidad                                                  | Estrategia                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| textOnly                                                             | Renderer existente                                            |
| Gráfico conceptual informativo, lista, flujo                         | localGraphic/localTextVisual de 1E                            |
| image con descripción `Imagen IA conceptual: ...` o `Imagen IA: ...` | generatedImage, solo con capacidad local verificada           |
| Misma intención sin backend                                          | generatedImage / unavailable, con motivo, requirement missing |
| presenter, screenCapture, broll                                      | Manual                                                        |
| Imagen que pide Marcos/retrato/captura                               | Manual; prompt builder rechaza la solicitud                   |

La solicitud IA debe ser explícita: una imagen conceptual de 1E no pasa automáticamente a IA. El prefijo no cambia el tipo semántico del requirement. Las listas/diagramas se excluyen de la ruta IA. Las reglas son limitadas y no constituyen un sistema general de moderación o comprensión de identidad. No se aceptan referencias de imágenes ni image-to-image.

## ImageGenerationRequest

Contrato Zod independiente del proveedor, sin rutas/URLs/modelos elegidos por el usuario:

- IDs de escena y requirement relacionados.
- promptVersion concept-image-v1, prompt hasta 2.400 caracteres y negativePrompt opcional hasta 500.
- Aspect ratio 9:16, 1:1 o 2:3, dimensiones enteras de 256–768, múltiplos de 32, proporción exacta y máximo 393.216 píxeles.
- Seed explícita uint32, perfil de estilo dark-tech, locale y restricciones textToImage/sin identidad real/sin imágenes de referencia/sin texto incrustado/sin captura real.
- Opciones genéricas: 8–30 iteraciones, guidanceStrength 1–10 y una imagen por solicitud. Sin sampler, scheduler ni parámetros específicos de un runtime.

Defaults conservadores de arquitectura: 288×512 (9:16), seed 42, 20 iteraciones y guidanceStrength 6. No son una configuración probada de ningún modelo. Render final: 1080×1920. Binding contain mantiene proporciones dentro de la caja visual de 1D; no estira la imagen hasta llenar el reel. No se ha evaluado calidad de estas dimensiones con IA real.

## Prompt

buildImageRequest combina descripción visual, narración como contexto que no debe escribirse en la imagen, propósito y tono/paleta del brand. Describe sujeto, ambiente, composición vertical y márgenes. Pide ausencia de texto, logos, interfaces reales e identidades concretas. Las referencias a Marcos/retrato/captura en descripción o narración se rechazan. No incorpora instrucciones de Remotion ni identificadores internos de composición. Títulos, captions e información estructurada siguen en el renderer o en localGraphic.

## Puerto y adaptador

GeneratedImageResolver implementa el puerto VisualResolver existente. ImageGenerationProvider es un puerto auxiliar con capability(), identity() y generate(request, AbortSignal), que devuelve bytes; no devuelve rutas arbitrarias.

La fábrica de infraestructura createLocalImageProvider devuelve siempre UnavailableImageProvider en esta instalación. No lee URLs, rutas de modelos ni variables de entorno para activar backends. No contiene transporte HTTP ni procesos de IA. Un futuro adaptador debe usar configuración controlada y declarar capacidad local real tras verificación. No basta con editar el JSON de VisualPlan para activar la generación.

El constructor permite inyección para tests. FakeImageProvider vive únicamente en tests, declara testOnly=true y requiere allowTestProvider explícito; sus outputs quedan technicalFixture. No se registra en la CLI. Produce un patrón PNG mediante código, no IA.

## Resolución, validación y errores

Resolver valida plan/request, capacidad, presupuesto de píxeles, contexto y producción. Usa timeout de 120 s y AbortSignal, sin reintento automático. El proveedor debe honrar cancelación; sin un backend real no se ha probado liberación de VRAM/procesos.

Salida máxima 20 MiB, firma PNG, archivo privado y luego importVisualAsset de 1D: inspección, decodificación completa, metadatos, normalización, hashes y dimensiones exactamente iguales a las solicitadas. Solo después se construye el VisualAsset y se permite el binding. Un archivo devuelto por el proveedor no se considera validado por ese hecho.

Errores nuevos UNAVAILABLE/TIMEOUT y errores existentes INVALID_SPEC, UNSUPPORTED_STRATEGY, CACHE_CORRUPT, STALE_PLAN y GENERATION_FAILED. Fallar no dispara otro resolver. Unavailable no crea archivos de imagen ni pasa un requirement a validated.

## Procedencia independiente del backend

VisualAsset amplía su contrato con type conceptualImage, source.kind generatedLocalAI y aiGeneration: resolver generatedImage-v1, recipeVersion 1, receiptHash, inputHash, promptHash, seed y contentHash. Solo se vincula a requirements image; no es presenter, screenCapture ni broll.

Se distingue de illustrativeGraphic/source generatedLocal/generation de 1E. Los nombres y versiones concretos del runtime/modelo se guardan en un recibo de infraestructura privado, referenciado por receiptHash. El asset semántico no incorpora nombres de proveedores. El recibo contiene identidad/modelHash opcional, request y parámetros, seed, promptVersion, hashes de entrada/prompt/salida/derivado, elapsedMs y reproducibility seeded-not-bitwise-guaranteed. No se promete reproducibilidad bit a bit de GPU.

## Caché y privacidad

Patrón de 1E, por producción, en `.local/productions/<id>/visual-assets/generated-ai/`. inputHash incorpora request normalizada completa, versión de prompt, identidad de modelo/runtime, parámetros, seed y versión del resolver/receta. Se guardan request JSON, PNG, recibo por inputHash y recibo sellado por hash. Los prompts no van al bundle ni al servidor de medios.

Hit: verifica request/identidad/hashes, vuelve a pasar 1D y comprueba el recibo sellado. Bytes o recibos corruptos provocan CACHE_CORRUPT. PNG sin recibo válido no se sobreescribe automáticamente. La caché no se comparte entre producciones. El servidor privado existente solo sirve derivados allowlisted, no estos prompts/recibos/originales. `.local/` ya está ignorado por Git.

No se añade red: el proveedor de producción está unavailable y las CLI conservan el bloqueo de TCP externo. Un futuro adaptador necesitará auditar su propio transporte/proceso, carga offline y cancelación. Las flags de safety expresan restricciones; deberán verificarse con un modelo real antes de afirmar calidad o seguridad de sus outputs.

## Alcance probado y pendiente

Pruebas con PNG técnico verifican contratos, cache y pipeline; no son integración IA. No hay imágenes IA reales, demo reel 1F, medición de VRAM bajo generación ni evaluación de calidad. Faltan runtime local compatible, dependencias de inferencia, checkpoint permitido y adaptador concreto, más smoke y evaluación de 2–3 imágenes tras autorización posterior. No se han instalado. STOP.
