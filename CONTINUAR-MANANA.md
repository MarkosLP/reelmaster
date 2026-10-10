# ReelMaster — continuidad al 20/09/2026

Este documento recoge dónde queda el proyecto al terminar la sesión del 19 y 20
de septiembre. Sustituye a la recuperación del 14/09, que presentaba la fase 1K
como el frente abierto. 1K sigue entregada y sin tocar, pero el trabajo ya no
está ahí: ha pasado de exportar un reel a decidir cuál funciona.

## La entrega de 1K, intacta

- Vídeo: `out/phase-1k/reel-1k-marcos.mp4`.
- Duración 23,933 s; 1080 × 1920; 30 fps; 718 frames; audio AAC.
- SHA-256 recalculado hoy: `2a69b4bc291ccaca4d14a4a50f9e45478b03eb23b5c52bd1f419ef4f0e21e3dd`.
- Evidencia técnica: `out/phase-1k/verification.json`. Documentación: `docs/presenter-edit-phase-1k.md`.
- Texto con procedencia HUMAN_REVIEWED_TEXT en `.local/phase-1k/reviewedTranscript.json`; `timingApproval` sigue en false.

Lo que aquel documento pedía —revisar el MP4 para concretar ajustes— ya no
obliga a ver el vídeo por fuera ni a editar JSON a mano: `npm run app` abre la
biblioteca y desde una entrega con plan se entra a la pantalla de revisión
(`docs/revision-montaje.md`). El veredicto se sella en
`.local/reviews/<planHash>.json`, atado al hash del plan, del vídeo y de la
fuente. No hay ninguno sellado: la carpeta está vacía, así que no consta
aprobación temporal ni final. La revisión audiovisual humana sigue pendiente,
igual que el 14/09.

## Lo que se añadió el 19 y el 20

`cb8fd82` deja en git ReelMaster tal como lo entregó Codex Astra, fases 0 a 1K.
Sobre esa línea base:

- **Auditoría externa** documentada con el estado de cada hallazgo
  (`docs/auditoria-2026-09-19.md` y `docs/auditoria-2026-09-19-arreglos.md`).
  Cerradas las puertas rojas de formato y red, el lock de producción que podía
  quedar huérfano, el contrato estricto de `presenter-edit` y las rutas de
  `render-presenter`.
- **La app local** (`npm run app`): primera interfaz del proyecto. Biblioteca de
  entregas y pantalla de revisión de montaje. Es revisión, no edición: lee un
  montaje exportado y recoge un veredicto humano sobre él.
- **Registro de experimentos** (`src/domain/reel-experiment.ts`): huella
  estructural de cada reel —duración, primer corte, cortes por minuto,
  subtítulos, palabras por subtítulo, texto en pantalla, apoyos, punch-ins— y un
  hueco para lo que informe Instagram. Nada se estima: o lo has mirado y lo has
  escrito, o el campo no está. Sin `publishedAt` no se admiten métricas, porque
  sin publicar no hay experimento sino un reel guardado.
- **Repaso semanal** (`npm run semanal`): cuenta lo que hay, señala lo que falta
  medir y se niega a comparar con menos de seis medidas.
- **Variantes de gancho** (`npm run variant:montage`): tres montajes de la misma
  toma, las mismas palabras y el mismo corte interno. Lo único que cambia es por
  dónde entra el reel, así que si uno funciona mejor no puede ser por otra cosa.

| variante        | dura    | abre con             | cortes | subtítulos |
| --------------- | ------- | -------------------- | ------ | ---------- |
| gancho-completo | 23,93 s | «¿Sabías que la»     | 5      | 20         |
| gancho-corto    | 22,80 s | «IA puede ahorrarte» | 5      | 19         |
| gancho-directo  | 19,03 s | «Primero, la IA»     | 4      | 16         |

Están en `out/variants/`, cada una con su huella. Los tres SHA-256 se han
recalculado hoy y coinciden con `out/variants/variants.json`.

`trimMontageStart` recorta la entrada de un plan y reubica lo que queda; se
niega a cortar a mitad de subtítulo y el plan resultante vuelve a pasar por el
esquema. Por el camino salió a la luz una dependencia que estaba escondida: el
ffmpeg que trae Remotion no tiene setpts, fps ni tpad, y 1K usaba otro binario
con la ruta absoluta escrita dentro de un script de Python. Ahora
`editingFfmpeg` lo busca, comprueba que tenga los filtros y falla diciendo qué
falta y cómo indicarlo con `REELMASTER_FFMPEG`.

## Punto de continuación

El registro está vacío y no lo puede llenar el código. `npm run semanal` hoy:

```
13 reels con huella · 0 publicados · 0 medidos
```

Trece montajes con huella: las tres variantes, la entrega de 1K y las nueve
simulaciones —que son pruebas de estructura de 4 s, no material publicable,
aunque el repaso las liste junto a lo demás—. Ni una sola medida.

El siguiente movimiento es humano y está fuera del repositorio: publicar en
Instagram y apuntar los números con `npm run app`. Con menos de seis reels
medidos no hay nada que concluir sobre qué gancho funciona; una diferencia entre
tres sería el azar de una semana.

## Lo decidido el 20/09 por la tarde

Tras una consulta externa y una revisión, el plan quedó cerrado y **no se vuelve
a rediseñar**: `gancho-completo` esta semana, `gancho-corto` y `gancho-directo`
las dos siguientes, y la toma nueva a 1080 × 1920 se graba en paralelo para que
la fase 1 salga en la cuarta semana.

Las tres primeras publicaciones **no buscan ganador**. Dan una primera estimación
del ruido observable de la cuenta. Nada de análisis intermedio: se espera a las
tres medidas. El protocolo de publicación y sus limitaciones están en
`.local/consultas/2026-09-20-decision-siguiente-reel.md`.

Víctor Heras baja de manual a fuente de hipótesis: `docs/referencia-victor-heras.md`.

## Laboratorio de demos — analizado, sin implementar

Se estudió si cabe un laboratorio de demos audiovisuales reutilizando lo que hay.
Cabe, con tres piezas pequeñas, y `scripts/simulate-reels.ts` ya es ese
laboratorio para la plantilla tipográfica. Dos hallazgos que condicionan el
diseño:

- **`discoverReels` no distingue entrega de demo**, así que las nueve
  simulaciones ya aparecen hoy como publicables en `npm run semanal` y el
  registro de experimentos las aceptaría. La fuga existe antes de añadir nada.
- Una demo de «curiosidad sostenida» exigiría **reordenar la fuente**, que el
  esquema prohíbe por invariante; y una de «menos cortes» devolvería las pausas y
  el tropiezo que cada corte eliminó. Ninguna de las dos se resuelve montando:
  se resuelven grabando.

Paso siguiente acordado: el discriminante `delivery` / `demo`, para que el
registro y el repaso rechacen las demos. Nada implementado todavía.

## Qué se ha comprobado al escribir esto

Se han recalculado los cuatro SHA-256 —la entrega de 1K y las tres variantes—,
se ha ejecutado `npm run semanal` y se ha pasado la suite entera: 195 tests, 195
en verde, 76 s.

No se ha reproducido ningún vídeo ni se ha vuelto a renderizar nada.

La recuperación del 14/09 y los documentos STOP anteriores quedan como
antecedentes: describen estados superados.
