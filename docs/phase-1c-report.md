# Entrega de FASE 1C

## Estado

**PASS WITH ISSUES.** Flujo de producción local implementado y validado. Demo real creada en waitingForNarration, tal como se solicitó; sin narración inventada ni reutilización de VozMarcos para el nuevo texto. La importación y compilación se verificaron con audio técnico sintético explícitamente identificado como tal, no como voz real. No existe aún grabación nueva correspondiente al guion de la demo. Revisión humana del texto leído y los cortes necesaria; captions estimados, recursos visuales pendientes y recuperación de interrupciones limitada. Ninguna fase posterior iniciada.

## ProductionPlan

Contrato Zod strict con ID estable, draftContentHash, draft completo, VoiceProfile, PresenterProfile, NarrationSource, narrationHash, assetRequirements y state discriminado. Título, locale, target, textos e intents se preservan dentro del draft, sin duplicación ni frames. Identidad SHA-256 de versión, contenido, voz, presentador y modo; estado fuera de esa identidad. [Contrato detallado](production-phase-1c.md).

## NarrationManifest

productionId, draftContentHash, narrationHash, title, voiceProfileId, locale, targetDurationMs, fullScript, instrucciones y escenas con sceneId/order/narration/estimatedDurationMs/visualIntent. Texto exacto del draft. narration.txt separa claramente instrucciones y bloques ESCENA N, con estimaciones orientativas.

Archivos reales de la demo:

- [Guion listo para revisar y grabar](../.local/productions/production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6/narration.txt).
- [Manifiesto de narración](../.local/productions/production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6/narration-manifest.json).
- [Plan de producción](../.local/productions/production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6/production-plan.json).
- [Plantilla de revisión, inicialmente no aprobada](../.local/productions/production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6/recording-review.template.json).

## Presenter Marcos

PresenterProfile mínimo: id=presenter-marcos, displayName=Marcos, defaultVoiceProfileId=voice-marcos. VoiceProfile original de 1A intacto. Sin AvatarProfile ni assets ficticios; el ID deja una referencia para futuras asociaciones visuales.

## Visual requirements

avatarTalking→presenter, screenDemo→screenCapture, broll→broll, image→image; todos pending. textOnly→none/notRequired. Scene ID, descripción y preferencia de fuente preservados. La demo necesita dos recursos presenter y tres screenCapture. No se resuelven ni se sustituyen automáticamente. Solo escenas textOnly pueden utilizar ahora la tipografía existente para renderizar.

## Estados

draft → waitingForNarration → narrationReady → prepared → renderable → rendered.

Sin saltos ni regresiones. A partir de narrationReady se exige recibo vinculado a hashes del guion y audio; prepared añade preparedHash y rendered añade videoHash. Assets pendientes bloquean renderable. Los comandos guardan estado después de validar y escribir derivados, con lock local y actualización atómica del JSON del plan.

## Narración grabada

Un único archivo en `.local/recordings/`. Inspección mediante inspect:narration; importación con import:narration --plan --audio --review. Se exige declaración humana de lectura exacta y revisión de cortes, ligada por hashes a plan, guion y archivo. La plantilla no viene aprobada. No hay reconocimiento de voz que verifique esa declaración automáticamente.

WAV/M4A/MP3/FLAC/OGG, hasta 50 MiB, audio único mono/estéreo 8–96 kHz, 1–60 s. FFprobe, codec/sample rate/canales/duración y decodificación FFmpeg comprobados; derivados PCM16 estéreo a 48 kHz sin acelerar, aplicar LUFS ni retirar silencios. Original comprobado intacto. Cada escena ≥1 s; no se recorta una grabación que exceda límites. El archivo 1A se rechaza por hash en esta ruta incluso renombrado.

N−1 cortes humanos en ms, en orden y dentro de silencios detectados a −40 dB con margen ≥80 ms por lado. No se convierte la receta específica de VozMarcos en una heurística general. Todo permanece privado, sin envío a TextProvider, Internet, public ni bundle.

