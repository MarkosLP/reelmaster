# REELMASTER — FASE 1H

## Estado

**FINAL: PASS WITH ISSUES. FASE 1H cerrada con Reel técnico completado.** Marcos actualizó sus decisiones tras inspeccionar personalmente las seis imágenes. Las decisiones humanas vigentes están registradas y selladas; las anteriores y las inspecciones de Codex permanecen intactas.

| Concepto / candidato final | Decisión humana vigente     | Issues                                              | Estado final           |
| -------------------------- | --------------------------- | --------------------------------------------------- | ---------------------- |
| 1 / 2                      | ACCEPT                      | Ninguno                                             | `accepted` — aprobado  |
| 2 / 2                      | REJECT                      | wrongBackground, semanticMismatch, brandingMismatch | `manualReviewRequired` |
| 3 / 2                      | ACCEPT como metáfora visual | Ninguno; limitación literal aceptada en notas       | `accepted` — aprobado  |

**Dos ACCEPT humanos: mínimo cumplido.** Se completó únicamente el Reel técnico mixto previsto, con los conceptos 1 y 3, render, FFprobe y cinco stills inspeccionados. El concepto 2 queda excluido y sin intentos disponibles.

**Presupuesto agotado: 6/6 imágenes, dos por concepto; cero imágenes IA adicionales.** Sin cambios de modelo, dirección, prompt builder, workflow ni parámetros. Los stills son renders de las escenas con assets existentes, no nuevos candidatos.

[Reel técnico](../out/phase-1h/reel-technical-1h.mp4) · [Sellos y cierre](../.local/phase-1h/closure.json). **STOP**, sin iniciar otra fase.

## VisualDirector

Puerto independiente `VisualDirector`, con proveedor auxiliar `VisualDirectionProvider`. Entrada: narration, purpose, visualIntent, contentStyle y VisualBrandProfile. `LocalVisualDirector` valida entrada/salida y aplica un límite global de tiempo, una reparación y fallback conservador determinista. `OllamaVisualDirectionProvider` reutiliza el transporte local de 1B, sin cambiar su comportamiento anterior.

El director simplifica a objetos anónimos y una idea visual principal. No pide personas, manos, interfaces reales ni identidades. La mención editorial de Marcos/presenter/retrato/captura se rechaza antes de llamar al modelo. [Documentación e instrucciones](image-phase-1h.md).

## VisualDirection

Contrato Zod con subject, environment, action, composition, framing, lighting, mood, palette, forbiddenElements y semanticGoal. Separado de ImageGenerationRequest y sin runtime, sampler, CFG, renderer, rutas ni checkpoint.

`directionProfile(brand)` concentra el perfil oscuro: fondo negro/carbón, luz cinematográfica, acento derivado del RGB del brand, composición vertical centrada, márgenes y sujeto completo. El modelo debe conservar exactamente estos campos. La validación textual no prueba que la imagen final respete la dirección: esa diferencia se observa en los resultados.

## Ollama

Modelo local existente: **qwen2.5:7b-instruct**, digest `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`. Runtime Ollama 0.34.0. Inventario local verificado; ningún modelo se descargó. Antes del lote no había modelos cargados.

| Concepto              | Tiempo dirección | Intentos | Resultado                  |
| --------------------- | ---------------- | -------- | -------------------------- |
| IA organizando tareas | 21,865 s         | 1        | Dirección válida de Ollama |
| Agentes colaborando   | 11,732 s         | 1        | Dirección válida de Ollama |
| Idea a contenido      | 12,535 s         | 1        | Dirección válida de Ollama |

No hizo falta repair ni fallback en la ejecución real. Ambos mecanismos están probados con fixtures. Prompt versionado `visual-direction-prompt-v1`; director `visual-director-v1`; timeout configurado 180 s para todo el proceso de propuesta/repair. El modelo instruct se descargó de memoria al terminar las direcciones, conservando el servicio Ollama activo. Después se inició ComfyUI, sin competir ambos modelos durante la inferencia.

