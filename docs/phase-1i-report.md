# REELMASTER — FASE 1I: primera ejecución

**Resultado actual: PASS WITH ISSUES. Reel con voz real renderizado y entregado para valoración humana.** Se completó el recorrido desde idea mediante una adaptación visual autorizada. Las secciones iniciales documentan las pausas y el draft original; el cierre al final describe la revisión renderizada vigente. Fases 0B–1H intactas, sin iniciar 1J.

## Texto exacto que Marcos debe grabar

Graba únicamente los cinco párrafos siguientes, en orden, dejando una pausa clara entre escenas. No leas encabezados ni tiempos. Un único archivo, a ritmo natural: los 30 segundos son una referencia editorial, no una duración medida. No acelerar para ajustarse al presupuesto.

¿Sabías que la IA puede ahorrarte tiempo en tareas cotidianas?

Primero, la IA puede responder preguntas rápidamente, como el tiempo o recetas.

Segundo, puedes usarla para programar recordatorios y listas de tareas.

Y tercero, la IA puede analizar datos y generar informes automáticamente.

Prueba estas 3 formas sencillas de ahorrar tiempo con la IA.

[Narration.txt exacto](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/narration.txt). El archivo incluye las instrucciones y referencias editoriales del pipeline existente. Son **54 palabras** generadas por Ollama, sin edición manual.

## Entrada y generación real

Idea: «3 formas sencillas de utilizar la inteligencia artificial para ahorrar tiempo cada día.» Español de España, público general no técnico, educativo y dinámico, 30 segundos, `voice-marcos`, vertical 9:16. El contrato representa el estilo como `educational`; el matiz dinámico viajó en la audiencia del CLI existente, sin añadir un nuevo enum.

`generate:reel` → TextProvider / OllamaTextAdapter → Ollama local `qwen2.5:7b-instruct`, runtime 0.34.0. Prompt `reel-content-v1.1`, perfil Marcos v1; temperatura 0.2, seed 42, máximo 3000 tokens. Un intento válido, **37,826 s**, sin repair ni guion manual. La normalización existente de tiempos editoriales suma 30000 ms y no estima duración acústica.

[ReelDraft](../.local/phase-1i/reel-draft.json) · [Generación y provenance](../.local/phase-1i/generation.json). Hash del draft: `b81d62d8321050bc29674c84040f9d26bdfdd083d57b7a4ebc5fb7f0bb482ec2`.

## Escenas y VisualPlan preliminar

| Escena | Propósito   | Tiempo editorial | visualIntent generado | Resolución actual |
| ------ | ----------- | ---------------- | --------------------- | ----------------- |
| 1      | hook        | 5.464 s          | avatarTalking         | manualRequired    |
| 2      | explanation | 6.357 s          | screenDemo            | manualRequired    |
| 3      | example     | 6.358 s          | screenDemo            | manualRequired    |
| 4      | example     | 6.357 s          | screenDemo            | manualRequired    |
| 5      | cta         | 5.464 s          | avatarTalking         | manualRequired    |

El hook es la primera narración; el CTA es la quinta. `onScreenText=null` en las cinco escenas. No se añadieron títulos manuales para mejorar artificialmente el resultado.

**Recursos automáticos en este draft: ninguno.** La política existente conserva la identidad y veracidad de los recursos solicitados: dos presenters Marcos y tres screenCapture son manuales. No se generó ningún avatar, captura simulada ni b-roll. La etiqueta `avatarTalking` del modelo es una intención pendiente, no un asset creado ni autorización para sintetizar a Marcos.

**Recursos manuales:** imagen/vídeo real autorizado de Marcos para escenas 1 y 5, y capturas reales adecuadas de preguntas/respuestas, tareas/recordatorios e informes para escenas 2, 3 y 4. La compatibilidad de cada archivo se validará por el contrato existente; no se afirma que un archivo ya esté disponible.

La aplicación puede resolver textOnly con Remotion y gráficos informativos conceptuales mediante LocalGraphicResolver, pero el modelo no eligió esas intenciones en esta ejecución. No se reescribió el draft ni se sustituyeron silenciosamente pantallas reales por gráficos. Tampoco hay una intención de imagen conceptual IA que justifique llamar al VisualDirector o a ComfyUI. Si se acuerda posteriormente un cambio editorial, requerirá una decisión explícita y respetar la identidad de producción.

## Producción y artefactos canónicos

`prepare:production` consume el resultado original generado, valida su hash y usa createProductionPlan → waitingForNarration. `production:resolve-visuals` se ejecutó **sin --execute**, únicamente para planificación preliminar. Sin estructuras paralelas: los archivos de producción son los contratos existentes; las copias en phase-1i son evidencia.

Producción: `production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b`.

