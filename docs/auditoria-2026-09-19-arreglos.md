# Arreglos de la auditoría del 19 de septiembre de 2026

Registro de qué se corrigió de [auditoria-2026-09-19.md](auditoria-2026-09-19.md),
qué se dejó pendiente y por qué. Aplicado por Claude (Opus 5) el mismo día.

Las referencias de línea de la auditoría corresponden al árbol anterior a estos
cambios; `local-files.ts` en particular se reescribió y ya no coincide.

## Estado por hallazgo

| Hallazgo                                               | Estado                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| P0 · Sin control de versiones                          | Parcial — repositorio creado; el respaldo de `.local/` sigue pendiente y es manual |
| P1 · `render-presenter.ts` no reproducible             | Corregido                                                                          |
| P1 · Lock huérfano en `withProductionLock`             | Corregido                                                                          |
| P1 · `format:check` en rojo                            | Corregido                                                                          |
| P2 · `presenter-edit.ts` sin `.strict()`               | Corregido                                                                          |
| P2 · README tres fases por detrás                      | Corregido                                                                          |
| P2 · Motivo `signal` sin implementar                   | Corregido — se implementa                                                          |
| P2 · Incoherencia wav/mp3                              | Corregido — el dominio se estrecha a WAV                                           |
| P2 · Composición sin tests de render                   | Corregido                                                                          |
| P3 · `render-presenter.ts` sin `realpath`              | Corregido                                                                          |
| P3 · `defaultProps` inválidos en `presenter-index.tsx` | Corregido                                                                          |
| P3 · Máquina de estados terminal                       | Documentado como deliberado                                                        |
| P3 · Heurística de subtítulos fija                     | Corregido                                                                          |
| P3 · Rendimiento de `analyzePcm16`                     | Corregido                                                                          |
| P3 · Higiene de `out/` y `.local/`                     | Pendiente — borrar archivos no es reversible                                       |

## Lo corregido

### Control de versiones

`git init` sobre la rama `main`, con un primer commit que captura el árbol tal
como lo entregó Codex Astra, antes de cualquier arreglo, para que exista un punto
de retorno fiel a la entrega. El `.gitignore` ya existente dejó fuera
`node_modules/`, `out/`, `build/` y `.local/`: 156 archivos y 2,2 MB versionados,
sin que se colara nada de `.local/`.

Esto **no** completa el respaldo. `.local/` queda fuera del repositorio a
propósito, porque contiene material personal, y ahí viven las grabaciones
originales, el navegador de Remotion fijado, el entorno de STT con sus pesos y la
cadena de recibos de las producciones. Necesita una copia propia, fuera de
`D:\Descargas`. Mientras no exista, el riesgo del P0 sigue en pie en su mayor parte.

### Cortafuegos de red y `render:presenter`

`render:presenter` se registró en `package.json`, de modo que el camino que
produjo el vídeo de la fase 1K deja de invocarse a mano.

Se añadió `--import ./scripts/local-only.mjs` a los cinco scripts que no lo
cargaban: `render:presenter`, `audio`, `snapshot`, `render:baseline` y
`build:renderer`. Ninguno necesita red —son I/O de archivos, hashing, bundling y
render con navegador local—, así que el guard no cambia su comportamiento, solo
cierra la incoherencia de que hubiera rutas capaces de salir a internet.

Verificado ejecutando `snapshot`, `audio` y `build:renderer` con el guard puesto:
los tres terminan en 0, y `snapshot` y `audio` regeneran sus artefactos ya
versionados byte a byte idénticos.

### Lock con recuperación

`withProductionLock` escribe ahora dentro del `.operation.lock` quién lo tiene:
PID, host y marca de tiempo ISO. Al encontrar un lock existente:

- Si el proceso que lo escribió ya no corre —y el host coincide—, se reclama.
- Si supera las 12 horas de vida, se reclama, aunque su dueño siga vivo. Esto
  acota el caso de reutilización de PID.
- Si no, se rechaza con `BUSY` y un mensaje que nombra al dueño, cuánto lleva
  retenido y la ruta exacta del archivo a borrar.

