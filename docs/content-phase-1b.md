# FASE 1B · Idea → ReelDraft con texto local

## Arquitectura

`IdeaRequest → prompt editorial → TextProvider → JSON.parse → Zod → compilación editorial → ReelDraft`.

La aplicación devuelve `{draft, generation}`: contenido y plan visual en el dominio; metadata del proveedor en el sobre de aplicación. ReelDraft es un contrato nuevo, separado del DomainReel preparado de 0B/1A. No se convierte a CompositionSnapshot: no tiene audio, tiempos acústicos, subtítulos sincronizados ni assets resueltos. No es un Reel terminado.

- Dominio: `src/domain/reel-draft.ts`, sin proveedores ni render.
- Aplicación: `generate-reel-content.ts`, solicitud, prompt, validación, dos intentos y compilación editorial.
- Puerto: `src/ports/text-provider.ts`. generateStructured recibe system, user, JSON Schema, parámetros y AbortSignal; devuelve texto JSON todavía no confiable, identidad del proveedor/modelo, tiempo y tokens opcionales.
- Infraestructura: `src/infrastructure/text/ollama.ts`, único adaptador de texto.
- Composición: sin cambios; ESLint prohíbe también imports de puertos y aplicación. Tests comprueban separación en dominio, snapshot y composición.

## Solicitud y defaults

Objetos de solicitud, contenido y draft: Zod strict; claves desconocidas rechazadas. Strings recortados en extremos, sin valores vacíos. Límites en unidades UTF-16 de JavaScript.

| Campo            | Contrato                                                            |
| ---------------- | ------------------------------------------------------------------- |
| topic            | 1–2000 caracteres                                                   |
| locale           | 1–35, BCP 47 aceptado por Intl, normalizado con getCanonicalLocales |
| audience         | 1–300 caracteres                                                    |
| voiceProfileId   | 1–100 caracteres                                                    |
| targetDurationMs | 15000, 30000, 45000, 60000                                          |
| contentStyle     | educational, impactful, minimal, tech, storytelling                 |
| orientation      | vertical, horizontal, square                                        |

Defaults de CLI, fuera del schema global: es-ES, público no técnico interesado en IA, voice-marcos, vertical, educational, 30000 ms. Aplicación requiere solicitud completa y perfil editorial explícito; otros consumidores pueden elegir sus defaults. VoiceProfile se referencia por ID, sin binding ni registro de identidades nuevo.

Perfil editorial: id ≤100, version ≤40, instrucciones 1–4000 caracteres. Parámetros: temperature 0–2, maxOutputTokens 256–8192, seed opcional entero 0–2147483647. Defaults de generación: 0.2, 3000, 42.

## Contenido y compilación

El modelo genera title y scenes. Cada escena tiene narration, purpose, visualIntent, estimatedDurationMs y onScreenText nullable. No se le pide repetir narraciones en campos redundantes.

El código asigna IDs scene-1…scene-8 y order 0…7 según el array. Estables dentro del borrador, sin promesa de identidad persistente entre regeneraciones. Deriva hook de la narración completa de la primera escena, cta de la única escena CTA si existe y fullNarration uniendo narraciones con un espacio. Esto evita contradicciones de duplicación sin sustituir texto editorial del modelo.

Draft: schemaVersion=1, status=draft, title, hook, locale, targetDurationMs, audience, contentStyle, voiceProfileId, orientation, fullNarration, scenes, cta nullable. El schema verifica relaciones derivadas, IDs únicos, orden, primera escena hook y ausencia de otros hooks; máximo una CTA, exactamente igual a la narración correspondiente.

| Contenido                | Límite                                                  |
| ------------------------ | ------------------------------------------------------- |
| escenas                  | 2–8                                                     |
| título                   | 1–120 caracteres                                        |
| narración por escena     | 1–600 caracteres                                        |
| hook / CTA               | 1–240; CTA nullable                                     |
| fullNarration            | 1–4807, igualdad exacta con escenas                     |
| purpose                  | hook, explanation, example, reinforcement, cta, closing |
| visualIntent.description | 1–300 caracteres                                        |
| onScreenText             | null o 1–100 caracteres                                 |
| duración propuesta       | entero 1000–60000 ms                                    |

Compilación temporal: reserva 1000 ms por escena y distribuye el resto proporcionalmente a las estimaciones, redondeando fronteras acumuladas. Suma final exactamente targetDurationMs, cada escena ≥1000 ms. No calcula measuredDurationMs ni afirma que el texto quepa al narrarlo. El prompt pide unas dos palabras por segundo como guía editorial, no medida acústica ni restricción lingüística global.

visualIntent={kind,description}; kind es avatarTalking, screenDemo, broll, image o textOnly. Describe qué mostrar; no tiene campos CSS, componentes, URLs ni assets. Es texto no confiable para futuras etapas, nunca se ejecuta. No hay AvatarProfile, avatar, imágenes ni B-roll generados. contentStyle modifica instrucciones narrativas, no apariencia.

## Prompt, structured output y reparación

Prompt independiente del proveedor en `src/application/editorial-prompt.ts`, versión reel-content-v1.1. Perfil Marcos v1: español natural, audiencia no técnica, frases narrables, hook rápido, ejemplos cotidianos, prudencia y ausencia de hype vacío. Locale, audiencia y orientación son parámetros.

