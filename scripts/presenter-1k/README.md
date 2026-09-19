# Recetas del montaje 1K

Estos seis scripts construyeron el montaje de la fase 1K. Vivían sueltos en
`.local/phase-1k/`, fuera de Git, lo que dejaba el camino que produce los reels
sin versionar: se podía renderizar un plan, pero no reconstruir uno.

Se recuperan **verbatim**, sin reescribir. Esperan encontrar el material de la
fase en `.local/phase-1k/` y resuelven la raíz del proyecto desde su propia
ubicación, por lo que funcionan desde aquí sin cambios.

| Script               | Qué hace                                                |
| -------------------- | ------------------------------------------------------- |
| `build-plan.py`      | Construye `edit-plan.json` desde el transcript revisado |
| `prepare-media.py`   | Extrae los intervalos de vídeo y audio del original     |
| `declick.py`         | Suaviza los empalmes de audio en los cortes             |
| `finalize.py`        | Normaliza, mezcla y muxa la entrega final               |
| `check-audio.py`     | Correlación del audio final contra el original          |
| `check-video-map.py` | Comprueba la correspondencia de frames                  |

No son una herramienta mantenida ni tienen tests: son la receta de una fase
concreta, conservada para que el camino sea reproducible.
