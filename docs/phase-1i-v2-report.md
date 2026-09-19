# ReelMaster — Fase 1I-V2

## Estado

**PASS WITH ISSUES.** Variante visual del mismo Reel, entregada para valoración de Marcos. **CLOSE BUT NEEDS POLISH.** Mejora comprobada en redundancia, variedad y evolución visual; la valoración audiovisual humana sigue pendiente.

[Ver V2](../out/phase-1i-v2/reel-1i-v2-marcos.mp4) · [Comparar con V1](../out/phase-1i/reel-1i-marcos.mp4).

## Auditoría V1

Antes de editar código se leyeron el CompositionSnapshot, PreparedReel, perfiles, duraciones, captions, SceneVisualBindings, VisualPlan/GraphicSpec, LocalGraphicResolver y el renderer. Se abrieron los cinco stills originales y se inspeccionó una secuencia de toda la V1 a dos muestras por segundo. No se afirma haber escuchado la grabación.

La causa de la redundancia era concreta: LocalGraphicResolver rasterizaba un GraphicSpec de tipo `title` cuyo `headline` repetía el encabezado y cuyo `supportingText` contenía la narración completa. MediaSceneView añadía nuevamente headline y captions. Los bindings resolvían esos PNG como imágenes estáticas dentro de una caja de 900×1000. Hook y cierre usaban el mismo motivo genérico de marcos giratorios.

| sceneId | Duración real | Narración conservada                                                            | Título V1                  | Visual actual / problema                                    | Propuesta V2                                              |
| ------- | ------------- | ------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| scene-1 | 5,028 s       | ¿Sabías que la IA puede ahorrarte tiempo en tareas cotidianas?                  | 3 FORMAS DE AHORRAR TIEMPO | Marcos giratorios con IA; composición genérica.             | Tipografía escalonada y reloj construido progresivamente. |
| scene-2 | 5,469 s       | Primero, la IA puede responder preguntas rápidamente, como el tiempo o recetas. | 1. RESUELVE DUDAS          | PNG con título y narración duplicados; sin proceso visible. | Pregunta, conexión con IA y respuesta con check.          |
| scene-3 | 5,331 s       | Segundo, puedes usarla para programar recordatorios y listas de tareas.         | 2. ORGANIZA TUS TAREAS     | Misma plantilla y gran área vacía.                          | Tareas dispersas que se alinean y completan.              |
| scene-4 | 4,794 s       | Y tercero, la IA puede analizar datos y generar informes automáticamente.       | 3. PREPARA INFORMES        | Misma plantilla; no representa análisis ni informe.         | Datos que forman barras y se integran en un documento.    |
| scene-5 | 4,146 s       | Prueba estas 3 formas sencillas de ahorrar tiempo con la IA.                    | PRUEBA UNA HOY             | Repite el motivo del hook; escasa sensación de resolución.  | Tres símbolos, conexión, CTA y subrayado final.           |

[Auditoría estructurada, incluidos los captions originales](../.local/phase-1i-v2/source-audit.json).

## Problemas encontrados

En V1, el lector debía procesar encabezado, copia dentro del gráfico y captions a la vez. Las tres ideas compartían una plantilla sin movimiento semántico. Hook y CTA sí tenían movimiento, pero era una rotación decorativa sin relación concreta con el mensaje.

La inspección de V2 detectó una barra sobre el pliegue del documento. Se corrigió la escala y el desplazamiento del gráfico dentro de esta misma V2 antes de entregar. Persisten un arranque pausado del cierre y una primera mitad de la escena de datos con menos ocupación del centro que su resolución final.

## Diseño V2

Se añade `SnapshotScene.presentation`, con cinco layouts de motion seleccionados mediante datos. `applyPresentation` valida un manifiesto estricto, exige el hash del snapshot fuente y un binding por escena, y devuelve una copia con la presentación añadida. Rechaza fuentes obsoletas, bindings duplicados, ausentes o desconocidos y propiedades ajenas a presentación.

No hay condiciones por sceneId en los componentes. Los identificadores solo enlazan los datos editoriales de esta variante con sus escenas. El manifiesto de este Reel está en [presentation.json](../.local/phase-1i-v2/presentation.json); contiene los layouts, títulos y ordinales elegidos manualmente a partir de la auditoría autorizada. No se atribuye esa selección a un modelo.

SceneView selecciona MotionSceneView cuando recibe presentación; Reel conserva sus Sequence y Audio. Es una nueva vista dentro de la misma composición `ReelDemo`, no un segundo renderer. El comando existente `render:production` incorpora `--presentation` y `--output`, acepta una producción ya renderizada para esta variante y no cambia su estado ni sus archivos de preparación. El directorio de salida debe existir dentro de `out`; un MP4 ya existente se rechaza.

