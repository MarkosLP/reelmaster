# Audio local de Marcos · contrato y decisiones de FASE 1A

## Lo implementado

Actualización de organización 1J: la grabación está ahora en `.local/presenters/presenter-marcos/originals/VozMarcos.m4a`, con sus bytes y SHA-256 conservados. El localizador contempla esa carpeta y la ubicación antigua, y rechaza duplicados entre ambas. Las referencias a la raíz en informes anteriores describen su ubicación histórica.

La entrada de demostración pasa a ser `VozMarcos.m4a`, localizada por basename sin suponer extensión antes de inspeccionar. Una vez reconocida, el fixture exige su SHA-256 para evitar aplicar los cortes de esta grabación a otra. Si falta, hay varias candidatas, no decodifica o cambia su hash, la preparación falla sin generar un sustituto. No se modifica el original.

El resto del dominio preparado, límites en ms y compilación de frames de 0B se mantienen. Nuevos campos opcionales compatibles con el baseline: Reel.defaultVoiceProfileId, Reel.voiceProfiles (1–20), SceneAudio.voiceProfileId; se rechazan perfiles duplicados y referencias de audio/default sin perfil existente. Source de captions admite `estimated`. CaptionStyle.highlightActive opcional permite desactivar el resaltado; Marcos lo usa en false. No se amplía el tipo visual ni se implementa avatar.

## VoiceProfile ejecutable

`{id, displayName, locale, source, providerBinding?}` estricto. ID y displayName tienen 1–100 caracteres; locale coincide con idioma-país; source es recorded-reference o synthesized. providerBinding, si existe, contiene providerKey y externalVoiceId no vacíos. Este binding es información de adaptación, nunca la identidad del perfil. El schema puede representar un perfil sintetizado pero no hay sintetizador implementado.

Marcos: id `voice-marcos`, nombre `Marcos`, locale `es-ES`, source `recorded-reference`, sin providerBinding. El fixture lo declara como default y referencia el mismo ID en sus cinco SceneAudio. Ninguna ruta local se guarda en VoiceProfile ni SceneAudio.

## Preparación y medición

FFmpeg/FFprobe n7.1, incluidos en Remotion, ejecutados localmente sin nuevas dependencias. El adaptador actual se limita a Windows x64. Se decodifica completamente el original antes de preparar.

Se mantiene el sample rate de entrada 48 kHz y sus dos canales: evitar un resampling o downmix innecesario conserva las características de la grabación y encaja con PCM ya usado por el motor. Formato interno: WAV, PCM16, 48 kHz, estéreo. No se usa MP3 como formato intermedio.

Normalización loudnorm en dos pasadas con objetivo −16 LUFS, techo −1,5 dBTP y LRA 11. La primera mide; la segunda usa esas mediciones. FFmpeg elige modo dinámico porque el aumento de sonoridad requiere controlar picos; no se afirma que el proceso sea una ganancia lineal. Resampling de salida explícito a 48 kHz, metadatos eliminados, flags bitexact y recorte del padding técnico al número de muestras fuente. No se recortan silencios originales ni se cambia la velocidad. Se vuelve a medir el WAV resultante: aproximadamente −16,31 LUFS y −1,50 dBTP en esta ejecución.

La duración viene de duration_ts/time_base del WAV con reloj de muestras, no de una constante. Se guarda duraciónSamples = 1.112.064 y measuredDurationMs = round(samples × 1000 / 48000) = 23.168. Los segmentos también se inspeccionan individualmente. El target autoral de la fixture es 5.000 ms por escena; no decide sus duraciones reales.

## Segmentación y trazabilidad

Detectar silencios en el audio fuente con umbral −32 dB y mínimo 180 ms. Para esta grabación, las cuatro pausas internas ≥460 ms separan los cinco párrafos conocidos. Se exige exactamente ese número: no es un segmentador general de discurso. Los cortes son el punto medio redondeado a ms de cada pausa; se convierten a muestras solo para atrim sobre el WAV normalizado.

| Escena / párrafo | Fuente, ms    | Muestras            | Duración medida, ms |
| ---------------- | ------------- | ------------------- | ------------------- |
| 1                | 0–4.985       | 0–239.280           | 4.985               |
| 2                | 4.985–9.694   | 239.280–465.312     | 4.709               |
| 3                | 9.694–16.304  | 465.312–782.592     | 6.610               |
| 4                | 16.304–21.459 | 782.592–1.030.032   | 5.155               |
| 5                | 21.459–23.168 | 1.030.032–1.112.064 | 1.709               |

`preparation.json` conserva hash original, parámetros, versión FFmpeg, hash normalizado, pausas detectadas, límites de cada derivado en ms/muestras, inputHash y contentHash. Los tests concatenan el PCM de los segmentos y comprueban que reconstruyen exactamente el normalizado, sin huecos ni muestras perdidas. Los puntos de corte están dentro de las pausas detectadas; esto es evidencia acústica de baja energía, no reconocimiento de palabras.