## Timing

Duraciones/muestras: MEASURED. Palabras/líneas: ESTIMATED, método es-syllables-speech-regions-v1 existente. No se produce ALIGNED ni se activa karaoke. Fronteras etiquetadas human-reviewed-silence-boundaries, no forced alignment.

Cada escena y total conservan estimación, duración medida, deltaMs y deltaPercent con signo. Test técnico: target=15000 ms, audio=4000 ms, delta=−11000 ms/−73.33%; snapshot=120 frames a 30 FPS. La concatenación de segmentos reproduce exactamente las 192000 muestras del PCM48; la fuente técnica mono a 44,1 kHz se convirtió conservando el tiempo. Esto prueba el pipeline, no una lectura humana.

## PreparedReel

Sobre validado con identidad de producción/draft/voz/presentador, hashes, escenas con audio/captions/deltas, requirements, ThemeSchema y perfil existente. Sin proveedor de texto ni llamadas IA. Se reutilizan AudioSchema, SceneSchema, ReelSchema, captions y el compilador original. compilePreparedReel exige contenido y guion coincidentes, estado habilitado y recursos resueltos; construye DomainReel y llama a compileCompositionSnapshot sin modificarlo.

## Pipeline completo actual

Idea → generación local 1B → ReelDraft → prepare:production → plan y guion → grabación/revisión humana → import:narration → segmentos medidos y captions estimados → PreparedReel → validación de visuals → compilePreparedReel → compileCompositionSnapshot → render:production.

La conversión editorial permanece en aplicación; ninguna llamada al generador entra en importación o renderer. La parte final nueva es utilizable con es-ES, orientación vertical y textOnly. Si faltan visuals, el audio puede prepararse pero no se habilita render. No se ha ejecutado un MP4 nuevo de la demo porque falta su grabación correspondiente.

## Demo real

Draft de 1B: [3 formas prácticas de utilizar IA para ahorrar tiempo](../.local/generated/654ce19c402e9b76-21c2cb110e118dbe-1789108461701.json), contentHash `21c2cb110e118dbe9d0689dc169454395b3470393658bf249df71757b45739cf`.

Producción `production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6`, cinco escenas, es-ES, impactful, 30000 ms editoriales, voice-marcos/presenter-marcos. Estado final **waitingForNarration**, cinco requirements pending y ningún receipt de audio. Una ejecución real de render:production se rechazó con INVALID_STATE: Production has no accepted narration. No generó un MP4.

La revisión editorial documentada en 1B continúa pendiente. No se alteraron sus frases para aparentar que la grabación anterior corresponde al texto.

## Tests

**73/73 PASS**, 50 anteriores y 23 nuevos. Tests de plan estable, manifiesto/texto exacto, identidades, estados, requirements, imposibilidad de render sin narración, validación de audio, fidelidad de muestras, revisión vinculada por hash, cortes inválidos, audio silencioso/inválido/excesivo, bloqueo del original 1A, privacidad, deltas, PreparedReel, compilación existente, assets pendientes, alteraciones, persistencia, rollback de import fallido, lock y locales/orientaciones no soportados.

Fixtures de audio de 1C son tonos técnicos, nunca narración ficticia de Marcos. Los tests no necesitan Ollama real. Smoke Ollama ejecutado por separado.

## Validaciones