## Prompt builder v2

`concept-image-v2` construye el prompt únicamente desde VisualDirection. Descripción afirmativa y visual en inglés: objetos, acción, luz, entorno y encuadre. No copia narration, semanticGoal, códigos hexadecimales ni la lista de términos prohibidos al positivo. Se pide una sola escena continua con superficies sin marcas.

Se conservan `concept-image-v1`, sus requests y sus cachés previas. V2 añade visualDirectionHash, directorVersion, promptBuilderVersion y candidateNumber al request; estos campos entran en la caché existente junto con seed e identidad real de modelo/workflow/parámetros.

## No-text policy

Se impiden superficies de información en los campos positivos: infographic, poster, diagram, presentation, UI, dashboard, card, slide, document, labels, signs, typography, written information, papel y fondo blanco, además de texto/logos/personas/manos. La estrategia positiva usa objetos y superficies sin marcas; los términos negativos quedan como compatibilidad/provenance.

Se mantiene **CFG 1**. No se atribuye al negativePrompt capacidad de eliminar pseudotexto: su rama no participa en guidance con esta configuración. La política describe la intención editorial, no una garantía del output ni un detector automático.

## QualityReview

Contrato: technicalValid, editorialValid, issues, decision, candidateId, contentHash, reviewer, inspected, notes y fecha. Issues soportados: pseudotext, wrongBackground, semanticMismatch, severeArtifact, poorComposition, humanArtifact, brandingMismatch y technicalFailure.

La inspección visual de Codex tiene `reviewer.kind=codexInspection`. La decisión humana usa `reviewer.kind=human` y se guarda por separado. Solo un ACCEPT humano sellado puede promover el candidato y entrar al manifiesto. La asignación, el esquema del manifiesto y la verificación de archivos rechazan pendientes/rechazados y recibos alterados.

El presupuesto se reserva en disco antes de generar. Máximo dos intentos por requirement, con seeds distintas. ACCEPT impide más generaciones; REJECT registrado permite la segunda; segundo REJECT produce manualReviewRequired. Los fallos/crashes no reinician intentos. La caché corrupta de un candidato no se regenera silenciosamente.

La actualización humana se registró mediante una rectificación local explícita: se conservaron los recibos anteriores inmutables y las sesiones previas, se sellaron nuevas revisiones y registros con `previousReviewHash` / `reviewHash`, y se actualizó únicamente la revisión vigente de cada sesión bajo bloqueo de producción. No se añadió una API general de edición ni se relajó el CLI ordinario, que sigue impidiendo sobrescrituras. [Rectificaciones](../.local/phase-1h/human-decision-amendments.json); historial previo en `.local/phase-1h/history-before-human-amendment/`.

## Candidates

Seis imágenes reales en total; todos los candidatos pasaron validación técnica 1D y fueron abiertos e inspeccionados. Los candidatos 1 tienen REJECT humano confirmado. Los candidatos 2 tienen decisiones humanas vigentes selladas: ACCEPT, REJECT y ACCEPT, respectivamente.

