# Arquitectura ejecutable · FASE 1A sobre baseline 0B

Este documento describe el contrato preparado 0B/1A, conservado en FASE 1B. El nuevo borrador y puerto de texto local se documentan en [content-phase-1b.md](content-phase-1b.md). Las referencias siguientes a texto/borradores como trabajo futuro son históricas: ahora existe generación local de contenido. Voz nueva, draft→render, APIs externas, web de producto, persistencia, workers y jobs siguen sin implementarse.

## Fronteras

FASE 1C añade [ProductionPlan, narración importada y PreparedReel](production-phase-1c.md) como contratos de aplicación. El compilador, CompositionSnapshot y el dominio preparado descritos a continuación siguen intactos. La nueva ruta solo avanza a render con narración revisada y recursos visuales resueltos; la demo 1C permanece esperando grabación.

Los campos nuevos VoiceProfile/defaultVoiceProfileId/voiceProfiles y la preparación real se especifican en [audio-phase-1a.md](audio-phase-1a.md), parte del contrato actual. Son adiciones opcionales al dominio 0B; el fixture Marcos los utiliza explícitamente.

`src/domain/reel.ts` valida un Reel preparado con Zod estricto. `src/snapshot/compile.ts` compila ese dominio y un manifiesto local a un snapshot en fotogramas. `src/composition/` solo dibuja el snapshot: no importa el dominio ni ejecuta Zod, compila tiempos, agrupa palabras o llama proveedores. `scripts/build-renderer.ts` construye el bundle reutilizable. `scripts/render.ts` valida/compila cada Reel y usa ese bundle sin llamar a bundle().

## Contrato exacto de dominio (schemaVersion 2)

Todas las entidades son objetos estrictos: se rechazan claves desconocidas. IDs: cadenas de 1–100 caracteres. Hashes: 64 caracteres hexadecimales minúsculos. Colores: hexadecimal RGB de seis cifras. Tiempos: milisegundos enteros entre 0 y 60.000; no se aceptan floats temporales. Volumen/confidence sí son fracciones, pues no son tiempos.

**Reel:** `schemaVersion: 2`, `id`, `revision` entero positivo, `renderProfileId: instagram-reel-v1`, `theme`, `scenes` (1–20). IDs de escena únicos; suma de duración final ≤60 segundos. Array de escenas como única fuente de orden. No hay un ReelProject persistente adicional ni timestamps de creación en este contrato.

**Scene:** `id`, `revision`, `targetDurationMs` (1.000–60.000), `narration` (1–2.000 caracteres), `headline` (1–120), `label` (0–40), `accent`, `visual: {kind: typography, motif: orbit|cards|signal}`, `audio`, `paddingAfterMs`, `transition: {kind: fade-through-background, durationMs}` (0–1.000), `captions`.

Duración final derivada = `audio.measuredDurationMs + paddingAfterMs`, entre 1.000 y 60.000 ms. Transición ≤ mitad de la escena. `targetDurationMs` es autoría orientativa, no puede sobreescribir una medición. `paddingAfterMs` es autoría de montaje; el inicio de voz es cero relativo a la escena. Narración no determina duración por conteo de palabras: la determina la medición del archivo. Este schema representa escenas ya preparadas, no borradores sin audio.

**SceneAudio:** `artifactId`, `voiceProfileId?`, `inputHash`, `contentHash`, `measuredDurationMs` positivo, `precision?`, `mimeType: audio/wav|audio/mpeg`, `volume` entre 0 y 1. `precision`, si existe, contiene ambos campos: `durationSamples` entero positivo ≤576.000.000 y `sampleRate` entero entre 8.000 y 192.000. Se comprueba `round(durationSamples * 1000 / sampleRate) === measuredDurationMs`. Las muestras se conservan; no se reconstruyen desde frames.

Cada escena puede usar un artifact distinto o compartir uno. Sustituir audio requiere actualizar su medición y los subtítulos asociados. `artifactId` identifica un recurso; `contentHash` sus bytes SHA-256; `inputHash` los parámetros de generación canonicalizados. La fixture calcula este último desde la receta del tono, frecuencia, sample rate y duración: no finge que los tonos sean voz de la narración. El schema verifica forma y coherencia referencial, no conoce la receta de proveedores futuros.

**Captions:** `audioContentHash`, `source: simulated|provider|forced-alignment|estimated`, `tokens` (0–300), `lines` (0–100). Hash debe corresponder al audio de la escena. estimated es la estrategia local implementada para Marcos; provider/forced-alignment son etiquetas previstas, no integraciones implementadas.

