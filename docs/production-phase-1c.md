# FASE 1C · Producción local con narración grabada

## Alcance

`ReelDraft → ProductionPlan → NarrationManifest → grabación y revisión humana → importación → PreparedReel → DomainReel existente → compileCompositionSnapshot → Remotion`.

El guion expresa intención editorial; la grabación determina el tiempo. No se acelera voz, no se eliminan silencios ni se ajusta audio a objetivos editoriales. No se ha implementado TTS, clonación, avatar, STT ni proveedores nuevos. La demo real termina esperando una grabación nueva.

## ProductionPlan y sus identidades

Contrato Zod strict en `src/application/production-plan.ts`: schemaVersion=1, id, draftContentHash, draft completo validado, voiceProfile, presenter, narrationSource, narrationHash, assetRequirements y state discriminado. Título, locale, escenas, visual intents y target se conservan dentro del draft, sin duplicarlos ni introducir frames o datos de Remotion.

ID estable: production- seguido de SHA-256 canónico de versión del plan, hash del draft, VoiceProfile, PresenterProfile y NarrationSource. Estado operativo no participa. Cambiar guion, voz o identidad produce otro plan; no muta una producción aceptada. narrationHash identifica locale, voz y scripts/IDs/orden exactos. Los hashes detectan incoherencias, no son firmas ni certifican que una persona haya pronunciado un texto.

VoiceProfile Marcos de 1A intacto: voice-marcos, Marcos, es-ES, recorded-reference. PresenterProfile mínimo en dominio: presenter-marcos, displayName=Marcos, defaultVoiceProfileId=voice-marcos. Sin fotos, archivos de vídeo ni AvatarProfile: futuras asociaciones podrán referenciar este ID sin crear una jerarquía ahora.

NarrationSource representa recorded y generated. Solo recorded tiene operación implementada; generated es reserva de contrato, sin proveedor o ejecución. La importación rechaza planes en otro modo. No hay dependencias de generación de texto en la ruta de audio/producción.

## Manifiesto y guion humano

`createNarrationManifest` deriva productionId, draftContentHash, narrationHash, title, voiceProfileId, locale, targetDurationMs, fullScript y scenes. Cada escena conserva sceneId, order, narration, estimatedDurationMs y visualIntent. El manifiesto es salida del código tras validar el plan; no es una entrada que habilite producción.

narration.txt contiene título, voz, instrucciones sencillas y bloques ESCENA N con el texto exacto y su duración editorial orientativa. Se indica leer únicamente la narración, sin los encabezados, dejando pausas claras entre escenas. No se corrige ni reescribe automáticamente contenido de 1B.

## Necesidades visuales

| visualIntent  | AssetRequirement.type | Estado inicial | Preferencia |
| ------------- | --------------------- | -------------- | ----------- |
| avatarTalking | presenter             | pending        | recorded    |
| screenDemo    | screenCapture         | pending        | recorded    |
| broll         | broll                 | pending        | local       |
| image         | image                 | pending        | local       |
| textOnly      | none                  | notRequired    | none        |

Cada requirement conserva sceneId y description. No se admite marcar recursos como resueltos: no hay importador visual en esta fase. avatarTalking describe intención futura, nunca existencia de un avatar. Solo textOnly puede resolverse actualmente con la plantilla tipográfica existente; no hay sustitución automática de los demás intents.

Un plan con necesidades visuales pendientes puede importar y preparar narración, pero permanece prepared. No pasa a renderable. Para probar el pipeline temporal sin assets, los tests usan un borrador técnico textOnly y tonos explícitamente sintéticos, nunca presentados como voz de Marcos.

## Estados

| Transición                           | Condición                                             |
| ------------------------------------ | ----------------------------------------------------- |
| draft → waitingForNarration          | Plan y manifiesto validados                           |
| waitingForNarration → narrationReady | Importación validada y recibo vinculado a guion/audio |
| narrationReady → prepared            | PreparedReel coherente y hash calculado               |
| prepared → renderable                | Ningún visual pendiente; en esta fase todos textOnly  |
| renderable → rendered                | MP4 real generado, verificado y hash registrado       |

No se permiten saltos ni regresiones. narrationReady exige receipt con recordingHash, narrationHash e importHash. prepared/renderable requieren además preparedHash; rendered añade videoHash. Receipts y preparedHash no pueden sustituirse durante una transición. El plan valida que renderable/rendered no contengan requirements pendientes.

Las transiciones intermedias de importación ocurren en memoria; se persiste el estado final únicamente después de escribir y validar todos los derivados. El compilador revisa además correspondencia de guion, identidad, assets y hashes; un estado escrito a mano no basta para renderizar a través de la CLI.