| Concepto | Candidato | Seed       | Tiempo generación API | Decisión humana vigente  | Issues                                              | SHA-256                                                            |
| -------- | --------- | ---------- | --------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| 1        | 1         | 2026091201 | 16.160 s              | REJECT humano confirmado | semanticMismatch, poorComposition                   | `dc5ee20c8992dbc83502fa31d2cecfe7ed44a2f2bebab325945db6804c701ddf` |
| 1        | 2         | 2026091202 | 11.917 s              | ACCEPT humano confirmado | ninguno                                             | `2608268a74f0a243de1692545ea3476d4d8408cab05ddc08146b6361ebbe997b` |
| 2        | 1         | 2026091301 | 5.729 s               | REJECT humano confirmado | wrongBackground, semanticMismatch, brandingMismatch | `77346662452bb39572356d8fdafc82a2971c376817edb56bfab549c45411c9c4` |
| 2        | 2         | 2026091302 | 4.928 s               | REJECT humano confirmado | wrongBackground, semanticMismatch, brandingMismatch | `033c89e1f6993025cc4fe7a6d068754508f4f94cfd76c0f7d81aec0ee8780179` |
| 3        | 1         | 2026091401 | 4.748 s               | REJECT humano confirmado | poorComposition, semanticMismatch                   | `856e2957f140575d653709c3f2c7bd92f278ffaa1c436f32a48eea5a85502a32` |
| 3        | 2         | 2026091402 | 4.931 s               | ACCEPT humano confirmado | ninguno                                             | `e2e181ed3a3deb42aa3d560badf3be2be71819a33b0bf2d78834af0c99fb8695` |

No quedan generaciones disponibles. No hubo OOM, fallos ni reintentos técnicos. Configuración intacta: 512×768, batch 1, concurrency 1, SDXL-Lightning 2-step, Euler, sgm_uniform, CFG 1 y denoise 1.

## Concepto 1

[Candidato 1](../.local/phase-1h/concept-1-candidate-1.png). La dirección pedía un nodo central organizando elementos geométricos. El output es una cuadrícula de paneles verdes/grises, sin nodo organizador ni jerarquía central. Los elementos llegan hasta los bordes. Hay marcas pequeñas ambiguas, pero no se afirma una detección inequívoca de pseudotexto.

El color tiene relación parcial con dark-tech; la fidelidad conceptual y la composición son insuficientes. No aparecen personas ni manos. REJECT recomendado por semanticMismatch y poorComposition.

**Candidato 2:** [abrir imagen](../.local/phase-1h/concept-1-candidate-2.png). Núcleo luminoso centrado, con geometría ordenada y simétrica, ambiente oscuro y acento verde. Sin texto visible ni personas. Recomiendo **ACCEPT como metáfora de organización**, no como representación literal de tareas. La apariencia de túnel y densidad periférica son limitaciones, pero el foco central se lee con claridad. Decisión humana final de Marcos: **ACCEPT**, registrada y sellada.

## Concepto 2

[Candidato 1](../.local/phase-1h/concept-2-candidate-1.png). El output tiene aspecto de objeto de cristal verdinegro con armazón y reflejo, más cercano a una ilustración de producto que a las láminas de 1G. No se observa pseudotexto molesto.

Sin embargo, aparece sobre fondo gris claro y no representa tres agentes/nodos alrededor de un objetivo central. El encuadre contiene el objeto, pero no cumple la intención ni el fondo del brand. REJECT recomendado por wrongBackground, semanticMismatch y brandingMismatch.

**Candidato 2:** [abrir imagen](../.local/phase-1h/concept-2-candidate-2.png). Esfera/anillos de cristal verde dentro de un armazón sobre superficies claras. Sigue sin mostrar tres agentes y mantiene el incumplimiento de fondo oscuro. Recomiendo **REJECT** por wrongBackground, semanticMismatch y brandingMismatch. Sin pseudotexto molesto observado. Decisión humana final de Marcos: **REJECT**, registrada y sellada.

## Concepto 3

[Candidato 1](../.local/phase-1h/concept-3-candidate-1.png). Esfera tecnológica verde sobre fondo oscuro, con líneas luminosas; es la mejor aproximación al perfil cromático. No se observa pseudotexto claramente legible ni personas.

La esfera queda cortada por el borde derecho y no tiene el espacio respirable solicitado. No se aprecia la transformación de un núcleo/idea en piezas de contenido. REJECT recomendado por poorComposition y semanticMismatch.

**Candidato 2:** [abrir imagen](../.local/phase-1h/concept-3-candidate-2.png). Núcleo verde centrado, fondo oscuro y márgenes más amplios que el candidato 1. Sin texto visible. El encuadre mejora, pero sus anillos/filamentos no comunican literalmente toda la transformación hacia múltiples piezas de contenido. La inspección original de Codex recomendó REJECT por semanticMismatch y se conserva.