| Comando / comprobación                   | Resultado                                                       |
| ---------------------------------------- | --------------------------------------------------------------- |
| npm ci                                   | PASS, offline, 344 paquetes, audit=false/fund=false             |
| npm run lint                             | PASS                                                            |
| npm run typecheck                        | PASS                                                            |
| npm test                                 | PASS, 73/73                                                     |
| npm run format:check                     | PASS                                                            |
| npm run build:renderer                   | PASS                                                            |
| npm run discover                         | PASS, ReelDemo, 1080×1920, 30 FPS, 695 frames                   |
| npm run prepare:marcos                   | PASS, 23168 ms medidos, 5 escenas, 3.08 s de preparación        |
| npm run render                           | PASS, render completo 1A y cinco capturas; 61.13 s de render    |
| npm run test:integration:text -- --local | PASS, generación real local, 1 intento, 25.97 s, 526/479 tokens |
| prepare:production con segundo draft 1B  | PASS, waitingForNarration y cuatro archivos privados            |
| render:production sobre demo sin audio   | Rechazo esperado INVALID_STATE; no MP4                          |
| Importación/PreparedReel/compilador 1C   | PASS en tests técnicos con PCM sintético                        |

El render CLI 1C no se verificó con una grabación nueva de Marcos porque no se ha proporcionado. La compilación nueva se verificó con fixtures técnicos; Remotion se verificó con el render real existente de 1A. No se confunden esas evidencias.

## Regresiones

**49/49 archivos previos comprobados conservan SHA-256**, incluidos todo src/scripts/tests preexistentes, lockfile, VozMarcos.m4a y prepared/snapshot privados de 1A. Evidencia: `.local/phase-1c/regression-hashes.json`. No se modificaron contratos 0B/1A/1B, fixtures, preparación anterior ni componentes de composición.

MP4 de 1A: H.264/AAC 48 kHz, 1080×1920, 30 FPS, vídeo de 23,166667 s, 2841200 bytes. SnapshotHash idéntico: `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`. Original intacto. El nuevo smoke LLM conserva inputHash con output diferente, consistente con la ausencia de promesa de determinismo absoluto en 1B.

## Coste

**API cost=0 €**. Ollama local exclusivamente para regresión de texto, no para audio. Tiempos de importación/render registrados localmente; sin billing ni valoración monetaria inventada del cómputo.

## Archivos modificados

Nuevos:

- src/domain/presenter.ts
- src/application/production-plan.ts
- src/application/prepared-reel.ts
- src/ports/recorded-narration.ts
- src/infrastructure/audio/import-recording.ts
- src/infrastructure/production/local-files.ts
- src/infrastructure/production/operations.ts
- scripts/production.ts
- scripts/render-production.ts
- tests/production.test.ts
- docs/production-phase-1c.md
- docs/phase-1c-report.md

Actualizados: package.json (cuatro comandos, ninguna dependencia nueva), README.md y docs/architecture.md.

Artifacts locales: plan/manifiesto/guion/plantilla de revisión de la demo; datos técnicos de tests bajo .local; evidencia de hashes; regeneración de build y outputs de regresión 1A. No hay repositorio Git inicializado ni commits publicados.

## Deuda restante

- Falta la grabación correspondiente al guion real; la demo permanece esperando, como exige esta fase.
- Correspondencia texto/audio basada en revisión humana, sin verificación semántica automática. Cortes manuales y pausas conservadoras pueden exigir regrabar con menos ruido.
- Captions estimados, precisión acústica por palabra sin resolver.
- Solo visuals textOnly resueltos; presenter/screenCapture/broll/image pendientes, sin importador visual.
- Preparación actual es-ES/vertical y límites heredados del dominio; no se finge soporte de otros locales o formatos.
- Ante cierre abrupto puede quedar lock/staging privado huérfano; no hay recuperación automática ni garantía transaccional frente a caídas entre promoción del directorio y escritura del plan.
- Calidad editorial de los guiones 1B pendiente de revisión; hashes de integridad no equivalen a prueba de lectura ni firmas.

## Qué pertenece a la siguiente fase

Solo recomendaciones: revisar el guion, aportar narración correspondiente y resolver assets visuales reales mediante una ruta explícita; evaluar mejoras de sincronización cuando se autorice su fase. La importación de una grabación ya queda implementada. No se inició la siguiente fase ni se implementaron clonación, avatar, proveedores externos o adquisición automática de assets. STOP.