LocalGraphicResolver, los PNG originales, VisualAsset, SceneVisualBindings y los contratos anteriores se conservan. No se amplía el resolver de PNG para intentar animar imágenes: el movimiento lo produce Remotion directamente mediante SVG local, geometría y estilos.

## Hook

“3 formas.” y “Ahorrar tiempo.” aparecen por etapas. El reloj ocupa el área central; la aguja avanza y el arco se dibuja hasta aproximadamente el 94 % de la escena. Representa el tiempo y evita el motivo genérico de la V1. El contenido del título se deriva de los datos de presentación.

## Idea 1

Una burbuja con interrogación se acerca al núcleo IA. La conexión se dibuja; después aparece una respuesta con check y líneas sin texto. La pregunta pierde énfasis para trasladar la atención al resultado. Las líneas de respuesta terminan de aparecer hacia el 90 % de la escena. No se simula una aplicación ni se añade una respuesta inventada.

## Idea 2

Tres tareas inclinadas y desplazadas se alinean de manera escalonada; reciben checks sucesivos y aparece un indicador final. Las tarjetas tienen función concreta de tareas, sin encabezados repetidos ni párrafos explicativos. Se conserva el movimiento hasta el cierre de la escena mediante la finalización del conjunto.

## Idea 3

La narración real habla de **analizar datos y generar informes automáticamente**. Por eso la metáfora tiene dos etapas: puntos dispersos que se agrupan en barras, seguidos por un documento que incorpora ese gráfico y unas líneas de informe. Las alturas son ilustrativas, sin cifras, porcentajes ni afirmaciones nuevas. El documento se completa y recibe un check cerca del final.

La versión entregada mantiene las barras dentro del cuerpo de la hoja, separadas del pliegue. La escena tiene un lenguaje distinto del flujo conversacional y de las tareas.

## Cierre

Reaparecen los tres símbolos de las ideas. Una línea los reúne; entran “Prueba” y “una hoy.”, conservando el CTA visual de V1, y el subrayado completa el gesto final. El cierre termina en una composición legible, sin añadir silencio, frames ni otra llamada a la acción. Su primera parte sigue siendo deliberadamente pausada y es uno de los aspectos a valorar con Marcos.

## Motion

Todas las animaciones dependen del frame local y de la duración existente. Se usa progreso acotado con easing suave, desplazamiento, escala, opacidad, aparición escalonada y trazado de líneas. No hay aleatoriedad, fetch, relojes de sistema, glitch ni zooms agresivos.

Los títulos de los tres puntos pasan de 65 a 37 px y suben ligeramente entre el 18 % y el 30 % de cada escena. Permanecen como referencia secundaria. El fondo oscuro y los acentos lima/cian conservan coherencia entre cortes directos. La vista V2 no aplica el fade global de las vistas anteriores; ese cambio es exclusivamente visual y no modifica Sequence, audio ni captions.

## Captions

Se conservan las **18 líneas**, todo su texto y cada inicio/fin de línea y token del snapshot original. No se ejecutó alignment ni preparación de captions para la variante. CaptionLine y su algoritmo no se modifican.

La nueva vista usa el mismo `lineAt`, el tamaño original de 56 px y el color del tema. Presenta el texto con fondo oscuro, peso 750, interlineado 1,35 y posición estable desde y=1455. Sin resaltado por palabra ni animación que retrase entradas o salidas. El área reserva 90 px a la izquierda y 140 px a la derecha; queda separada de los gráficos.

Los timings siguen siendo **ESTIMATED**, como en V1. La conservación exacta no convierte esa estimación en alineación fonética ni en aprobación humana de sincronía.

## Stills

Se renderizaron y abrieron realmente cinco stills a resolución completa, frames 75, 233, 395, 547 y 681. También se extrajeron e inspeccionaron cuatro imágenes de resolución avanzada de los procesos desde el MP4.

| Escena   | Mitad de escena                           | Resultado avanzado                                   | Revisión                                                              |
| -------- | ----------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- |
| Hook     | [scene-1](../out/phase-1i-v2/scene-1.png) | —                                                    | Reloj protagonista; texto y captions separados.                       |
| Dudas    | [scene-2](../out/phase-1i-v2/scene-2.png) | [Respuesta](../out/phase-1i-v2/scene-2-resolved.png) | Un único título; resultado sin copia verbal.                          |
| Tareas   | [scene-3](../out/phase-1i-v2/scene-3.png) | [Orden](../out/phase-1i-v2/scene-3-resolved.png)     | Reorganización visible; checks y captions legibles.                   |
| Informes | [scene-4](../out/phase-1i-v2/scene-4.png) | [Documento](../out/phase-1i-v2/scene-4-resolved.png) | Metáfora específica; composición final más ocupada que la intermedia. |
| Cierre   | [scene-5](../out/phase-1i-v2/scene-5.png) | [Final](../out/phase-1i-v2/scene-5-resolved.png)     | Recapitulación coherente; CTA final de alto contraste.                |