- [ProductionPlan](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/production-plan.json).
- [NarrationManifest](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/narration-manifest.json).
- [narration.txt](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/narration.txt).
- [VisualPlan preliminar](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/visual-plan.json).
- [VisualAssetManifest y requirements](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/visual-manifest.json).
- [Plantilla de revisión de grabación](../.local/productions/production-6fcd8175edb0d8416f7a9fb8d22453098f6f3f73d2fa2ddad9b1f6bbf8081e3b/recording-review.template.json).

La voz es `voice-marcos`, origen `recorded`. Cero recursos asignados, cinco requirements visuales pendientes. No hay importación, duración acústica, PreparedReel, CompositionSnapshot ni MP4 para esta producción. La pausa en waitingForNarration es intencionada y no un fallo.

## Huecos de producto observados

1. El perfil editorial existente sugiere avatarTalking y screenDemo. El resultado real solicita cinco recursos manuales: no hay todavía selección semántica que priorice gráficos/texto cuando bastan para comunicar una lista. Esa dependencia limita la automatización desde una idea.
2. Las afirmaciones sobre el tiempo, programar recordatorios e informes son genéricas: el guion no concreta herramientas, acceso a datos actuales ni integraciones necesarias. Esto queda como deuda editorial del texto generado, sin introducir correcciones manuales ni presentarlo como una demostración verificada.
3. El tercer ejemplo, analizar datos e informes, puede resultar menos cotidiano para el público general. El CTA también es genérico. La validación estructural no garantiza utilidad editorial.
4. Los campos onScreenText quedan vacíos. El esquema lo permite; habrá captions del audio mediante el pipeline existente, pero todavía no se ha probado su resultado en esta producción.
5. El flujo de calidad 1H existe, pero su CLI quality:images está ligado a los tres conceptos de su fixture. El resolver genérico conserva la ruta legacy. Si en una continuación se necesitara una imagen IA para esta producción, habría que conectar los contratos/sesiones de 1H a esa producción sin saltarse la revisión humana ni usar generación legacy como aceptación editorial. No se implementa ni ejecuta esa conexión en esta pausa.
6. La grabación, revisión de puntos de corte y archivos visuales reales requieren intervención humana. Duración real, captions y render se comprobarán después de recibir la narración, dentro de esta misma producción.

## Tests y regresiones

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: **151/151 PASS**, sin fallos ni skips; regresiones existentes 0B–1H incluidas.
- `npm run format:check`: PASS.
- **2158 archivos preexistentes verificados por SHA-256, cero cambios**: código, tests, scripts, documentación anterior, evidencias 1H y producciones anteriores. No se modifica audio, alignment, CaptionLine, caption timing, renderer ni configuración/modelos.
- Generación real con validación de schema y hash; preparación y planificación mediante comandos existentes: PASS.
- Comprobación específica: draft original idéntico al del plan, estado waitingForNarration, sin imports ni visual-assets de esta producción.

No se reinstalaron dependencias ni se ejecutó build/render: no cambió código del producto y la prueba debe parar antes de recursos y audio. [Regresiones](../.local/phase-1i/regressions.json) · [Evidencia](../.local/phase-1i/evidence.json).

## Coste, límites y continuidad

**API 0 €, ninguna descarga ni servicio externo.** Ollama se descargó de memoria al finalizar la generación; no se arrancó ComfyUI. Cero imágenes, cero audio generado, cero renders. No se usó VozMarcos previo para esta narración.

**STOP obligatorio.** Entregar el texto y esperar a que Marcos aporte la grabación y autorice continuar 1I. En esa continuación: inspeccionar/importar el audio y su revisión, medir duración real, preparar escenas/captions y resolver los recursos pendientes utilizando esta misma producción. No iniciar 1J ni otra producción para sustituirla.

## Continuación: grabación recibida

Se encontró `.local/recordings/grabacion.m4a`: AAC, estéreo, 48 kHz, 626196 bytes, duración informada 24,768 s. `inspect:narration` validó el formato y la decodificación completa sin errores. Hash `b568bd29e38469de45618f9ef6c5573bf6248fa3c6bc6e43078e06b4a5554871`. Original intacto.

Se detectaron pausas con FFmpeg (-35 dB, mínimo 0,3 s). Cortes propuestos en pausas largas: 5,028 / 10,497 / 15,828 / 20,622 s. Son propuestas por energía, no identificación de palabras ni revisión humana. No se ha escuchado/transcrito el audio ni afirmado que coincide exactamente con el guion.

El contrato existente `RecordingReviewSchema` exige `exactScriptRead=true` y `boundariesReviewed=true`; no se pueden afirmar a partir de la detección de silencios. Preparado [review pendiente](../.local/phase-1i/recording-review.pending.json) con ambos campos false, ligado a los hashes de esta producción y grabación. Espera confirmación humana del texto y los cuatro cortes antes de importar; sigue `waitingForNarration`, sin PreparedReel ni render.

## Continuación: narración confirmada e importada

