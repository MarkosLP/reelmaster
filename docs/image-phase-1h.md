# FASE 1H: dirección visual y revisión editorial

Esta fase separa la validez técnica de una imagen de su aceptación editorial. Conserva el provider real de 1G, el checkpoint instalado, la validación 1D y el renderer. No incorpora visión automática, OCR, scoring, modelos nuevos, voces ni UI.

## Dirección antes del prompt

`VisualDirection` es un contrato Zod independiente de `ImageGenerationRequest`: subject, environment, action, composition, framing, lighting, mood, palette, forbiddenElements y semanticGoal. No permite detalles del runtime, rutas ni identidades personales. El perfil actual limita los sujetos a objetos/metáforas anónimos; es más conservador que permitir personas genéricas en planos lejanos.

El puerto `VisualDirector` recibe narration, purpose, visualIntent, contentStyle y VisualBrandProfile. `LocalVisualDirector` valida entrada/salida y utiliza un puerto auxiliar `VisualDirectionProvider`, independiente del provider de imágenes. `OllamaVisualDirectionProvider` adapta el transporte local ya validado de 1B, con su inventario de modelos instalados, rechazo de modelos cloud, límites HTTP y redirects prohibidos.

Prompt del director: `visual-direction-prompt-v1`. Modelo preferido: el instruct instalado de 1B. Una propuesta y, si su estructura/perfil son inválidos, **un único repair**. El timeout cubre el conjunto; un proveedor no cooperativo no bloquea indefinidamente el resultado. Fallo/timeout o dos propuestas inválidas producen un fallback determinista de objetos simples. Una cancelación explícita no se convierte en éxito por fallback. El CLI registra un fallo de conexión y usa fallback sin descargar sustitutos.

`directionProfile(brand)` centraliza ambiente oscuro, luz cinematográfica, composición vertical centrada y márgenes respirables. Paleta e identidad provienen del brand; el nombre visual del acento se deriva de sus RGB. Se exige que el director preserve los campos del perfil. Narración y descripción se tratan como datos, no como instrucciones ejecutables.

## Prompt v2 y no-text policy

`buildDirectedImageRequest` solo recibe una dirección validada y datos de identidad/seed. Escribe una descripción visual concisa en inglés. No copia narration, semanticGoal, códigos hexadecimales, el guion completo ni la lista de elementos prohibidos al prompt positivo.

El positivo describe una sola escena continua, objetos, luz, fondo oscuro y superficies sin marcas. La dirección se valida para impedir personas, manos protagonistas y superficies de información. Las referencias a poster, infographic, diagram, presentation, UI, dashboard, card, slide, document, labels, signs, typography, written information, papel y fondo blanco se excluyen de los campos positivos. La lista negativa se mantiene como restricción editorial y provenance; **CFG 1 no utiliza su rama de guidance**, por lo que no se le atribuye eficacia inexistente.

Solo se usa el perfil validado de 1G: 512×768, batch 1, 2 pasos, CFG 1, Euler, sgm_uniform, denoise 1 y concurrencia 1. No se han añadido parámetros ni optimizaciones de GPU.

## Candidatos y estados

`ImageCandidateSession` guarda un registro por producción/requirement en `image-candidates/`. El contexto incluye VisualPlan, dirección, seeds, modelo/workflow/parámetros y versión del builder. Cambiar ese contexto no reinicia silenciosamente el presupuesto.

1. Se reserva candidate 1 en disco antes de invocar el provider.
2. `GeneratedImageResolver.generateCandidate` reutiliza el workflow y caché de 1G, pasa los bytes por 1D y devuelve un `technicalAsset` provisional. No se asigna al manifiesto.
3. Codex abre el PNG y registra una inspección explícita con `reviewer.kind=codexInspection`. Esto no es visión automática ni una aprobación humana.
4. Una revisión final con `reviewer.kind=human` puede ACCEPT o REJECT. El hash de los bytes inspeccionados debe coincidir.
5. Solo REJECT con motivos permite candidate 2, usando la segunda seed explícita. ACCEPT impide generar por gusto. Un segundo REJECT termina en `manualReviewRequired`.