Un lock ilegible se trata como retenido hasta cumplir el mismo plazo, para no
descartar por corrupción un lock que sí esté en uso. La reclamación solo borra el
archivo si su contenido sigue siendo el inspeccionado, lo que estrecha la ventana
de carrera; el `open(..., "wx")` posterior sigue siendo el árbitro atómico.

Cubierto por cuatro tests nuevos en `production.test.ts`: dueño desaparecido,
caducidad por TTL, lock ilegible reciente y luego caducado, y el mensaje de un
lock vivo.

### Formato

`CONTINUAR-MANANA.md` tenía un BOM UTF-8 y un CRLF suelto en la línea 22. No había
ninguna diferencia de contenido. `npm run format:check` vuelve a estar en verde.

### Contrato estricto en `presenter-edit.ts`

Los tres `z.object` anidados y el objeto exterior llevan ya `.strict()`, como
exige [architecture.md](architecture.md) y como hace el resto del dominio. Las
claves desconocidas se rechazan en lugar de descartarse en silencio. Un test nuevo
en `presenter-edit.test.ts` lo comprueba en los cuatro niveles.

Los esquemas no estrictos de `comfy-image-provider.ts` se dejaron como estaban:
parsean una API ajena, donde la tolerancia es deliberada.

### Contención de rutas en `render-presenter.ts`

La comprobación por prefijo de cadena con separador de Windows escrito a mano se
sustituyó por `realpath` más `relative`, el mismo patrón que ya usaban
`local-files.ts` y `private-server.ts`, más el rechazo explícito de rutas de red.
Un enlace simbólico dentro de `.local/` ya no pasa el filtro. El script trabaja
además con las rutas canónicas resultantes, no con las de entrada.

La salida se valida resolviendo su directorio padre, porque el archivo todavía no
existe cuando se comprueba.

### `defaultProps` del estudio

Los `defaultProps` de `presenter-index.tsx` declaraban un plan que el propio
esquema habría rechazado: hashes vacíos y `segments: []` frente a un `.min(1)`.
Ahora son un plan mínimo válido. `videoUrl` sigue siendo `""`: no hay ninguna URL
válida en el estudio, porque el servidor privado solo existe durante el render.

## Segunda tanda: las decisiones

La auditoría dejó tres puntos esperando una decisión. Se tomaron así.

### mp3: se retira del dominio

`compile.ts` aceptaba rutas de asset `.wav` o `.mp3` y `ReelSchema` admitía `audio/mpeg`, pero el servidor privado solo sirve `.wav`. La comprobación decide el caso: **toda** ruta de audio del pipeline se construye como `audio/<id>.wav`, en `import-recording.ts`, `prepare.ts` y `audio.ts`, y `prepared-reel.ts` ya lo exigía en dos sitios. Ningún dato real contiene `audio/mpeg` ni existe un solo `.mp3` bajo `.local/`.

Era una rama inalcanzable cuyo único efecto posible era la trampa descrita: compilar bien y reventar en render. El dominio se estrecha a WAV.

Los mp3 **de entrada** siguen aceptándose: `inspectRecording` los admite junto a M4A, FLAC y OGG, y los normaliza a WAV al importarlos. Lo que desaparece es la posibilidad de declarar un artefacto mp3 que el render no podría servir.

### `signal`: se implementa

La alternativa era retirarlo del dominio, pero eso obligaba a tocar `demo.ts` y, con ello, el snapshot versionado y su hash. Implementarlo no altera ningún dato: solo el renderizador.

`signal` pasa a ser tres anillos discontinuos que se expanden de 190 px a 620 px y se desvanecen al crecer, sin rotación. Se distingue de `orbit` en un fotograma fijo —trazo discontinuo, radios distintos— y en movimiento, que es donde vive un reel. El diseño es una propuesta, no una especificación recuperada: si no es lo que se buscaba, cambiarlo es tocar una función de veinte líneas.

### `rendered` terminal: se documenta como deliberado

La máquina de estados es estrictamente lineal y cada estado acumula procedencia: `narrationReady` añade el recibo, `prepared` y `renderable` el hash del reel preparado, `rendered` el hash del vídeo. Devolver un plan a un estado anterior dejaría esa cadena describiendo un artefacto que ya no le corresponde.

