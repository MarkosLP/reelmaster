# Entrega de FASE 1B

## Estado

**PASS WITH ISSUES.** Pipeline local idea→ReelDraft implementado, dos generaciones reales válidas y prueba de integración local aprobada. La calidad editorial necesita revisión humana; especialmente el primer ejemplo. FASE 1C no iniciada. No se generó audio, avatar ni assets para los nuevos guiones.

## Ollama detectado

Ollama 0.34.0, endpoint verificado `http://127.0.0.1:11434`. Se ejecutaron --version y list antes de editar código. Modelos locales: qwen3.5:9b (6.6 GB), qwen2.5:7b-instruct (4.7 GB), qwen2.5:14b-instruct (9.0 GB), qwen3:1.7b (1.4 GB), qwen3:4b (2.5 GB), qwen3-embedding:0.6b (639 MB), mistral:latest (4.4 GB). Inventario y límites en [contrato 1B](content-phase-1b.md).

## Modelo utilizado

qwen2.5:7b-instruct, digest `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`. Modelo de instrucciones ya instalado, menor que 14B; elección práctica sin comparar cuantitativamente todos los modelos. Modelo y endpoint configurables por operador, no por IdeaRequest. No hubo descargas ni proveedores remotos.

## TextProvider

Puerto propio con generateStructured(system, user, schema, parameters, signal). Devuelve texto estructurado aún no confiable, identidad de proveedor/modelo, elapsedMs y usage opcional. Aplicación valida y compila; infraestructura implementa transporte Ollama exclusivamente loopback. Dominio, snapshot y composición no importan el proveedor. Metadata del proveedor vive en el sobre `{draft,generation}`, fuera de ReelDraft.

## ReelDraft

schemaVersion, status, title, hook, locale, targetDurationMs, audience, contentStyle, voiceProfileId, orientation, fullNarration, scenes, cta nullable. Escenas: id, order, narration, purpose, visualIntent, estimatedDurationMs y onScreenText nullable. IDs y orden asignados por código; hook, cta y fullNarration derivados de escenas y verificados por Zod. Dos a ocho escenas, narraciones hasta 600 caracteres, hook/CTA hasta 240. Duraciones editoriales enteras normalizadas a 15/30/45/60 s; nunca medidas acústicas.

## Prompt editorial

`reel-content-v1.1`, perfil Marcos v1 separado del motor. Locale/audiencia/estilo son parámetros. Cinco estilos narrativos, sin CSS. El prompt solicita claridad, frases narrables, prudencia y unas dos palabras por segundo como guía editorial. El modelo no garantiza cumplir esas preferencias blandas.

## Structured output

JSON Schema generado por Zod en format de /api/chat, stream=false. JSON.parse, GeneratedContentSchema, compilación editorial y ReelDraftSchema. Objetos strict, límites explícitos, IDs/orden coherentes, narración completa exacta e intents restringidos. No existe camino del texto crudo al renderer.

## Repair strategy

Máximo dos intentos. Segundo solo tras JSON/schema/coherencia inválidos: mismo contrato, solicitud y errores concretos más fragmento acotado del resultado previo. Fallo final INVALID_OUTPUT tipado. Timeout, cancelación y errores del servicio no se reintentan como reparación.

Durante desarrollo la versión inicial pedía duplicar hook/CTA fuera de escenas; el modelo produjo inconsistencias y ambas tentativas se rechazaron correctamente. El contrato final elimina esos campos redundantes del output del modelo y el compilador los deriva. No se relajó la coherencia final. En los dos ejemplos finales no fue necesaria reparación; reparación exitosa y agotada están probadas con mocks.

## Hashes y trazabilidad

inputHash SHA-256 canónico: solicitud normalizada completa, perfil editorial completo, promptVersion, proveedor/modelo/digest/versión, parámetros y hash del schema. contentHash: ReelDraft validado completo, sin tiempos ni metadata de ejecución. Se registran tiempo, intentos, bytes aproximados y tokens reales expuestos por Ollama. Seed=42 no garantiza determinismo absoluto; sin caché.

## Primera generación real

Idea exacta: «Explica de forma sencilla qué es un agente de inteligencia artificial y para qué puede servirle a una persona normal.» Objetivo 30000 ms, es-ES, educational, audiencia general no técnica, voice-marcos.

[ReelDraft completo y metadata](../.local/generated/5ac5f48761f995ac-964e7a3938be3769-1789108317090.json).

Título: Introducción a los Agentes de IA. Estado draft; orientación vertical. Hook es la narración de scene-1 y CTA la de scene-4. fullNarration es exactamente la concatenación de esta tabla.