No se observaron recortes de captions ni invasión de su área. Las opacidades bajas de elementos entrantes son transitorias; los captions mantienen contraste constante. No se ha probado una superposición real de los controles de cada red social.

## Revisión vídeo completo

Se decodificó toda la duración de ambos MP4 y se extrajo una secuencia a 10 muestras por segundo. Se inspeccionaron las cinco hojas temporales completas de V2, además de los stills grandes. Las etiquetas de las hojas son aproximadas por el remuestreo; el contrato temporal exacto es el snapshot de 743 frames.

[0–5 s](../.local/phase-1i-v2/timeline-v2-0.jpg) · [5–10 s](../.local/phase-1i-v2/timeline-v2-1.jpg) · [10–15 s](../.local/phase-1i-v2/timeline-v2-2.jpg) · [15–20 s](../.local/phase-1i-v2/timeline-v2-3.jpg) · [20 s–final](../.local/phase-1i-v2/timeline-v2-4.jpg).

La secuencia muestra progreso durante las escenas: reloj, conexión/respuesta, orden/checks, datos/documento y recapitulación/CTA. La respuesta queda casi resuelta durante el tramo final, dando tiempo a leerla; no se prolonga un PNG inmóvil durante todo el ejemplo. Los cortes conservan fondo, paleta y posición de captions.

Hay tramos de baja actividad al presentar el estado inicial, especialmente en datos, y un pequeño vaciado visual al entrar el cierre. No se afirma que esos tramos sean óptimos para retención. La aparición del CTA podría sentirse lenta en reproducción con sonido.

**Límite de la revisión:** se inspeccionó visualmente el recorrido completo mediante secuencias; no hubo reproducción audiovisual con escucha ni prueba en un teléfono. Por tanto, no se certifica que las animaciones acompañen perceptualmente cada inflexión de voz ni que no distraigan a un espectador. Esa valoración queda explícitamente pendiente.

## Comparación V1/V2

| Criterio       | V1 →                                                                     | V2 →                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Texto repetido | Encabezado, título dentro del PNG y narración completa junto a captions. | Un título secundario por idea; visuales sin párrafos; captions como contenido verbal principal.                                         |
| Espacio vacío  | Gran caja central casi vacía bajo unas líneas de texto.                  | Procesos que utilizan el centro; mejora especialmente clara en tareas, respuesta y documento. El arranque de datos aún queda ligero.    |
| Variedad       | Tres PNG con el mismo layout; hook y CTA con el mismo motivo.            | Reloj, flujo de pregunta/respuesta, reorganización, datos/informe y recapitulación.                                                     |
| Movimiento     | Ejemplos estáticos; marcos que giran en los extremos.                    | Movimiento que representa el proceso; desarrollo hasta tramos avanzados de cada escena.                                                 |
| Claridad       | Competencia entre tres copias verbales.                                  | Menor carga de lectura y metáforas distinguibles. Son conceptos ilustrativos, no demostraciones de herramientas reales.                 |
| Ritmo          | Evolución limitada en las tres ideas.                                    | Más acontecimientos visuales y un final definido. Persisten arranques pausados; falta escucha humana para valorar el ritmo audiovisual. |

## Render

Salida: `out/phase-1i-v2/reel-1i-v2-marcos.mp4`. Misma composición Remotion y transporte privado de audio de V1. [Validación del render y FFprobe](../out/phase-1i-v2/render-validation.json).

1080×1920, 30 FPS, H.264/AAC, 743 frames. Vídeo: 24,766667 s, idéntico a V1. Audio original medido: 24,768 s. Se conservan los ajustes existentes de audio codificado y contenedor; no se estira ni recorta la grabación.

El render de variante es reproducible con el comando existente:

```powershell
$revision = Get-Content .local/phase-1i/visual-revision.json -Raw | ConvertFrom-Json
# El directorio de salida debe existir y el MP4 de destino no debe existir.
npm run render:production -- --plan $revision.planPath --presentation .local/phase-1i-v2/presentation.json --output out/phase-1i-v2/reel-1i-v2-marcos.mp4 --stills
```

El archivo entregado ya existe: el comando rechaza sobrescribirlo. La selección del manifiesto está guardada y no requiere generar contenido de nuevo.

## Tests

**154/154 PASS**, cero fallos ni skips. Los 151 anteriores siguen pasando. Se añaden tres pruebas para la abstracción: conservación profunda de todos los campos del snapshot y ausencia de mutación; rechazo de bindings/fuentes/overrides inválidos; progreso temporal acotado y continuo para varias duraciones.