**Decisión humana vigente de Marcos: ACCEPT como metáfora visual**, aceptando expresamente que no representa literalmente toda la transformación. Rectifica el REJECT humano anterior; ambos recibos se conservan, enlazados mediante un registro de rectificación sellado. El ACCEPT vigente no lleva issues de rechazo; la limitación semántica queda explícita en sus notas. Estado final `accepted`, utilizado en la cuarta escena del Reel técnico.

## Comparación 1G

La comparación se basa en la inspección visual real de los outputs completos de ambas fases, no en scoring automático.

| Criterio             | 1G                                          | Primeros candidatos 1H                                                                                         |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pseudotexto          | Láminas con pseudotexto visible y molesto   | Ya no predomina la lámina informativa; 2 y 3 sin pseudotexto molesto observado, 1 con marcas pequeñas ambiguas |
| Dark-tech            | Fondos mayoritariamente blancos             | 3 lo aproxima bien, 1 parcialmente; 2 continúa claro                                                           |
| Fidelidad conceptual | Esferas/árboles genéricos, baja literalidad | Sigue insuficiente en los tres conceptos                                                                       |
| Composición          | Láminas completas, pero ajenas al objetivo  | Objeto completo en 2; cuadrícula sin foco en 1 y recorte del sujeto en 3                                       |
| Utilidad para Reel   | Prueba técnica, no publicable               | Mejoras parciales de estilo, sin aprobación editorial final                                                    |

No se afirma que la calidad global haya pasado. Cambiaron dirección, prompt y seeds a la vez; estas tres muestras no permiten aislar causalmente el efecto de cada cambio.

Tras inspeccionar también los candidatos 2, mejora la organización visual del concepto 1 y el encuadre del concepto 3. El concepto 2 conserva el fondo claro. Solo el concepto 1 alcanza mi recomendación de ACCEPT, como metáfora; no se declara éxito editorial general ni se atribuye causalidad a un único cambio. Tras inspección personal, Marcos confirmó ACCEPT para los conceptos 1 y 3 y REJECT para el concepto 2. La aceptación del concepto 3 como metáfora visual es una decisión humana explícita y no modifica retrospectivamente la inspección de Codex.

## Reel

**Creado y renderizado tras la actualización humana: PASS técnico.** Dos ACCEPT humanos vigentes permiten el Reel mixto previsto. El cierre anterior sin Reel queda conservado como historial, sustituido por esta nueva instrucción del usuario.

Producción: `production-31c232914cfa277ddb730f3df6ffb1ec29995b261279da0776a140fe16729f1d`, estado `rendered`, manifiesto `resolved`, cero requirements pendientes. Se verificaron los recibos humanos y los hashes de las imágenes al asignar y renderizar.

Secuencia de cinco escenas, tres segundos cada una:

1. textOnly: «DIRECCIÓN Y REVISIÓN».
2. localGraphic: Concepto / Candidato / Revisión humana.
3. generatedImage: concepto 1, candidato 2 aprobado.
4. generatedImage: concepto 3, candidato 2 aprobado como metáfora.
5. textOnly: «REVISIÓN COMPLETADA».

[MP4 entregable](../out/phase-1h/reel-technical-1h.mp4): **1.571.815 bytes**, SHA-256 `58260328a0cfffa333c7ae04fdcd0dd1678522e914a725b9958ed7563f83576e`. Copia cotejada con el original. FFprobe: H.264/AAC, yuv420p, BT.709, **1080×1920, 30 FPS, 450 frames, 15 s de vídeo**; audio estéreo a 48 kHz y duración del contenedor 15,061333 s. [Validación completa](../.local/phase-1h/render-validation.json).