| ID / orden  | Narración generada                                                                                                                                                         | Purpose     | Intención     | Objetivo editorial |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------- | ------------------ |
| scene-1 / 0 | Un agente de inteligencia artificial es como un asistente virtual que aprende y resuelve problemas por ti. Por ejemplo, un asistente de voz que te ayuda a buscar recetas. | hook        | avatarTalking | 7667 ms            |
| scene-2 / 1 | Puedes usarlo para organizar tu agenda, recordarte mediciones o incluso aprender un idioma nuevo.                                                                          | explanation | screenDemo    | 6000 ms            |
| scene-3 / 2 | Es como tener un asistente personal que siempre está a tu disposición.                                                                                                     | example     | avatarTalking | 6000 ms            |
| scene-4 / 3 | ¡Empieza a aprovechar la IA en tu vida diaria!                                                                                                                             | cta         | avatarTalking | 4333 ms            |
| scene-5 / 4 | Descubre cómo la IA puede mejorar tu día a día.                                                                                                                            | closing     | avatarTalking | 6000 ms            |

Revisión manual: JSON válido, hook presente, cinco escenas ordenadas, intents permitidos, suma exacta 30000 ms, 74 palabras por separación de espacios. El presupuesto global equivale a 148 palabras/minuto, plausible como objetivo editorial, sin garantía acústica. La apertura concentra 29 palabras en 7667 ms (unos 227/minuto), demasiado densa para el tono deseado. «Recordarte mediciones» es una formulación poco clara. La definición confunde agente con asistente genérico y sugiere aprendizaje sin matizar; no explica bien acciones sucesivas para alcanzar un objetivo. CTA y cierre son redundantes y demasiado promocionales. Requiere edición factual/editorial antes de cualquier uso; no se presenta como contenido listo para publicar.

inputHash `5ac5f48761f995ac9a4cdfb07677f259b271aa5756e84e3fc2bbf0969d9483c3`.
contentHash `964e7a3938be3769292096c906f82e53a88d5d7f3f76d123e7a83afd0470aca4`.

## Segunda generación real

Idea exacta: «3 formas prácticas de utilizar IA para ahorrar tiempo durante el día.» Objetivo 30000 ms, es-ES, impactful, misma audiencia/voz.

[ReelDraft completo y metadata](../.local/generated/654ce19c402e9b76-21c2cb110e118dbe-1789108461701.json).

Título: 3 formas prácticas de utilizar IA para ahorrar tiempo. Hook=scene-1, CTA=scene-5. Cinco escenas de 6000 ms, orden 0…4. fullNarration coincide con su concatenación.

| ID      | Narración generada                                                | Purpose     | Intención     | Texto en pantalla       |
| ------- | ----------------------------------------------------------------- | ----------- | ------------- | ----------------------- |
| scene-1 | ¡Descubre cómo la IA te ayuda a ahorrar tiempo en tu día a día!   | hook        | avatarTalking | null                    |
| scene-2 | 1. Responde correos electrónicos con plantillas inteligentes.     | explanation | screenDemo    | Plantillas inteligentes |
| scene-3 | 2. Programa recordatorios y tareas con asistentes virtuales.      | explanation | screenDemo    | Asistente virtual       |
| scene-4 | 3. Optimiza tu productividad con sugerencias de IA en documentos. | explanation | screenDemo    | Sugerencias de IA       |
| scene-5 | ¡Empieza a ahorrar tiempo hoy mismo con la IA!                    | cta         | avatarTalking | null                    |

Revisión manual: JSON y relaciones válidos; hook y tres ideas distintas coherentes con la solicitud. Intents permitidos, 30000 ms exactos. 48 palabras incluyendo numerales, presupuesto holgado (96/minuto). Lenguaje comprensible, aunque «optimiza tu productividad» y el CTA siguen siendo genéricos; faltan ejemplos concretos y matices sobre capacidades de cada herramienta. No se afirma excelencia editorial. El cambio de estructura y contenido demuestra que la implementación no está codificada alrededor del tema de agentes.

inputHash `654ce19c402e9b7688e9575586f1e0589ea47d6939220dbbded79f591b81516f`.
contentHash `21c2cb110e118dbe9d0689dc169454395b3470393658bf249df71757b45739cf`.

## Coste

API cost = **0 €**. Sin precio monetario atribuido al cómputo local.