Las transiciones afectan solo imagen; no se desvanece la voz. Redondear fronteras a 30 FPS puede introducir hasta medio frame de diferencia local dentro de esas pausas. El montaje final contiene 695 frames, no 12 segundos forzados. No se convierte ese resultado de vuelta al dominio como nueva duración canónica.

## AlignmentProvider mínimo

Puerto síncrono local: `align({audio, transcript, locale}) → {timingSource, methodVersion, tokens}`. Audio aporta artifactId, contentHash, measuredDurationMs y speechRegions relativos en ms. El proveedor no necesita conocer rutas ni empresas. El resultado admite `estimated`, `aligned` y `measured` como categorías; solo estimated está implementado. Una API asíncrona futura podría requerir evolucionar la firma sin cambiar tokens ni composición.

`LocalEstimatedAlignment` utiliza el transcript conocido, tokenización Unicode por espacios y pesos aproximados de grupos de vocales españolas. Distribuye esos pesos en la duración acumulada de regiones no silenciosas detectadas. Método versionado `es-syllables-speech-regions-v1`. Conserva puntuación, offsets UTF-16 y orden. No inventa valores de confidence.

**MEASURED:** duración y muestras de archivos; pausas detectadas por umbral acústico.

**ESTIMATED:** correspondencia entre palabras del transcript y posiciones temporales. No existe forced alignment, reconocimiento del contenido ni medición del error por palabra. Un token puede abarcar un silencio interno si el reparto ponderado no coincide con una frontera real de palabra.

No hay modelos locales instalados entre whisper/faster_whisper/torch/torchaudio/aeneas/vosk en la inspección realizada; tampoco se encontró un caché de modelos en las ubicaciones habituales consultadas. No se descargó ningún modelo. No se atribuye precisión de decenas de milisegundos: el desfase puede alcanzar centenares de milisegundos o más dentro de un párrafo. Es una ayuda provisional de lectura, no karaoke fiable. El MP4 permite revisión humana junto a la voz real.

## CaptionLines y presentación

La aplicación agrupa antes del renderer: máximo cuatro tokens y 26 caracteres por grupo para este fixture, cortando también tras puntuación fuerte. Un token indivisible de más de 26 caracteres no se corta; queda como limitación de texto no cubierto por este fixture. La línea empieza con su primer token y termina como máximo 500 ms después del último, sin invadir el siguiente grupo ni la escena. Esto conserva lectura durante pausas razonables.

CaptionStyle usa 56 px sobre canvas 1080, blanco de alto contraste, centrado y dentro de los márgenes existentes. highlightActive=false hace honesta la precisión provisional. Se mantienen los caracteres españoles, carga bloqueante de Inter, fallback defensivo y protecciones ESLint de 0B. Cambiar estilo no requiere preparar ni alinear audio otra vez.

## Privacidad y almacenamiento local

- Original: raíz `VozMarcos.m4a`, intacto y excluido por `VozMarcos*` en .gitignore.
- Normalizado compartido: `.local/marcos/normalized.wav`.
- Cinco derivados necesarios para audio por escena: `.local/marcos/audio/marcos-N.wav`.
- Medidas, snapshot y fixture preparado: `.local/marcos/{preparation,prepared,snapshot}.json`.
- MP4, metadatos y stills: `out/marcos/`, también contiene voz personal y está ignorado por Git.
- Navegador ya disponible conservado en `.local/tools/` para no descargarlo después de npm ci.

No se guardan bytes/base64 en logs, no hay entrenamiento ni clonación ni subida. Los assets personales no están en public/ ni en el bundle Webpack. El bundle solo incluye fuente y fixture sintético del baseline. En ejecución, Remotion necesita leer audio: un servidor efímero enlazado exclusivamente a 127.0.0.1 sirve un allowlist de segmentos verificados por hash bajo un token aleatorio no registrado en logs; admite rangos de lectura, no directorios ni el original. Se cierra en finally. El token/puerto son parámetros de transporte, separados del snapshot determinista. Esto usa loopback dentro de la máquina, no internet ni exposición a la LAN.

Los comandos Marcos y tests precargan local-only.mjs, que rechaza conexiones TCP externas del proceso Node. Se reutiliza el navegador local con ruta explícita; si no existe, se falla en vez de descargarlo. FFmpeg está limitado a protocolos file/pipe. No se pretende que estas protecciones equivalgan a un firewall de todo el sistema; no se ha hecho captura de tráfico del SO. No hay URLs ni llamadas de servicios externos en este pipeline. npm ci se ejecutó en modo offline con caché existente.

## Frontera futura, no implementada

Un futuro TTS podría producir otros artifacts con voiceProfileId=voice-marcos y medición individual. Native timestamps o un forced aligner podrían reemplazar LocalEstimatedAlignment y producir los mismos tokens, con una procedencia distinta. Aún faltan selección/evaluación de proveedor, clonación autorizada y cualquier binding real. AvatarProfile, lipsync, imágenes y tipos visuales nuevos no existen en FASE 1A.