Audio técnico de tonos, sin voz ni TTS. Captions estimados mediante el flujo existente; esta demo no acredita alineación con voz hablada. No se modificó audio, alignment, caption timing, CaptionLine ni renderer.

Cinco stills abiertos e inspeccionados directamente a los frames centrales 45, 135, 225, 315 y 405:

| Escena | Still                                    | Inspección                                                                                                               |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1      | [Frame 45](../out/phase-1h/scene-1.png)  | Título y caption legibles, marca y gráfico IA dentro de márgenes.                                                        |
| 2      | [Frame 135](../out/phase-1h/scene-2.png) | Gráfico y tres pasos legibles, sin recortes; título repetido entre cabecera y gráfico como limitación menor del fixture. |
| 3      | [Frame 225](../out/phase-1h/scene-3.png) | Concepto 1 centrado, imagen completa sin deformación; título y caption separados.                                        |
| 4      | [Frame 315](../out/phase-1h/scene-4.png) | Concepto 3 centrado y completo, texto legible; uso metafórico conforme al ACCEPT humano.                                 |
| 5      | [Frame 405](../out/phase-1h/scene-5.png) | Cierre y caption legibles, sin solapamiento.                                                                             |

Las dos imágenes usan `contain`, con bandas laterales que conservan su proporción y evitan recortes. Los textos visibles los añade el renderer; no se confunden con pseudotexto generado. [Inspecciones y hashes de stills](../.local/phase-1h/still-inspection.json). La inspección corresponde a cinco fotogramas, no a reproducción audiovisual completa.

## Rendimiento

Primer lote ComfyUI: arranque 35,521 s; primera generación 16,160 s; calientes 5,729 s y 4,748 s. Los totales de candidato incluyen además hash del checkpoint, validación/import y almacenamiento; métricas completas en los registros de sesión.

PNG: 450.039, 519.178 y 601.036 bytes. No se cambió ningún parámetro de GPU ni se añadió monitorización al producto. ComfyUI inició el PID 30228 y quedó cerrado al final del lote; no quedó listener en 8188. Ollama continúa como servicio, sin modelos cargados.

Segundo lote ComfyUI: arranque 14,494 s; generaciones 11,917 s, 4,928 s y 4,931 s. PNG de candidatos 2: 653.115, 492.047 y 473.533 bytes. El backend propio (PID 30636) se cerró al terminar. Los hashes de configuración, direcciones, workflow, provider y prompt builder coinciden con los tomados antes de este segundo lote.

Render, FFprobe y cinco stills: **39,592 s** medidos dentro de `render-production`; sin inferencia de imagen adicional.

## Tests

**151/151 PASS**, sin fallos ni skips. Incluyen schema/dirección válida e inválida, repair limitado, timeout, fallback, perfil derivado del brand, prompt v2, no-text policy, simplificación, identidad rechazada, quality review, aceptación del primer candidato, rechazo→segundo, segundo rechazo→manualReviewRequired, límite persistente, evidencia rechazada sin selección automática, provenance/caché, corrupción de bytes/recibos, fallo técnico que consume intento y regresiones anteriores.

Los tests normales no arrancan Ollama ni ComfyUI reales. Los resultados con fake provider están separados de los seis PNG reales; no se presentan como prueba de calidad.

## Validaciones

- `npm ci --offline --no-audit --no-fund`: PASS, 344 paquetes desde caché.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: PASS, 151 pruebas.
- `npm run format:check`: PASS.
- `npm run build:renderer`: PASS; se corrigió un BOM de package.json que provocó un fallo inicial, sin tocar el renderer.
- `npm run discover`: PASS, baseline ReelDemo 1080×1920 a 30 FPS y 695 frames.
- Ollama real y seis generaciones ComfyUI: PASS técnico.
- Inspección y comparación: ejecutadas; seis decisiones humanas vigentes, dos aceptaciones y cuatro rechazos; nueve recibos humanos históricos y tres rectificaciones selladas verificados.
- Reel técnico, FFprobe y cinco stills: PASS; dos ACCEPT humanos vigentes, conceptos 1 y 3 seleccionados.

