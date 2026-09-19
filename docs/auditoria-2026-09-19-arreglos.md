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
| P2 · README tres fases por detrás                      | Pendiente                                                                          |
| P2 · Motivo `signal` sin implementar                   | Pendiente — requiere decisión                                                      |
| P2 · Incoherencia wav/mp3                              | Pendiente — requiere decisión                                                      |
| P2 · Composición sin tests de render                   | Pendiente                                                                          |
| P3 · `render-presenter.ts` sin `realpath`              | Corregido                                                                          |
| P3 · `defaultProps` inválidos en `presenter-index.tsx` | Corregido                                                                          |
| P3 · Máquina de estados terminal                       | Pendiente — requiere decisión                                                      |
| P3 · Heurística de subtítulos fija                     | Pendiente                                                                          |
| P3 · Rendimiento de `analyzePcm16`                     | Pendiente                                                                          |
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

## Pendiente, y por qué

Requieren una decisión de Marcos y Codex, no un arreglo:

- **mp3.** `compile.ts` y el dominio lo aceptan; `private-server.ts` solo sirve
  `.wav`. Hay que decidir si se soporta —y entonces servirlo— o si se retira del
  dominio. Mientras tanto, un reel con mp3 compila y falla en render.
- **Motivo `signal`.** Hoy se pinta igual que `orbit`. Implementarlo o retirarlo
  del dominio y de `demo.ts`.
- **Estado `rendered` terminal.** Si la inmutabilidad de procedencia es deliberada,
  merece decirse en `architecture.md`; si no, hace falta una arista de vuelta.

Quedan también, por volumen de trabajo más que por duda:

- **Tests de render de la composición**, el hueco de cobertura más grande: ~1.050
  líneas de React sin un solo `renderStill` en la suite.
- **README e informes de 1J y 1K.**
- **Heurística de subtítulos** desacoplada de `fontSize`.
- **Rendimiento de `analyzePcm16`.**

La limpieza de `out/` y de los 18 directorios `presenter-test-*` y
`recording-path-test-*` de `.local/` (~70 MB) no se ejecutó: borrar archivos no es
reversible y conviene confirmarlo antes.

## Verificación

Tras los cambios, en local:

| Puerta                   | Resultado                    |
| ------------------------ | ---------------------------- |
| `npm run typecheck`      | 0                            |
| `npm run lint`           | 0                            |
| `npm test`               | 165/165                      |
| `npm run format:check`   | 0                            |
| `npm run build:renderer` | 0, con el cortafuegos activo |

No se volvió a renderizar el vídeo de la fase 1K ni se repitió su verificación de
hash; el último recálculo es el registrado en la auditoría.