Marcos confirmó el texto y los cuatro cortes propuestos. Se registró recording-review.confirmed.json con ambos campos de revisión true y se ejecutó import:narration sobre la misma producción. Estado actual **prepared**, todavía no renderable por los cinco recursos visuales manuales pendientes.

Duración real: **24,768 s**, 5,232 s menos que los 30 s editoriales (-17,44 %). Duraciones de escenas: **5,028 / 5,469 / 5,331 / 4,794 / 4,146 s**. La conversión PCM a 48 kHz conserva la duración y el original; sin acelerar, recortar silencios ni sustituir voz.

PreparedReel, cinco WAV de escena y captions preparados mediante el pipeline existente. Timing de captions **estimated**, no alineación fonética ni STT. Verificados hashes de audio, vínculo de captions y límites temporales de todos sus tokens. Código de src/scripts intacto frente al baseline. No se repitió la suite ya validada porque no hubo cambios de código; importación y comprobaciones reales PASS.

La consulta inicial de estado usó por error --plan, rechazado por el CLI; se repitió correctamente con --production y confirmó prepared y cinco requirements pendientes. No se modificó código para esa corrección.

Sin imágenes nuevas, audio sintético, CompositionSnapshot ni MP4. Siguiente decisión: aportar los recursos reales del visualIntent generado o autorizar una adaptación editorial de visuales hacia texto/gráficos. No se ha cambiado el guion ni sustituido silenciosamente los recursos manuales.

## Cierre: adaptación visual autorizada y MP4

Marcos autorizó «adelante luego la valoraremos» ante la propuesta concreta de títulos para apertura/cierre y gráficos locales para los tres ejemplos. Se conservaron todas las narraciones de Ollama, la grabación original y los cuatro cortes confirmados. Solo se editaron visualIntent y onScreenText para esa adaptación.

La identidad de ProductionPlan depende del hash de todo el draft: el cambio visual requiere **una revisión vinculada con nuevo productionId**, no alterar el original ni sus sellos. El plan original permanece prepared como historial, y la revisión autorizada es `production-e4557182aafcc52843f4af671cf6489debfeadc14e6c87a46790cf45af58d259`. Esto evidencia otro hueco de producto: no existe aún un comando general de revisión visual que conserve una identidad de proyecto estable. Se usaron los contratos existentes, sin modificar schemas ni código del producto. [Vínculo y autorización](../.local/phase-1i/visual-revision.json).

La grabación se reimportó para sellar la revisión con sus nuevos hashes; **los cinco contratos de audio y los cinco de captions son idénticos a los originales**, comprobados por igualdad completa. Sin nueva grabación, sin TTS, sin modificar alignment ni caption timing. Se resolvieron tres gráficos locales con LocalGraphicResolver y apertura/cierre textOnly con Remotion. Cero imágenes IA, ninguna llamada a ComfyUI ni VisualDirector: no eran necesarios para estas intenciones.

[MP4 para valorar](../out/phase-1i/reel-1i-marcos.mp4): **1880097 bytes**, SHA-256 `ffd92ada164f3aa378e035f6e59e4d521224cc6d3ee9707c0a05a281ecbdcd67`. Estado `rendered`, manifiesto `resolved`, cero requirements pendientes en la revisión. FFprobe PASS: H.264/AAC, 1080×1920, 30 FPS, **743 frames**, vídeo 24.766667 s; audio 24.810667 s. Grabación original 24,768 s; la pequeña diferencia del vídeo corresponde al ajuste a frames. Render + FFprobe + cinco stills: **50.989 s**.

[CompositionSnapshot](../.local/phase-1i/composition-snapshot.json) · [Evidencia y FFprobe completos](../.local/phase-1i/render-evidence.json) · [Verificación de voz/captions](../.local/phase-1i/visual-revision-verification.json).

Los cinco stills se abrieron e inspeccionaron a los frames 75, 233, 395, 547 y 681: títulos y captions legibles, sin recortes ni solapamientos observados. Limitaciones visibles: los tres gráficos repiten sus títulos y la narración, tienen bastante espacio vacío y poca variedad. Esto valida el recorrido técnico, pero no demuestra un Reel editorialmente dinámico o aprobado para publicar. No se afirma haber escuchado el vídeo ni validado perceptualmente su sincronía; el timing sigue estimated y queda para valoración humana. [Inspección](../.local/phase-1i/still-inspection.json).

La suite previa de 151 tests, lint, typecheck y formato pasó; no hubo cambios de producto en esta continuación. Comprobaciones adicionales: narración, audio y captions idénticos; código/tests/informes previos y evidencias 1H intactos; render y FFprobe correctos; copia MP4 cotejada por hash. Ningún modelo nuevo ni descarga, **API 0 €**.

**FASE 1I: recorrido técnico completado con intervención editorial, PASS WITH ISSUES. STOP para valoración de Marcos. No iniciar 1J ni publicar.**