Verificación de cierre: schemas de las tres sesiones, seis decisiones vigentes, nueve sellos humanos históricos y tres registros de rectificación correctos; hashes de los seis PNG intactos. Estados finales `accepted` / `manualReviewRequired` / `accepted`. Seis outputs de ComfyUI; configuración, direcciones, workflow, provider y prompt builder sin cambios. Veintitrés archivos protegidos de audio, captions, composición y snapshot coinciden con el baseline. MP4 original y copia coinciden por SHA-256; producción `rendered` y manifiesto `resolved`.

Las 151 pruebas corresponden a la validación de implementación previa. En esta continuación no se cambió código del producto; se ejecutaron los comandos existentes de demo y render, con validación de medios y sellos, y se actualizó evidencia/documentación.

## Regresiones

Los hashes de inicio muestran intactos VozMarcos, audio pipeline, alignment, caption timing, CaptionLine, renderer, snapshots y archivos de demos anteriores. Las pruebas 0B–1G pasan. No se modifican las cachés ni el builder v1; los cambios son aditivos para v2 y revisión editorial.

La infraestructura de assets amplía únicamente la comprobación de revisión para assets que llevan provenance editorial. Los assets legacy mantienen sus comprobaciones anteriores. Auditoría completa y sesiones en `.local/phase-1h/evidence.json`.

## Coste

**0 € API.** Inferencia de dirección e imagen local. No se han enviado prompts, imágenes ni metadata a servicios externos.

## Descargas

**NINGUNA.** Se reutilizaron Ollama, qwen2.5:7b-instruct, ComfyUI, SDXL-Lightning, herramientas locales y caché npm. Sin checkpoint nuevo, LoRA, ControlNet, upscale, OCR ni visión.

## Deuda técnica

- La dirección estructurada y el positivo mejorado no garantizan fidelidad ni encuadre: persisten fallos semánticos y de fondo tras dos candidatos por concepto.
- La decisión humana sigue siendo manual y local. La etiqueta human no autentica por sí misma a una persona; el CLI debe alimentarse con una decisión real del usuario.
- Los intentos reservados tras crash quedan pendientes de revisión; no se recupera presupuesto silenciosamente.
- La API de resolución legacy sigue disponible para compatibilidad; los comandos de calidad activan el nuevo flujo explícitamente.
- La primera generación incluye carga/hash y puede ser considerablemente más lenta que una generación caliente.

## Recomendación

**FINAL: PROMPTING STILL INSUFFICIENT** para obtener fidelidad semántica consistente de los tres conceptos. Esto es compatible con haber alcanzado el mínimo de dos ACCEPT humanos para la demo técnica: Marcos aprueba los conceptos 1 y 3 como metáforas visuales; el concepto 2 continúa rechazado por fondo, semántica y marca.

La arquitectura, el control humano, el render y FFprobe pasan. Se conserva **PASS WITH ISSUES** por las limitaciones editoriales y el concepto 2 en `manualReviewRequired`. No se declara una limitación absoluta del modelo a partir de seis muestras ni aprobación para el Reel real de Marcos.

## Continuidad

FASE 1H cerrada con Reel técnico entregado. Presupuesto agotado, sin nuevas imágenes ni cambios de modelo o parámetros. La nota [CONTINUAR-MANANA.md](../CONTINUAR-MANANA.md) refleja las decisiones vigentes y los artefactos finales. Los documentos dentro de `history-before-human-amendment/` describen el cierre anterior sustituido y no deben interpretarse como el estado actual.

Para un futuro trabajo expresamente autorizado, se recomienda valorar plantillas visuales más específicas o un proceso editorial adicional para la fidelidad semántica. Ninguna fase posterior está iniciada.

**STOP. No generar más imágenes ni iniciar otra fase.**
