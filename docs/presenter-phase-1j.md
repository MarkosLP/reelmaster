# Preparación local de PresenterAsset real

El CLI `prepare:presenter` prepara audio de una grabación vertical real y conserva los paquetes de vídeo. No monta un Reel ni autoriza su uso editorial.

```powershell
npm run prepare:presenter -- --source .local/presenters/presenter-marcos/originals/VideoSelfie.mp4 --presenter presenter-marcos
```

Los originales viven en `.local/presenters/<presenterId>/originals/`. Cada receta crea una carpeta exclusiva en `prepared/<assetId>/` con MP4, WAV de comparación, metadata, mediciones, receta y `asset.json`. El comando rechaza sobrescrituras; la carpeta de un intento interrumpido se conserva para diagnóstico. No existe todavía reanudación ni biblioteca de clips.

El esquema PresenterAsset referencia el PresenterProfile por `presenterId`. Registra hashes de original y preparado, dimensiones, FPS nominal/medio y variabilidad, audio, privacidad, receta/versionado y ausencia explícita de modificaciones temporales. `approvedForMontage` permanece false. No altera VoiceProfile, PresenterProfile, PreparedReel ni captions existentes.

La receta actual es deliberadamente limitada: vídeo H.264 vertical sin rotación, una pista AAC a 48 kHz mono/estéreo, pistas que empiezan en cero, timestamps de audio contiguos y duración de audio representable exactamente por sus muestras PCM decodificadas. Máximo 120 segundos y 512 MiB. Fuentes con padding o edición temporal no representables por ese contrato se rechazan, no se corrigen silenciosamente.

Tras medir loudness, `loudnorm` normaliza con control de true peak. El objetivo configurable está entre −20 y −16 LUFS; por defecto −18. La receta usa −1,5 dBTP, resample a los 48 kHz originales, límite al número de muestras originales y reconstrucción de PTS desde el contador de muestras. No añade EQ, denoise ni aceleración. Debe aplicarse tras una auditoría que justifique la normalización.

Se conserva el vídeo con `-c:v copy`. Se comprueba igualdad de todos sus paquetes, PTS, DTS, duración y time base; también se exige audio contiguo, idéntico número de muestras, canales conservados, cero muestras PCM a escala completa, loudness final a ±1 LU del objetivo y true peak no superior a −1 dBTP tras AAC. El margen contempla overshoot de codificación. La aceptación técnica no sustituye una escucha.

No hay acceso a red: CLI con `local-only.mjs`, rutas locales verificadas, FFmpeg restringido a protocolos file/pipe, originales y derivados bajo `.local/`, excluido por `.gitignore`. No se copian recursos personales a public ni al bundle. La carpeta privada del presentador contiene el índice para comparar; los informes con fotografías, voz y metadata de la toma permanecen fuera de los documentos versionables.
