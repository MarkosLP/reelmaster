# La app local y la revisión de montaje

`npm run app` abre la biblioteca: las entregas de `out/` con su estado, y las producciones con trabajo real. Desde una entrega con plan se entra a la pantalla de revisión que describe el resto de este documento. La misma pantalla está disponible suelta con `review:presenter`.

Primera superficie de interfaz del proyecto. Cierra el paso que quedaba abierto al final de 1K: aprobar o rechazar un montaje exigía ver el MP4 por fuera y editar JSON a mano.

```powershell
npm run review:presenter -- --plan .local/phase-1k/edit-plan.json --video out/phase-1k/reel-1k-marcos.mp4
```

El comando imprime una URL de loopback, la abres en el navegador, ves el montaje y decides. Al guardar, el proceso termina.

## Qué es y qué no

Es una pantalla de **revisión**, no un editor. No cambia cortes, no reescribe el plan y no vuelve a renderizar: lee un montaje ya exportado y recoge un veredicto humano sobre él. Cambiar el montaje sigue siendo reconstruir el plan y volver a renderizar.

La página muestra el vídeo, una barra con los cortes y los apoyos situados en el tiempo, la lista de cortes con su motivo y la de subtítulos con su entrada. Todo es navegable: pulsar en un corte o en un subtítulo lleva el vídeo a ese punto, y la barra acepta clic directo.

## El veredicto

Se sella en `.local/reviews/<planHash>.json` con el esquema `PresenterEditReview`, y queda atado al par exacto que se revisó: el hash del plan, el del vídeo y el de la fuente. Un veredicto no se puede despegar de su montaje ni reutilizar para otro.

El esquema impone la coherencia que el resto del proyecto ya exige en `image-quality.ts`:

- Aceptar requiere que no queden pegas abiertas; rechazar requiere al menos una.
- `timingApproval` solo puede ser cierto sobre un montaje aceptado.
- `timingApproval` no puede convivir con una pega de sincronía de audio.
- El revisor es siempre `human`. Un montaje hay que verlo y oírlo; no existe la inspección automática de esta decisión.
- Las notas son obligatorias, entre 5 y 1600 caracteres.

**Aprobar aquí no convierte los tiempos en alineación humana.** Los captions siguen etiquetados `MODEL_ESTIMATED_HUMAN_TEXT`. `timingApproval` responde únicamente a si los tiempos resultan aceptables al verlos, y la página lo dice en pantalla.

El veredicto **no modifica** `edit-plan.json` ni `reviewedTranscript.json`. Los hashes de ambos ya están encadenados y reescribirlos rompería la procedencia: por eso la revisión es un artefacto nuevo y aparte, no una bandera dentro de los existentes. El `timingApproval: false` que vive dentro de `reviewedTranscript.json` pertenece a la revisión del texto y sigue donde está.

## Privacidad y red

Mismo trato que el servidor privado de assets, del que copia las primitivas:

- Escucha solo en `127.0.0.1`, en un puerto efímero.
- La ruta lleva un token aleatorio de 24 bytes; sin él, 404.
- Rechaza cualquier `Origin` que no sea el propio loopback.
- `nosniff`, `Cache-Control: no-store` y una CSP con `default-src 'none'` en la página.
- El cuerpo de un POST se corta a 64 KiB.
- El vídeo se verifica contra su hash **antes** de servirse: el servidor no abre si el archivo no es el que se dice revisar.
- El montaje se sirve con `Accept-Ranges`, para poder arrastrar por la barra sin descargar los 20 MB de golpe.

La página no carga nada de fuera: no hay dependencias, ni fuentes remotas, ni scripts externos. Se sirve entera desde el proceso, y por eso sigue funcionando con el cortafuegos `local-only.mjs` activo, que solo permite loopback.

El plan de edición entra desde `.local/`; el montaje puede venir de `.local/` o de `out/`, porque una entrega vive ahí. Ambos directorios están fuera de Git.

## Límites

- Revisa un montaje del pipeline de presentador. No conoce `ProductionPlan` ni su máquina de estados.
- No lista montajes: se le pasa el plan y el vídeo concretos.
- Guardado el veredicto, el servidor se cierra. Para cambiar de opinión se vuelve a ejecutar; el archivo se reescribe de forma atómica.
- No consume todavía el veredicto: ningún paso posterior lee `.local/reviews/`. Es el registro de la decisión, y conectarlo a lo que venga después es trabajo pendiente.
