# Fase 1G: generación local de imágenes

`ComfyUIImageProvider` implementa el puerto `ImageGenerationProvider` de 1F. Los contratos editoriales, el asset semántico, PreparedReel, CompositionSnapshot y Remotion siguen sin conocer ComfyUI. El PNG devuelto recorre `GeneratedImageResolver` → `importVisualAsset` de 1D → normalización/hash → VisualAsset → binding existente.

## Activación explícita

Sin `REELMASTER_COMFY_CONFIG`, la fábrica conserva `UnavailableImageProvider`. Para habilitar el adaptador, la variable debe señalar un JSON local de confianza dentro de `.local/`, ignorado por Git. La instalación y el checkpoint deben existir; no hay código de descarga ni SDK nuevo.

Configuración de ejemplo (sustituir las rutas por las de la instalación ya verificada):

```json
{
  "baseUrl": "http://127.0.0.1:8188",
  "checkpoint": "sdxl_lightning_2step.safetensors",
  "checkpointPath": "C:/ruta/absoluta/ComfyUI/models/checkpoints/sdxl_lightning_2step.safetensors",
  "checkpointHash": "87e61f60b85d9f1c577bd9053872c7678b7d39f6f52d470081ff6ea3b49ddf98",
  "runtimeVersion": "0.3.76",
  "runtimeCommit": "30c259cac8c08ff8d015f9aff3151cb525c9b702",
  "startupTimeoutMs": 120000,
  "generationTimeoutMs": 180000,
  "pollMs": 250,
  "width": 512,
  "height": 768,
  "steps": 2,
  "cfg": 1,
  "sampler": "euler",
  "scheduler": "sgm_uniform",
  "batch": 1,
  "startup": {
    "executable": "C:/ruta/absoluta/venv/Scripts/python.exe",
    "cwd": "C:/ruta/absoluta/instalacion",
    "args": [
      "C:/ruta/absoluta/instalacion/offline_start.py",
      "--output-directory",
      "C:/ruta/absoluta/ReelMaster/.local/phase-1g/comfy-outputs"
    ]
  }
}
```

`startup` es opcional: sin él se exige un backend activo. Es configuración administrativa de infraestructura, nunca entrada editorial ni un comando aceptado desde una escena. El proceso se ejecuta sin shell y con ventana oculta. En esta instalación se reutiliza el launcher offline de 1F.1, que bloquea conexiones y DNS Python externos, desactiva custom/API nodes y usa offloading automático. Las variables offline por sí solas no son un cortafuegos: al configurar otra instalación se debe conservar ese launcher o un aislamiento equivalente.

```powershell
$env:REELMASTER_COMFY_CONFIG = (Resolve-Path .local/phase-1g/comfy-config.json).Path
npm run test:integration:image -- --real-local
npm run demo:images -- --technical
```

La integración está separada de `npm test` y requiere configuración explícita fuera de CI. Su primera ejecución genera una imagen; una repetición válida usa caché. La demo exige un resultado PASS de integración, crea una producción nueva de cinco escenas y genera dos imágenes. Si ya existe la producción, no la sobrescribe. `production:resolve-visuals -- --production <id> --execute` usa la misma fábrica, resolver y ciclo de vida.

## API y workflow controlado

Se usa la API HTTP nativa de Node y la implementación instalada de `server.py` 0.3.76, sin automatización de interfaz ni documentación remota necesaria durante la inferencia.

| Endpoint                                  | Uso                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------- |
| GET `/system_stats`                       | Readiness y versión real del runtime                                 |
| GET `/object_info/CheckpointLoaderSimple` | Checkpoint permitido disponible                                      |
| GET `/queue`                              | Esperar trabajos previos y confirmar cancelación                     |
| POST `/prompt`                            | Workflow fijo con UUID propio; se exige el mismo ID en la respuesta  |
| GET `/history/{prompt_id}`                | Polling de la ejecución, éxito, error, interrupción y OOM            |
| GET `/view`                               | Recuperar solamente el PNG de SaveImage asociado a la ejecución      |
| POST `/queue`                             | Borrar únicamente el ID propio de la cola pendiente                  |
| POST `/interrupt`                         | Interrumpir únicamente `prompt_id` propio, soportado en esta versión |

Workflow `sdxl-lightning-2step-v1`, definido en TypeScript versionado: CheckpointLoaderSimple, dos CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode y SaveImage. No se aceptan workflows JSON externos. Prompt, negativePrompt y seed se mapean directamente; dimensiones y opciones se validan estrictamente. Único perfil habilitado: **512×768, batch 1, steps 2, CFG 1, Euler, sgm_uniform, denoise 1**. Se rechazan otros parámetros, no se corrigen silenciosamente. Con CFG 1 el negativo se conserva y se mapea, pero el sampler no usa su rama para guidance.