| Ejecución final   | Tiempo de aplicación | Tiempo petición de generación | Tokens entrada/salida | Intentos |
| ----------------- | -------------------- | ----------------------------- | --------------------- | -------- |
| Ejemplo 1         | 19755.67 ms          | 19751.28 ms                   | 535 / 476             | 1        |
| Ejemplo 2         | 22229.03 ms          | 22224.50 ms                   | 531 / 480             | 1        |
| Integración local | 17482.18 ms          | 17477.77 ms                   | 526 / 392             | 1        |

Tiempos de las ejecuciones finales, sin sumar ensayos de desarrollo ni preflight; incluyen espera del servicio, no son cómputo puro del modelo.

## Tests

**50/50 PASS**: 19 conservados de 0B/1A y 31 nuevos. Contratos válidos/inválidos, límites, duraciones, estilos, coherencia, IDs, intents, hashes, versión del prompt, provider falso, reparación, errores sanitizados, timeout, cancelación, configuración privada, modelos ausentes/remotos, redirecciones, respuestas excesivas/malformadas y separación de capas. Tests unitarios sin dependencia de Ollama real. Integración explícita independiente, prohibida en CI.

## Validaciones

| Comando                                  | Resultado                                            |
| ---------------------------------------- | ---------------------------------------------------- |
| npm ci                                   | PASS; 344 paquetes, offline, audit=false, fund=false |
| npm run lint                             | PASS                                                 |
| npm run typecheck                        | PASS                                                 |
| npm test                                 | PASS, 50/50                                          |
| npm run format:check                     | PASS                                                 |
| npm run build:renderer                   | PASS                                                 |
| npm run discover                         | PASS, ReelDemo, 1080×1920, 30 FPS, 695 frames        |
| npm run render                           | PASS, render completo 1A y cinco capturas            |
| npm run test:integration:text -- --local | PASS, JSON/Zod y metadata verificados                |
| generate:reel ejemplo 1                  | PASS técnico, incidencias editoriales documentadas   |
| generate:reel ejemplo 2                  | PASS técnico, revisión editorial pendiente           |

## Regresiones

19 tests anteriores aprobados. Comparación SHA-256 previa/posterior: 11/11 archivos intactos, incluyendo dominio Reel/VoiceProfile, fixtures Marcos/demo/assets/snapshot, compilador y tipos de snapshot, original VozMarcos.m4a y prepared/snapshot privados de Marcos. Evidencia local en `.local/phase-1b/regression-hashes.json`. El build se regeneró y discover confirma 695 frames. Render completo 1A aprobado en 59.4325 s, cinco capturas, H.264/AAC a 48 kHz, 1080×1920, 30 FPS, 23.166667 s de vídeo y 2841200 bytes. SnapshotHash idéntico a 1A: `f29e2cc894d852061c638f65dac8510edd74ce1d2ecaf8a422fb874241bfde9d`; original intacto. El render utiliza exclusivamente la narración original de 1A, nunca estos nuevos guiones.

## Archivos modificados

Nuevos:

- src/domain/reel-draft.ts
- src/ports/text-provider.ts
- src/application/editorial-prompt.ts
- src/application/generate-reel-content.ts
- src/infrastructure/text/ollama.ts
- scripts/generate-reel.ts
- scripts/integration-text.ts
- tests/content.test.ts
- tests/text-adapter.test.ts
- docs/content-phase-1b.md
- docs/phase-1b-report.md

Modificados:

- package.json: dos comandos, sin dependencias nuevas.
- eslint.config.mjs: bloqueo de puertos/aplicación en composición.
- README.md: uso 1B y demo 1A independiente.
- docs/architecture.md: referencia al nuevo contrato, alcance histórico aclarado.

Artifacts locales generados/regenerados: dos sobres JSON en `.local/generated/`, evidencia en `.local/phase-1b/`, build/renderer y salidas de comprobación en out/marcos. Tests regeneran preparación privada de 1A con hashes idénticos. No hay repositorio Git inicializado en esta carpeta; no se creó ni publicó ningún commit.

## Deuda técnica restante

Calidad factual/editorial variable, presupuesto de narración por escena no garantizado acústicamente, evaluación aún pequeña (dos ejemplos más integración), opciones implícitas/hardware del LLM sin determinismo absoluto e identidad de escenas solo estable dentro del draft. La deuda previa de alignment estimado permanece; sin modificaciones en 1B. No se presenta una ruta draft→render como existente.

## Qué pertenece a FASE 1C

Solo recomendaciones, pendientes de autorización: decidir cómo producir narración correspondiente al nuevo guion, medir audio por escena y definir la conversión de draft a Reel preparado. Evaluar calidad editorial antes de esa conversión. No se implementaron TTS, voz clonada, avatar ni ninguna fase posterior. STOP.