## Grabación y revisión humana

Se admite un archivo completo, colocado primero en `.local/recordings/`, ya ignorado por Git. El archivo original no se modifica. Para importar se necesita un JSON de revisión ligado al plan, al guion y al SHA-256 del archivo exacto:

```json
{
  "productionId": "production-<hash>",
  "draftContentHash": "<64 caracteres hex>",
  "narrationHash": "<64 caracteres hex>",
  "recordingHash": "<SHA-256 obtenido con inspect:narration>",
  "exactScriptRead": true,
  "boundariesReviewed": true,
  "sceneIds": ["scene-1", "scene-2"],
  "sceneBoundariesMs": [4200]
}
```

El ejemplo es ilustrativo, no una revisión válida para la demo de cinco escenas. Debe haber N−1 cortes y N IDs en el orden exacto. Los cortes son posiciones absolutas en ms desde el inicio del audio, revisadas escuchando la grabación. El código no inventa los cortes desde la duración editorial ni interpreta pausas como prueba del contenido hablado.

`exactScriptRead=true` declara que la persona revisora ha comprobado la lectura exacta; `boundariesReviewed=true`, que los cortes corresponden a las fronteras de escenas. No existe verificación semántica automática: los hashes vinculan esa declaración, no reconocen palabras. Si se leen palabras diferentes, debe corregirse la grabación o prepararse otro borrador y plan; no se acepta silenciosamente un transcript distinto.

La plantilla generada contiene ambos booleanos false, hash de audio pendiente y array vacío de cortes: no puede importarse hasta completarse. No hay autoaprobación ni inferencia de conformidad por el mero hecho de seleccionar un archivo.

## Validación y preparación de audio

Infraestructura `src/infrastructure/audio/import-recording.ts`. Límites antes de aceptar:

- Archivo regular WAV, M4A, MP3, FLAC u OGG, hasta 50 MiB.
- Un único stream de audio; sin vídeo ni portadas adicionales. Mono/estéreo, sample rate entero entre 8000 y 96000 Hz.
- Codecs: pcm_s16le, pcm_s24le, pcm_s32le, pcm_f32le, aac, mp3, flac, vorbis, opus.
- Duración reportada 1–60 segundos; duración PCM también comprobada, máximo 60 segundos. Cada escena requiere al menos un segundo medido, respetando el dominio existente.
- FFprobe con formatos/protocolos restringidos; decodificación FFmpeg con errores fatales. Máximo 120 segundos por proceso y 2 MiB de logs internos, sin imprimir contenido de audio.
- SHA-256 del archivo exacto, coincidencia con la revisión y comprobación de original intacto al terminar.

Conversión a PCM16 estéreo 48 kHz, sin cambiar velocidad, aplicar normalización de sonoridad, recortar pausas ni perseguir el target. `normalized.wav` nombra el formato PCM normalizado, no una normalización LUFS. Resampleo conserva el tiempo; no se promete identidad de muestras entre sample rates distintos.

FFmpeg tiene un límite defensivo de decodificación de 61 s: cualquier resultado superior a 60 s se rechaza, nunca se acepta una versión recortada para encajar. Cortes aportados por la persona revisora deben ser crecientes y caer en silencio detectado a −40 dB, de al menos 200 ms, dejando ≥80 ms a ambos lados. Son comprobaciones acústicas conservadoras; pueden rechazar grabaciones con ruido y no demuestran ausencia de palabras de volumen muy bajo. En ese caso se revisa/regraba, no se fuerza un corte.

Cada frontera ms se convierte a muestras PCM48; el último segmento termina en la última muestra real. Los segmentos son contiguos y cubren exactamente todas las muestras del PCM completo. La concatenación exacta está probada. No se generaliza la receta de pausas/párrafos de VozMarcos de 1A.

VozMarcos.m4a queda reservado a su demo existente; su hash se rechaza en esta ruta incluso si se copia con otro nombre. No es un clon ni una narración reutilizable para estos guiones. Las funciones genéricas de silencio de 1A se reutilizan; su preparación específica no se modifica.

## Timing y PreparedReel

MEASURED: duración y muestras PCM de cada segmento y total, además de detección acústica de silencio. ESTIMATED: timestamps de palabras y líneas del estimador ya existente. ALIGNED: no se produce en esta fase. Las fronteras se etiquetan human-reviewed-silence-boundaries, sin atribuirles forced alignment.