El contrato genérico admite ahora un mínimo de dos iteraciones y el builder conserva su lógica textual con defaults 2:3, 512×768, 2 y 1. No se introducen samplers ni nombres de backend en el request editorial. La política de selección sigue siendo conservadora: texto en Remotion, listas/procesos en localGraphic, conceptos IA solicitados explícitamente en generatedImage; presenter/captura/broll reales permanecen manuales.

## Ciclo de vida y concurrencia

Un mutex por endpoint serializa las operaciones dentro de Node. Un directorio de bloqueo atómico en el temporal del sistema evita que dos procesos ReelMaster gestionen el mismo endpoint simultáneamente; guarda PID, fecha y endpoint. Se conserva durante el lote. Un bloqueo abandonado tras un crash requiere comprobar manualmente que el PID propietario ya no existe antes de retirar ese directorio exacto; no se recupera por fuerza ni se matan procesos desconocidos.

Se verifica por streaming el SHA-256 local del checkpoint antes de usar el backend por primera vez. Se reutiliza un backend compatible activo, o se inicia el comando conocido una sola vez. Readiness tiene timeout independiente de generación. La cola de ComfyUI procesa sus trabajos en serie; se espera que esté vacía antes de enviar, sin borrar trabajo externo. Otra aplicación local puede enviar sus propios trabajos y causar espera; el adaptador no pretende administrar aplicaciones ajenas.

`close()` espera las operaciones propias y solo detiene el hijo que este provider inició. Un backend externo queda activo. La CLI usa `finally`. El puerto ofrece cierre opcional y timeout total para que el límite provisional de 120 s del resolver no corte startup+carga válidos. Los consumidores que inyecten un provider deben finalizar el lote con `close()`.

Se registran startup, generación fría tras arranque propio, generación caliente posterior y estado desconocido para la primera petición a un backend externo. Es una clasificación operativa: no implica medir internamente cada carga o kernel del modelo. El hashing previo del checkpoint no se incluye en startup.

## Errores y cancelación

Errores explícitos: UNAVAILABLE, STARTUP_TIMEOUT, TIMEOUT, WORKFLOW_REJECTED, MODEL_MISSING, GENERATION_FAILED, INVALID_OUTPUT, CANCELLED y OUT_OF_MEMORY, además de los del resolver. No hay reintentos de generación ante OOM, timeout ni error del workflow. No se cambia resolución ni modelo.

AbortSignal se respeta durante HTTP, polling y lectura del checkpoint. La cancelación borra/interrumpe solo el UUID propio y espera hasta cinco segundos a que desaparezca de la cola; el resultado `drained` queda registrado. Es cooperativa, no instantánea. Un proceso propio puede cerrarse al finalizar; uno externo permanece activo aunque no se haya confirmado el drenaje. La siguiente generación vuelve a esperar cola vacía.

## Seguridad, validación y caché

Solo se permite `http://127.0.0.1[:puerto]` o `http://localhost[:puerto]`, sin credenciales, ruta, query ni fragmento. Se rechazan IP LAN, dominios externos, formas numéricas alternativas y todos los redirects. `localhost` se transporta por 127.0.0.1 sin DNS. Las CLI conservan el bloqueo TCP externo de las fases anteriores.

Cada request usa un prefijo aleatorio. Se exige exactamente una imagen en el nodo SaveImage conocido, tipo output, subcarpeta vacía y nombre `reelmaster_<UUID sin guiones>_<contador>_.png`. No se leen rutas de disco devueltas por ComfyUI. El transporte limita respuestas JSON y PNG; verifica firma y dimensiones antes de devolver bytes. **La validación completa, decodificación, normalización y hash siguen perteneciendo a 1D.** El servidor de medios solo expone sus derivados allowlisted, nunca prompts, recibos ni configuración.

Caché de 1F por producción: inputHash incluye request, identidad completa, workflow/receta, parámetros y resolver. El recibo añade hash del negativo y receta real; contiene versión/commit de infraestructura, modelo/hash, request con promptVersion, seed/dimensiones, tiempos y hashes. El VisualAsset conserva `source=generatedLocalAI` y referencia el recibo privado mediante receiptHash; no contiene ComfyUI ni rutas privadas.

Un hit valida archivos, request, identidad, recibo sellado y normalización sin llamar al backend. PNG/recibo corruptos se rechazan, se conservan en una subcarpeta `corrupt-<uuid>` y se permite una sola regeneración por resolución. No hay un bucle de reparación. Los recibos anteriores se conservan como evidencia. Métricas: cacheHit, cache hit/miss, cacheRecovered e importMs.

## Límites

No hay garantía de correspondencia literal, texto correcto ni anatomía perfecta. Se eligen objetos/metáforas sin personas ni interfaces. La composición final continúa en 1080×1920 a 30 FPS, con el binding contain existente y sin deformación. El audio de demo son tonos PCM sintéticos; sus captions son texto técnico de prueba, no transcripción de una voz. La lógica de captions estimados no cambia.

No hay descargas de modelos, inferencia remota, TTS, identidad personal, avatar, upscale ni nuevas fases. Coste de API: 0 €.