POST /api/chat con stream=false y format=JSON Schema generado por Zod. JSON.parse directo, sin extracción por regex. Validación GeneratedContentSchema, compilación y validación ReelDraftSchema. JSON sintácticamente válido puede fallar por incoherencia semántica.

Máximo dos llamadas. Solo fallos de JSON/schema/coherencia provocan la segunda. Repair reenvía solicitud, errores concretos, mismo schema y hasta 16000 caracteres del resultado previo, exclusivamente al modelo local. Hasta 12 errores, sin imprimir prompts ni respuestas completas en logs. Una reparación puede cambiar el contenido.

Tras segundo fallo: GenerationError INVALID_OUTPUT con intentos y errores sanitizados. Servicio, timeout, cancelación o cambio de identidad no provocan reparación. Códigos: INVALID_INPUT, INVALID_OUTPUT, CONFIGURATION, UNAVAILABLE, TIMEOUT, ABORTED, PROVIDER_ERROR.

## Ollama y seguridad local

Inspección previa al código el 11/09/2026: Ollama 0.34.0, `C:/Users/Marcos/AppData/Local/Programs/Ollama/ollama.exe`, endpoint verificado http://127.0.0.1:11434, ningún modelo cargado inicialmente.

| Modelo instalado     | ID corto     | Tamaño indicado |
| -------------------- | ------------ | --------------- |
| qwen3.5:9b           | 6488c96fa5fa | 6.6 GB          |
| qwen2.5:7b-instruct  | 845dbda0ea48 | 4.7 GB          |
| qwen2.5:14b-instruct | 7cdf5a0187d5 | 9.0 GB          |
| qwen3:1.7b           | 8f68893c685c | 1.4 GB          |
| qwen3:4b             | 359d7dd4bcda | 2.5 GB          |
| qwen3-embedding:0.6b | ac6da0dfba84 | 639 MB          |
| mistral:latest       | 6577803aa9a0 | 4.4 GB          |

Default local: qwen2.5:7b-instruct, de instrucciones y menor que la variante 14B. Elección práctica, sin benchmark comparativo. Nombre en configuración de infraestructura, nunca identidad de dominio. En esta máquina se observó reparto CPU/GPU al cargarlo.

Variables de operador: REELMASTER_TEXT_ENDPOINT (default http://127.0.0.1:11434), REELMASTER_TEXT_MODEL (default qwen2.5:7b-instruct), REELMASTER_TEXT_TIMEOUT_MS (default 180000, 1–600000). Nunca desde IdeaRequest ni argumentos de contenido CLI.

Solo HTTP a 127.0.0.1, ::1 o localhost; localhost se fija a 127.0.0.1 sin DNS. Prohibidos credenciales, paths, query, fragment y redirecciones. Node http nativo no usa proxies del entorno. HTTP limitado a 256 KiB y JSON de contenido a 64 KiB. Timeout total por petición, incluso mientras llegan bytes; AbortSignal cancela HTTP. SIGINT cancela CLI.

Preflight /api/version, /api/tags, /api/show. Modelo instalado obligatorio; nombres cloud y descriptores remotos rechazados. Sin pull, descargas, instalaciones, APIs externas ni búsqueda web. Comandos precargan guard TCP local de 1A. No se afirma haber instalado firewall ni capturado tráfico del sistema o daemon.

## Hashes, coste y metadata

Reutiliza SHA-256 del JSON canónico con claves ordenadas de `src/snapshot/hash.ts`, sin modificar el hashing del renderer.

inputHash: solicitud normalizada completa, perfil editorial completo con instrucciones, promptVersion, proveedor/modelo/digest/versión del servidor, parámetros explícitos y hash del JSON Schema. Cambios del prompt requieren incrementar PROMPT_VERSION. Excluye tiempos y endpoint de transporte. Opciones implícitas del motor/hardware impiden prometer determinismo absoluto.

contentHash: solo ReelDraft validado, incluyendo narraciones, plan visual, duraciones e identidad de voz; excluye metadata. generation contiene identidad, promptVersion, perfil id/version, parámetros, hashes, elapsedMs, attemptCount y datos por intento: tiempo, bytes aproximados de sistema+usuario y salida, tokens opcionales, errores. apiCostEur=0. elapsedMs incluye espera, generación y validación; no es tiempo aislado de cómputo del modelo. No hay caché, billing ni precio inventado de inferencia local.

## CLI y pruebas

```powershell
npm run generate:reel -- --topic "Explica qué es un agente de IA" --duration 30 --style educational
npm run generate:reel -- --topic "3 formas prácticas de utilizar IA para ahorrar tiempo durante el día." --duration 30 --style impactful
npm run test:integration:text -- --local
```

CLI también acepta --locale y --audience. Valida antes de conectar e imprime título, escenas, target, archivo y metadata breve. Guarda el sobre completo en `.local/generated/<inputHash-corto>-<contentHash-corto>-<timestamp>.json`, ya ignorado por Git. No guarda outputs en src ni modifica audio.

Tests unitarios: TextProvider falso o servidor HTTP loopback efímero, sin necesitar Ollama. Integración separada, requiere --local y se rechaza si CI está definido. Demo 1A conserva su transcript original y preparación privada, sin relación con estas narraciones.

## Limitaciones

Validación estructural no garantiza veracidad o calidad editorial. Revisión humana y duración narrada siguen pendientes antes de una futura publicación. No hay identidad editable entre regeneraciones, caché, voz nueva, assets ni ruta draft→render. Alignment estimado de 1A permanece intacto. FASE 1C no iniciada.