## Validaciones

| Comprobación                                        | Resultado                                                  |
| --------------------------------------------------- | ---------------------------------------------------------- |
| npm ci                                              | PASS, 344 paquetes, caché local, sin descargas de modelos. |
| npm run lint                                        | PASS.                                                      |
| npm run typecheck                                   | PASS.                                                      |
| npm test                                            | PASS, 154 tests.                                           |
| npm run format:check                                | PASS.                                                      |
| npm run build:renderer                              | PASS.                                                      |
| npm run discover                                    | PASS, ReelDemo.                                            |
| Render V2 + FFprobe                                 | PASS, 1080×1920 / 30 / H.264/AAC / 743 frames.             |
| Snapshot fuente contra snapshot V2 sin presentation | Igualdad profunda exacta.                                  |
| AAC extraído de V1 frente a V2                      | Idéntico byte por byte.                                    |
| MP4 V1                                              | SHA-256 original conservado.                               |

`discover` muestra 695 frames porque usa el baseline predeterminado de la composición. El render de producción inyecta el snapshot real y valida sus 743 frames; no se cambió el baseline para maquillar esa diferencia.

Los logs están en `.local/phase-1i-v2/`. Una comprobación preliminar se lanzó antes de que terminara npm ci y encontró temporalmente Zod incompleto; se repitió tras terminar la instalación y pasó. No hubo cambio de dependencias para resolverlo.

## Regresiones

Se compararon por SHA-256 **2419 archivos preexistentes** de código, tests, scripts, documentos, producciones, grabaciones y evidencia V1. Solo cambiaron los tres archivos de implementación previstos: `src/snapshot/types.ts`, `src/composition/SceneView.tsx` y `scripts/render-production.ts`. Los archivos nuevos se listan abajo.

ProductionPlan, PreparedReel, perfiles, originales de grabación, WAV de escena, captions, cortes, manifiestos, VisualAsset, resolver local, TextProvider, Ollama, ComfyUI, VisualDirector y revisión 1H permanecen intactos. Las pruebas existentes de audio y render siguen pasando. La V2 conserva exactamente los inicios/duraciones en frames: **0/151, 151/164, 315/160, 475/144 y 619/124**.

Hash V1 conservado: `ffd92ada164f3aa378e035f6e59e4d521224cc6d3ee9707c0a05a281ecbdcd67`.

[Comparación de archivos](../.local/phase-1i-v2/regressions.json) · [Verificación final, hashes y FFprobe](../.local/phase-1i-v2/verification.json).

## Coste

**0 € API.** Cero imágenes IA, TTS, clonación, vídeo IA, avatar o llamadas a ComfyUI/Ollama. Remotion, SVG, fuente, navegador, FFmpeg y audio locales. npm ci utilizó caché offline.

## Archivos modificados

Tres archivos de producto existentes: `src/snapshot/types.ts`, `src/composition/SceneView.tsx`, `scripts/render-production.ts`.

Cuatro archivos nuevos de implementación y tests: `src/snapshot/motion.ts`, `src/snapshot/presentation.ts`, `src/composition/MotionSceneView.tsx`, `tests/presentation.test.ts`.

Documentación: este informe y actualización de `CONTINUAR-MANANA.md`. Artefactos nuevos en `out/phase-1i-v2/` y evidencias, manifiesto, scripts de auditoría y logs en `.local/phase-1i-v2/`. `build/renderer` fue reconstruido. npm ci recreó node_modules. El primer render de revisión se conserva solo como evidencia privada de trabajo; no es una V3.

## Deuda técnica

La nueva presentación está limitada explícitamente al perfil 1080×1920, a dos o tres elementos y a títulos acotados. Sus tiempos de animación son proporciones de la escena, no alineación semántica a palabras. El catálogo es reutilizable, pero no incorpora planificación automática para futuros guiones. La producción base debe estar resuelta: una presentación no puede saltarse requirements pendientes.

El manifiesto de variante y sus hashes se guardan fuera del ProductionPlan, que se conserva sellado. No se crea una identidad de proyecto nueva ni una UI de edición. La composición final sigue siendo sobria; la escena de datos podría utilizar mejor su espacio inicial y el CTA podría arrancar con más decisión. Se documenta para valoración, sin iniciar otra versión.

## ¿Publicable?

**CLOSE BUT NEEDS POLISH.** La V2 elimina la redundancia de los gráficos, diferencia las cinco escenas y comunica procesos mediante movimiento. Es una mejora visible respecto a V1. No basta para declarar PUBLISHABLE: persisten tramos pausados y falta la revisión audiovisual de Marcos en reproducción normal.

**STOP. Esperar valoración personal de V2. No crear V3, iniciar 1J, publicar, añadir UI ni cambiar la estrategia de voz.**