Los fallos técnicos también consumen un intento reservado; un crash no crea presupuesto nuevo. La recuperación de caché corrupta de 1G continúa para solicitudes legacy, pero no regenera automáticamente candidatos v2. El máximo de dos intentos nunca se amplía por reparación de caché.

Los estados provisionales y de rechazo permanecen en evidencia. `acceptedAsset()` exige revisión humana sellada y bytes intactos. El esquema del manifiesto, la asignación y la verificación de archivos rechazan candidatos pendientes/rechazados. La lectura para render verifica además el recibo humano y su hash. `GeneratedImageResolver.resolve` rechaza directamente solicitudes v2: deben pasar por la sesión de candidatos.

## ImageQualityReview

Incluye technicalValid, editorialValid, issues, decision, candidateId, contentHash, reviewer, inspected, notes y fecha. ACCEPT exige ambas valideces, ausencia de motivos de rechazo y contenido validado; REJECT exige motivos y editorialValid=false. Issues: pseudotext, wrongBackground, semanticMismatch, severeArtifact, poorComposition, humanArtifact, brandingMismatch y technicalFailure.

La inspección de Codex y la decisión humana se almacenan por separado. Las decisiones finales son inmutables por el API de sesión. Una revisión de otro candidato, unos bytes modificados o un archivo de revisión alterado no se pueden seleccionar como aceptados. Se trata de un flujo local de confianza, sin autenticación ni firmas criptográficas de personas; el campo human registra una decisión que debe proceder realmente del usuario, no prueba su identidad por sí mismo.

## Provenance y compatibilidad

Se conserva `concept-image-v1` y sus hashes/recibos originales; no se migran ni sobreescriben cachés de 1G. V2 añade directionProvenance al request: visualDirectionHash, directorVersion, promptBuilderVersion y candidateNumber. Como el inputHash existente incluye request e identidad completos, incorpora dirección, seed, modelo, workflow y parámetros.

El asset aceptado añade provenance editorial con reviewDecision, reviewIssues y reviewHash; el recibo humano privado está sellado por hash. El recibo de generación mantiene el runtime/modelo y parámetros reales de 1G. El asset semántico y los contratos del renderer siguen sin conocer el backend. Las rutas de 1G permanecen como compatibilidad legacy; el flujo dirigido se activa explícitamente con los comandos de calidad.

## Ejecución local de esta fase

```powershell
$env:REELMASTER_COMFY_CONFIG = (Resolve-Path .local/phase-1h/comfy-config.json).Path
npm run quality:images -- direct --real-local
npm run quality:images -- generate --real-local
npm run quality:images -- status --real-local
```

`direct` crea las tres direcciones y no las sobrescribe si ya existen. Ollama genera solo dirección, no imágenes. Después se descarga de memoria únicamente el modelo instruct usado por el lote, manteniendo el servicio activo. ComfyUI conserva el lifecycle/ownership de 1G y se cierra si lo inició ReelMaster. Los dos backends no generan simultáneamente.

Para registrar una inspección o decisión sobre un candidato concreto:

```powershell
npm run quality:images -- inspect --real-local --concept 1 --file .local/phase-1h/inspection-1.json
npm run quality:images -- review --real-local --concept 1 --file .local/phase-1h/human-review-1.json
```

El fichero debe cumplir ImageQualityReview; el segundo comando solo debe ejecutarse con la decisión humana explícita. Un segundo candidato se solicita con `generate --concept 1`, tras REJECT registrado. No hay generación automática al cargar una imagen rechazada.

```powershell
npm run demo:quality -- --technical
```

El comando se niega a crear un Reel con menos de dos ACCEPT humanos. Si hay al menos dos, elige los dos primeros conceptos aceptados en orden, conserva las imágenes y recibos, y prepara una producción nueva textOnly/localGraphic/generatedImage/generatedImage/textOnly. Audio técnico de tonos, sin voz. No modifica el audio, alignment ni captions de las producciones anteriores. El render final usa `render:production -- --plan <plan> --stills` sin cambios en el renderer.

Los tests normales siguen sin arrancar Ollama ni ComfyUI reales. El test real de esta fase es explícito y tiene un máximo de seis imágenes para los tres conceptos. Todos los datos permanecen locales y el coste de API es 0 €. STOP al cerrar 1H.
