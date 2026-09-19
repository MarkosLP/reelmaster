# ReelMaster — Fase 1K: montaje de presentador y entrega

> Informe reconstruido el 19/09/2026 a partir de los artefactos en disco, no redactado por quien ejecutó la fase. Recoge lo que los archivos acreditan; donde no hay evidencia, se dice. El contrato está en [presenter-edit-phase-1k.md](presenter-edit-phase-1k.md), y la nota de continuidad en [CONTINUAR-MANANA.md](../CONTINUAR-MANANA.md).

## Estado

**Exportado y verificado técnicamente. Pendiente de valoración audiovisual humana.** No consta aprobación temporal ni aprobación final: `timingApproval` sigue en `false`.

## Entrega

`out/phase-1k/reel-1k-marcos.mp4` — tres formas de ahorrar tiempo con IA, con Marcos como presentador y subtítulos.

|            |                                                                    |
| ---------- | ------------------------------------------------------------------ |
| SHA-256    | `2a69b4bc291ccaca4d14a4a50f9e45478b03eb23b5c52bd1f419ef4f0e21e3dd` |
| Bytes      | 20.178.090                                                         |
| Vídeo      | H.264 High, nivel 4.0, 1080 × 1920, 30 fps, 718 frames             |
| Color      | yuv420p, BT.709, rango TV, progresivo                              |
| Audio      | AAC 48 kHz estéreo, 192 kbps, 1.123 frames                         |
| Duración   | 23,933333 s (vídeo) · 23,933 s (audio)                             |
| Contenedor | MP4 con `+faststart`, metadatos eliminados (`-map_metadata -1`)    |

El hash se recalculó el 19/09/2026 sobre el archivo y coincide con el documentado. Hay además 17 capturas en `out/phase-1k/stills/`, tomadas alrededor de cada corte.

## El plan de edición

`.local/phase-1k/edit-plan.json`: 30 fps, 718 frames de salida, cinco segmentos, veinte captions y tres apoyos.

| Origen (frames) | Salida | Escala | Motivo                                                                      |
| --------------- | ------ | ------ | --------------------------------------------------------------------------- |
| 21 – 164        | 0      | 1      | Hook: quitar espera inicial, preservar frase completa                       |
| 193 – 341       | 143    | 1,035  | Primer ejemplo; retirar espera previa y terminar antes de la autocorrección |
| 393 – 522       | 291    | 1      | Segundo ejemplo tras retirar autocorrección                                 |
| 528 – 681       | 420    | 1,04   | Tercer ejemplo; punch-in asociado a sección                                 |
| 688 – 833       | 573    | 1      | CTA humano completo y gesto final                                           |

Los cortes son conjuntos de audio y vídeo: no hay desincronización posible por construcción, porque el plan describe intervalos de origen únicos que se reubican en la salida. Las escalas se quedan en 1,035 y 1,04, holgadamente dentro del máximo de 1,06 que valida el esquema. Los tres apoyos son `weather-recipe`, `checklist` y `data-report`, elegidos por tipo y nunca por identificador de escena.

## Verificación registrada

De `out/phase-1k/verification.json`:

- **Sincronía.** Correlación audio original contra audio final en cinco puntos (0,4 s; 5,17 s; 10,1 s; 14,4 s; 19,5 s): desfase de 0,0 ms en los cinco y correlación entre 0,99944 y 0,99994.
- **Loudness.** Salida a −18,03 LUFS con true peak de −1,50 dBTP, frente a un objetivo de −18. Ninguna muestra a escala completa.
- **Imagen.** Decodificación completa de los 718 frames; `blackFramesDetected: false`.
- **Texto.** `rawTranscriptUnchanged: true` y `captionTextMatchesReview: true`: el transcript STT original no se tocó y los captions entregados corresponden al texto revisado por una persona.
- **No destrucción.** 46 archivos anteriores preservados.

El muxado final copia el vídeo ya renderizado (`-c:v copy`) y codifica el audio una sola vez a AAC 192 kbps.

## Procedencia del texto

El transcript revisado se guarda con procedencia `HUMAN_REVIEWED_TEXT` en `.local/phase-1k/reviewedTranscript.json`, y la evidencia privada conserva la correspondencia con las palabras del STT, sus inserciones, sustituciones y eliminaciones.

Que una persona haya revisado el texto no convierte sus tiempos en alineación humana: los captions siguen etiquetados `MODEL_ESTIMATED_HUMAN_TEXT`. Esta distinción es deliberada y el proyecto la mantiene en todo el recorrido.

## Limitaciones

- **Falta la valoración humana.** La verificación es técnica. Nadie ha dejado constancia de haber visto y escuchado el resultado para decidir sobre cortes, sincronización y acabado.
- **Origen VFR escalado.** El material de 1J es de tasa variable y 478 × 850; convertirlo a CFR implica cuantización a frames, y llevarlo a 1080 × 1920 no añade detalle.
- **Herramienta experimental.** `render:presenter` es el camino de esta prueba, no una biblioteca de edición. Hasta la auditoría del 19/09/2026 ni siquiera estaba registrado en `package.json`; ahora sí, y con el cortafuegos de red del proyecto.
- **No se ha vuelto a renderizar** durante la reconstrucción de este informe: solo se inspeccionaron archivos y se recalculó el hash.