No se añade ninguna arista de vuelta. Se documenta en [architecture.md](architecture.md), en una sección nueva sobre el ciclo de vida, junto al comportamiento del lock.

## Segunda tanda: el resto

### Tests de render de la composición

Era el hueco de cobertura más grande: ~1.050 líneas de React sin un solo `renderStill` en la suite. `tests/composition-render.test.ts` renderiza de verdad y compara los bytes del PNG.

No fija ningún hash dorado: dependería de la versión del navegador y se rompería en la primera actualización. Comprueba relaciones entre renders producidos en la misma ejecución —el perfil declarado, que repetir un fotograma da bytes idénticos, que los tres motivos tipográficos salen distintos, que los acentos llegan al fotograma, que apagar el resaltado cambia la banda de subtítulos— más una comprobación absoluta: el píxel del fondo es `#101116`, el del tema, leído con el propio ffmpeg del proyecto.

El test de los tres motivos es el que no habría pasado antes de implementar `signal`. Seis pruebas, unos 12 segundos.

Un detalle costó un intento: las props resueltas viajan dentro de la composición, no solo en `inputProps`, así que cada snapshot hay que resolverlo por separado o se renderiza el de partida. `render-baseline.ts` ya lo hacía así para el caso español.

### Heurística de subtítulos

El límite era fijo —4 palabras y 26 caracteres— sin relación con `captionStyle.fontSize`, que el esquema admite entre 24 y 72. Ahora se deriva de la caja real: 900 px menos 24 px de relleno por token, con una cota superior prudente de 0,62 em para el avance de ReelSans.

La derivación devuelve exactamente 26 a `fontSize` 49, el tamaño de la demo: el número fijo estaba ajustado a ese tamaño y nunca se revisó. A 56, el que usan las rutas de Marcos, el presupuesto baja a 23; con 26 la línea más ancha se iba a unos 999 px sobre una caja de 900. A 72 baja a 18.

Esto cambia el agrupado de líneas en preparaciones nuevas; no toca ningún artefacto ya generado. `prepareCaptionLines` recibe ahora el tamaño de fuente de forma explícita, y `marcos.test.ts` comprueba contra el presupuesto derivado del propio tema en lugar de contra un 26 escrito a mano.

### `analyzePcm16`

El array por fotograma solo servía para la correlación estéreo. Sustituido por dos escalares: ~1,15 M de asignaciones menos en 24 s a 48 kHz, con el mismo resultado.

### Documentación

El README ya no se titula «FASE 1F»: declara el estado real —1K entregada, pendiente de valoración humana— y documenta 1I, 1I-v2, 1J y 1K.

[phase-1j-report.md](phase-1j-report.md) y [phase-1k-report.md](phase-1k-report.md) son informes **reconstruidos a partir de los artefactos**, no redactados por quien ejecutó las fases, y lo dicen en su primera línea. Recogen lo que `asset.json`, `edit-plan.json` y `verification.json` acreditan, y enumeran lo que no. El SHA-256 del MP4 entregado se recalculó el 19/09/2026 y coincide.

## Pendiente

La limpieza de `out/` y de los 18 directorios `presenter-test-*` y `recording-path-test-*` de `.local/` (~70 MB) sigue sin ejecutarse. Borrar ahí no es reversible: git no cubre ninguno de los dos directorios y `out/` contiene el único ejemplar del vídeo entregado. Conviene confirmarlo antes.

El respaldo de `.local/` sigue siendo manual y pendiente, y es la mayor parte del P0.

Los tests de render dejan su bundle en `.local/render-tests/`, un directorio fijo que se limpia al empezar cada ejecución en lugar de acumular uno por corrida.

## Verificación

Tras los cambios, en local:

| Puerta                   | Resultado                    |
| ------------------------ | ---------------------------- |
| `npm run typecheck`      | 0                            |
| `npm run lint`           | 0                            |
| `npm test`               | 173/173                      |
| `npm run format:check`   | 0                            |
| `npm run build:renderer` | 0, con el cortafuegos activo |

No se volvió a renderizar el vídeo de la fase 1K; sí se recalculó su SHA-256, que coincide con el documentado.