Desviación: deltaMs=measuredDurationMs−estimatedDurationMs; deltaPercent=100×deltaMs/estimatedDurationMs, redondeado a dos decimales. Por escena se conserva el target de 1B; total utiliza targetDurationMs del draft. El signo se conserva, incluso cuando la grabación es más larga. Los valores no controlan la velocidad del audio.

PreparedReel es un sobre de aplicación Zod strict con identidades de producción/draft/voz/presentador, locale, título, hashes de narración/importación, escenas editoriales más AudioSchema/captions/audioPath/delta, requirements, ThemeSchema y renderProfileId existente. No llama IA ni contiene dependencias de su proveedor.

El estimador actual solo admite es-ES y la ruta actual solo produce Reels verticales; otros valores siguen representables editorialmente pero su preparación no se finge soportada. Se mantienen límites heredados de tokens/captions del dominio preparado. Highlight de palabra desactivado.

compilePreparedReel valida plan, PreparedReel, guion e identidades coincidentes, preparedHash y ausencia de recursos pendientes. Construye DomainReel con los schemas existentes y llama al compilador intacto compileCompositionSnapshot. El tiempo del snapshot procede de audio.measuredDurationMs, con el redondeo global existente; ninguna conversión a frames ocurre en ProductionPlan/Manifest/PreparedReel.

El importHash excluye elapsedMs; representa contenido y receta de importación, incluidas revisión, hashes de bytes, límites, FFmpeg y muestras. El preparedHash identifica el PreparedReel completo sin tiempos técnicos de ejecución. No es una caché ni un registro firmado.

## CLI

```powershell
npm run prepare:production -- --draft .local/generated/654ce19c402e9b76-21c2cb110e118dbe-1789108461701.json

# Después de grabar y guardar el archivo privado:
npm run inspect:narration -- --audio .local/recordings/mi-reel.wav

# Completar una copia de recording-review.template.json tras escuchar el audio.
$productionPath = '.local/productions/production-<hash>/production-plan.json'
npm run import:narration -- --plan $productionPath --audio .local/recordings/mi-reel.wav --review .local/productions/production-<hash>/recording-review.json

# Solo para planes renderable con visuals textOnly:
npm run render:production -- --plan $productionPath
```

prepare:production acepta un ReelDraft solo o el sobre generado en 1B, comprobando contentHash si existe. Genera production-plan.json, narration-manifest.json, narration.txt y recording-review.template.json. Repetir el mismo comando conserva una producción existente, incluso si ya avanzó de estado.

Importación: staging privado por operación, validación de audio/PreparedReel, escritura de recording-import.json y prepared-reel.json, promoción a imports/importHash y finalmente actualización atómica del plan. Un fallo no publica un recibo de narración. No se pisan derivados existentes.

Render: carga artefactos privados, valida rutas y hashes, sirve únicamente los segmentos necesarios por loopback temporal, usa bundle existente y navegador local, verifica H.264/AAC y duración, registra render-validation.json y avanza a rendered. MP4 permanece dentro de la producción privada con nombre único. Cierre del servidor en finally.

## Privacidad y límites operativos

Grabaciones y derivados en .local, ignorado por Git. Se rechazan rutas UNC, escapes fuera del área privada y directorios privados enlazados a otra ubicación. JSON de entrada limitado a 2 MiB. El audio no entra en public ni en el bundle; el servidor efímero 127.0.0.1 utiliza allowlist y hashes. Los comandos precargan el guard TCP local de 1A. Los tests comprueban que la ruta de producción/audio no importa generación de texto; Ollama solo participa en el smoke de texto de 1B.

Un lock de archivo evita import/render simultáneos. Si el proceso termina abruptamente puede quedar un lock o staging huérfano; no hay recuperación automática. Antes de retirar manualmente un lock debe comprobarse que no existe una operación activa. Los hashes detectan modificaciones, sin protección criptográfica frente a quien pueda reescribir todos los archivos locales. No se afirma aislamiento del sistema operativo ni captura global de tráfico.

API cost=0 €, sin facturación. Registro de tiempos técnicos de importación/render; no precio inventado del cómputo local.

## Demo y siguiente frontera

Producción `production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6`, segundo draft real de 1B. Cinco escenas, 30 s editoriales, voice-marcos, presenter-marcos. Estado final waitingForNarration, con dos necesidades presenter y tres screenCapture. Sin audio asociado ni MP4 nuevo. Se comprobó rechazo real de render por ausencia de narración.

Revisión editorial de 1B sigue pendiente antes de grabar. La fidelidad de lectura se basa en revisión humana. La resolución visual, mejora de timing acústico y recuperación avanzada de importaciones quedan fuera de 1C. No se inició ninguna fase posterior.
