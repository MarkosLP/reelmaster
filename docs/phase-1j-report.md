# ReelMaster — Fase 1J: preparación de PresenterAsset real

> Informe reconstruido el 19/09/2026 a partir de los artefactos en disco, no redactado por quien ejecutó la fase. Recoge únicamente lo que los archivos acreditan. Donde no hay evidencia, se dice. El contrato de la fase está en [presenter-phase-1j.md](presenter-phase-1j.md).

## Estado

**Preparación completada; sin montaje y sin aprobación editorial.** `prepare:presenter` produjo un PresenterAsset a partir de una grabación vertical real. No existe `out/phase-1j/`: la fase no entrega vídeo, y eso es lo previsto en su contrato.

`approvedForMontage` sigue en `false`. El asset queda disponible como material, no como pieza aprobada.

## Lo preparado

Un único asset, en `.local/presenters/presenter-marcos/prepared/presenter-asset-85617e3c…8447/`.

|                     | Origen                      | Preparado                      |
| ------------------- | --------------------------- | ------------------------------ |
| Bytes               | 6.161.584                   | 6.525.093                      |
| Resolución          | 478 × 850                   | 478 × 850                      |
| Vídeo               | H.264                       | H.264, copiado sin recodificar |
| FPS nominal / medio | 30 / ≈29,90                 | 30 / ≈29,90                    |
| FPS variable        | sí                          | sí                             |
| Duración            | 28,299578 s                 | 28,299578 s                    |
| Audio               | AAC 48 kHz estéreo, 96 kbps | AAC 48 kHz estéreo, 192 kbps   |

El vídeo se conserva byte a byte: la receta registra `videoProcessing` como copia de flujo y la validación exige igualdad de paquetes, PTS, DTS, duración y base de tiempos. La resolución de origen es 478 × 850, por debajo del formato de entrega; escalar después a 1080 × 1920 no añade detalle, y la fase 1K lo recoge entre sus limitaciones.

## Receta de audio

`presenter-audio-v1`, con hash propio y con el hash del binario de FFmpeg (`n7.1`) registrado junto a él.

```
loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=-28.50:measured_TP=-7.95:
         measured_LRA=4.50:measured_thresh=-38.89:offset=-0.23:linear=false
aresample=48000
atrim=end_sample=1354752
asetpts=N/SR/TB
```

Normalización en dos pasadas con medición previa, techo de true peak a −1,5 dBTP, resample a los 48 kHz originales, recorte al número exacto de muestras del origen y reconstrucción de PTS desde el contador de muestras. Sin EQ, sin denoise, sin cambios de velocidad: el registro de modificaciones temporales está vacío.

## Procedencia y privacidad

Quedan registrados el hash del original (`2652a01e…f33a`) y el del preparado (`ed605d02…070b`). La clasificación es `private`, `localOnly` y `gitIgnored`, con `approvedForMontage: false`. Ni el original ni el preparado salen de `.local/`; nada se copia a `public/` ni al bundle.

Este informe no reproduce fotogramas, voz ni metadatos de la toma, conforme al contrato de la fase.

## Lo que este informe no acredita

- **No hay escucha humana registrada.** La aceptación es técnica: la receta mide, normaliza y verifica, y eso no sustituye a escuchar el resultado.
- **Existe un seguimiento posterior sin reconstruir.** `.local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/` contiene un `DENOISED-RNNOISE.mp4`, su WAV y una receta, y hay un directorio `.local/phase-1j2`. Es trabajo posterior a esta fase que no se ha auditado aquí y que la receta `presenter-audio-v1` no contempla.
- **No se ha vuelto a ejecutar `prepare:presenter`** durante la reconstrucción; los datos proceden de `asset.json` y de los artefactos ya existentes.