**Token:** `id`, `text` (1–80), `startMs`, `endMs`, `charStart`, `charEnd`, `confidence?` entre 0 y 1. Intervalos semiabiertos y relativos a escena. Fin > inicio. Offsets de texto enteros UTF-16 compatibles con `String.slice`; no bytes ni índices de grafemas. La porción de narración debe ser exactamente text. Tokens únicos, ordenados sin solapamientos de tiempo ni texto y contenidos en audio medido.

**CaptionLine:** `id`, `tokenIds` (1–30), `startMs`, `endMs`. IDs únicos, rangos positivos, ordenados sin solapamiento y contenidos en escena. Referencias existentes, ordenadas, sin duplicación y cada token pertenece exactamente a una línea que contiene su intervalo. La línea puede prolongarse durante silencio o padding. Durante una pausa se pinta la línea completa sin palabra activa. La fixture elige grupos explícitos de distinto tamaño fuera del renderer; no hay algoritmo de layout universal.

**Theme:** `background`, `foreground`, `captionStyle: {fontSize, textColor, activeTextColor, activeBackground, highlightActive?}`. Font size entero 24–72. highlightActive es booleano opcional: ausente equivale a true; el fixture Marcos lo fija a false por sus tiempos estimados. La plantilla conserva posiciones, tamaños del título y motivos fijos; no se introduce un editor ni sistema completo de templates. Cambiar theme altera snapshot/render, no audio ni sus hashes. Accent por escena es presentación, no entrada generativa.

`revision` queda reservado a control de concurrencia optimista futuro; no es clave de caché. `contentHash()` produce SHA-256 de JSON finito canonicalizado con claves ordenadas. El hash de snapshot identifica contenido renderizable, no sustituye la identidad editable del Reel. No hay caché ni repositorio de artifacts implementado.

## Perfil y compilador

Registro explícito `profiles` contiene `instagram-reel-v1`: 1080×1920, 30 FPS. El dominio solo conoce el ID, no usa 30 ni 1.800 para calcular sus límites. La función de conversión recibe fps y se prueba también matemáticamente con 60; esto no significa que se admita otro perfil.

Cuantización única `Q(ms) = round(ms * fps / 1000)`. Inicio global = Q(suma de duraciones anteriores). Duración de escena = Q(fin global en ms) − Q(inicio global en ms). Un tiempo local de subtítulo = Q(inicio global ms + tiempo local ms) − inicio global frame. Esto evita deriva por redondear duraciones independientemente. No existe conversión inversa usada como fuente de verdad. Error de cada frontera global ≤ medio fotograma.

Tokens más cortos que un frame pueden tener intervalo de resaltado vacío: se conserva su texto en la línea, sin inventar duración ni solapar resaltados. Líneas que colapsan al mismo frame se omiten del snapshot visual. Es una limitación explícita de resolución temporal.

Transición compilada: `min(Q(durationMs), floor((durationFrames - 2) / 2))`. Cero desactiva fundido. Con fundido positivo garantiza `0 < fade < duration - fade - 1 < duration - 1`. Se limita la presentación en lugar de rechazar una duración autoral físicamente razonable. El dominio mínimo de un segundo evita escenas de cero/uno frames en el perfil soportado.

**CompositionSnapshot:** `version: 1`, `templateVersion: typography-v2`, `profile: {id,width,height,fps}`, `durationInFrames`, `theme`, `scenes`. Cada escena incluye únicamente `id`, `startFrame`, `durationFrames`, `fadeFrames`, `headline`, `label`, `accent`, `visual`, `audio: {src,volume}`, `lines`. Líneas contienen `id,startFrame,endFrame,tokens`; tokens `id,text,startFrame,endFrame`. No llegan narración, revisions, hashes generativos, targets ni muestras al renderer.

El compilador valida el dominio de entrada con Zod una vez y resuelve `AssetManifest: Record<artifactId,{path,contentHash}>`. Exige coincidencia de hash y rutas `audio/nombre.wav|mp3` con nombre alfanumérico, guion o guion bajo; sin URLs externas ni traversal. Los scripts comprueban además el hash de bytes del archivo local/bundle. El snapshot es salida tipada interna del compilador; no hay endpoint que acepte JSON de snapshots arbitrario. Antes de ofrecer esa frontera externa haría falta validación propia de snapshots.

## Audio sintético del baseline y render actual

