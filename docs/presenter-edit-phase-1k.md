# Edición de presentador — prueba 1K

`PresenterEditPlan` representa cortes conjuntos de audio/vídeo con intervalos de origen y posiciones de salida en una base de 30 fps. Valida orden, continuidad de salida, duración total, captions y apoyos visuales acotados. `sourceToOutputFrame` devuelve null para material eliminado.

Los hashes vinculan fuente, transcript STT original y revisión humana. Los captions apuntan a palabras revisadas; la evidencia privada conserva su correspondencia con palabras STT, inserciones, sustituciones y eliminaciones. La revisión del texto no convierte sus tiempos en alineación humana: siguen etiquetados `MODEL_ESTIMATED_HUMAN_TEXT`.

La preparación audiovisual local produce vídeo CFR y audio PCM a partir de los mismos intervalos. No cambia velocidad. La composición recibe decisiones resueltas por el contrato de snapshot; no consulta STT, modelos o guiones ni decide qué cortar. Los apoyos se eligen por su tipo, nunca por un identificador de escena particular.

`render-presenter.ts` usa un entrypoint independiente y un servidor privado de assets existente sobre loopback, con allowlist y hashes. El bundle de esta prueba copia solo la fuente tipográfica pública; el vídeo se sirve por la ruta privada. El render visual se combina después con audio de la edición, codificado una vez a AAC.

La prueba y sus recetas privadas residen en `.local/phase-1k/`; la entrega nueva está en `out/phase-1k/`, ambas excluidas de Git. No cambia las composiciones, snapshots o outputs de fases anteriores.

Limitaciones: origen VFR convertido a CFR implica cuantización visual a frames; el detalle de la fuente no aumenta al escalar a 1080p. La revisión temporal por imágenes y métricas complementa, pero no sustituye, la reproducción audiovisual humana. El CLI sigue siendo una herramienta experimental para esta fase, no una biblioteca de edición completa.