Tres WAV mono PCM16 a 48 kHz de 4 segundos con pausas reales entre tonos, generados por `scripts/audio.ts`; 192.000 muestras por archivo. Los subtítulos contienen pausas explícitas de 150 ms. Los tonos no pronuncian palabras ni demuestran alineación semántica de voz. La pista de cada escena comienza en su Sequence. No hay audio global rígido.

Build: `npm run build:renderer` → preparar snapshot de fixture verificado → bundle en `build/renderer` con assets. El baseline sintético se conserva en `npm run render:baseline`. Render actual: `npm run render` → leer fixture privado preparado → validar hashes → servir únicamente sus segmentos por loopback temporal → compilar Reel → descubrir composición → H.264/AAC, yuv420p, BT.709 → metadatos y stills. El bundle solo contiene fuente y audio sintético; el audio de Marcos nunca se copia al bundle. El origen loopback temporal es un parámetro de ejecución separado del snapshot y su hash.

Remotion pinta composición y controla render. Su infraestructura FFmpeg procesa/codifica medios. No se duplica la composición en filtros FFmpeg. Audio AAC puede prolongar el contenedor unos milisegundos por padding de codec.

## Determinismo y fuentes

Node fijado a 22.19.x en engines y 22.19.0 en .nvmrc. Remotion y dependencias exactas en package.json/lockfile. Fuente Inter local versionada con licencia; FontFace.load y delayRender/continueRender bloquean hasta su carga; fallo cancela render. Fallback explícito Arial/sans-serif solo defensivo: no se continúa silenciosamente si falla Inter. Se comprueba carga del texto español y adicionalmente cmap con fontTools en la auditoría opcional; still español verifica representación visual.

ESLint prohíbe Date.now, Math.random, fetch, Date global e imports de infraestructura, dominio, compilador, hashing Node y node:* en composición. Estas reglas cubren usos directos, no son una sandbox ni analizador de flujos para alias maliciosos. La composición actual no tiene tales usos. No se promete identidad binaria entre sistemas; worker futuro fijará SO/navegador/encoder y digest de bundle/fuentes. El render registra Node, Remotion y hash de snapshot; igualdad del snapshot está probada, igualdad binaria de MP4 no.

## Ciclo de vida de una producción

`transitionProduction` admite exactamente un camino: `draft` → `waitingForNarration` → `narrationReady` → `prepared` → `renderable` → `rendered`. Cada estado añade procedencia y no la suelta: `narrationReady` incorpora el recibo de importación, `prepared` y `renderable` el hash del reel preparado, y `rendered` el hash del vídeo.

`rendered` no tiene aristas de salida, y es deliberado. El plan acredita un vídeo concreto mediante una cadena de hashes; devolverlo a un estado anterior dejaría esa cadena describiendo un artefacto que ya no corresponde al plan. Volver a grabar o reeditar es, por tanto, una producción nueva, con su propio identificador y su propia cadena. No es una limitación pendiente de resolver: es lo que hace que un recibo signifique algo.

Las operaciones que mutan una producción se serializan con `withProductionLock`, que escribe en `.operation.lock` el PID, el host y el instante de adquisición. Un lock cuyo proceso ya no existe en este host se reclama, igual que uno que supere las doce horas —lo que acota la reutilización de PID—. Si sigue vivo, el error nombra al dueño y la ruta exacta del archivo. Un lock ilegible se considera retenido hasta cumplir ese mismo plazo, para no descartar por corrupción uno que esté en uso.

## FUTURE ARCHITECTURE — no implementada

La voz predeterminada del producto es Marcos. Su futura imagen/avatar también será identidad predeterminada. Un AvatarProfile independiente de proveedor y nuevos tipos de visual se introducirán cuando corresponda; no existen aquí. Sustituir el audio grabado por futuros artifacts sintetizados mantendrá voice-marcos y el contrato SceneAudio; no se asociará el ID de Marcos a una empresa externa.

Next.js/React/TypeScript/Tailwind para la interfaz mínima; proveedores de texto, voz y alineación solo servidor; Supabase/PostgreSQL y un puerto Storage para futura migración R2/S3. Un worker recibirá trabajos persistentes e idempotentes y usará bundle preconstruido por versión de plantilla, con assets inmutables materializados antes de ejecutar. Ninguno de estos servicios existe en FASE 1A.

Contrato de borrador separado, evaluación de TTS/alineación acústica, costes de proveedor, políticas de reintento, secretos, límites de archivos externos y licenciamiento comercial son trabajo posterior. No se implementan simplemente porque este dominio preparado pueda evolucionar hacia ellos.
