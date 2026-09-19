# FASE 1D: recursos visuales locales

ProductionPlan → VisualAssetManifest → asignación manual → PreparedReel → CompositionSnapshot → Remotion. El borrador y sus intenciones editoriales permanecen inmutables. La aplicación resuelve recursos; React recibe únicamente instrucciones resueltas.

## Uso

```powershell
$production = 'production-20d04fb59d4fe97de8787f5c098d5f71e12bc9437479fda169ab662bdd6e27c6'
npm run production:assets -- --production $production
npm run production:status -- --production $production
# Sustituir la ruta por un archivo real existente:
npm run production:assign-asset -- --production $production --requirement visual-scene-1 --file C:/MisFotos/Marcos.jpg --fit contain
```

Los archivos externos deben ser locales. Dentro del proyecto, las entradas deben estar bajo `.local/`. No se admiten URL ni rutas UNC. Cada asignación inspecciona y copia el original; no modifica su ubicación inicial. La narración se importa con el procedimiento revisado de [1C](production-phase-1c.md). Se pueden asignar imágenes antes o después del audio; la duración definitiva de los vídeos se comprueba contra los tiempos medidos al preparar la narración.

## Contratos y estados

`VisualAsset` distingue `image`, `video`, `screenCapture`, `presenterImage` y `presenterVideo`. Incluye origen local, hashes SHA-256, MIME, bytes, dimensiones, orientación, duración, fps, códec, presencia de audio, privacidad y receta versionada de normalización. Los presentadores incluyen `presenterId`; una foto no prueba automáticamente la identidad de la persona: la selección manual es responsabilidad del operador.

`visual-manifest.json` vincula producción y hash del borrador. Contiene requirements, assets, bindings, contador de pendientes y estado `unresolved`/`resolved`. Se genera de forma determinista a partir de los requirements del plan. `textOnly` no genera una obligación visual. Las necesidades son `presenter`, `screenCapture`, `broll` e `image`; sus estados son `missing`, `assigned`, `validated`, `rejected`. `assigned` es transitorio y no habilita render. Un rechazo conserva un código de error y elimina el binding válido previo.

`SceneVisualBinding` vincula escena, requirement y asset. Admite `contain`/`cover`, focal X/Y entre 0 y 1, offset inicial en milisegundos, `muted: true` y `shortVideoPolicy: reject`. Capturas usan `contain` por defecto; otros recursos `cover`. Las imágenes tienen offset cero. B-roll puede ser imagen o vídeo; una captura también puede ser estática o vídeo. Presenter admite fotos y vídeos locales del presentador seleccionado, sin avatar ni sincronización labial.

## Inspección y normalización

Se comprueba firma del archivo independientemente de su extensión, se inspecciona con FFprobe y se decodifica completamente con FFmpeg local. PNG/JPEG/WebP estático → PNG; MP4/MOV con H.264, HEVC, MPEG-4 o ProRes → MP4 H.264, yuv420p, CFR 30 fps, sin audio. PNG pequeño compatible se conserva. Lado máximo del derivado: 1920 píxeles. Rotación de vídeo se aplica a los píxeles y el resultado debe declarar rotación cero.

Límites: 20 MiB para imagen, 200 MiB por archivo, 8192 por dimensión y 33.554.432 píxeles, vídeo entre 100 ms y 120 s, fps hasta 120. Vídeo requiere píxeles cuadrados. EXIF de imagen distinto de orientación normal se rechaza para evitar un encuadre incorrecto; WebP animado no está soportado. Las transformaciones que no produzcan metadatos válidos se rechazan. No hay soporte general para cualquier códec o contenedor.

La política de vídeo corto compara frames disponibles con offset y duración real redondeados al fps del reel. No repite ni congela el vídeo. Si el audio posterior revela que el clip es corto, conserva la narración válida, deja la producción `prepared` y marca ese requirement `rejected`. Corregirlo permite avanzar. El sonido de todos los vídeos se elimina al normalizar y se silencia también en React; la narración conserva su canal independiente.

## Privacidad y render

Los originales copiados quedan en `.local/productions/<id>/visual-assets/originals/`; los derivados en `visual-assets/<hash>.png|mp4`. Todo se marca `publicable: false`, incluyendo fixtures técnicos. No se copia multimedia a `public/` ni al bundle.

Se reutiliza el servidor privado de audio: loopback, token efímero, allowlist, verificación de hashes y rutas reales, MIME correcto, rangos HTTP y límite agregado de 256 MiB. Solo sirve derivados enumerados y audio permitido; los originales no tienen ruta publicada. Se cierra al terminar el render.

Preparación con narración medida y todos los requirements validados → `renderable`. Se sellan hashes del prepared y manifiesto. Asignación posterior al sellado se rechaza. El renderer verifica integridad de archivos y manifiesto antes de renderizar. Recursos pendientes, alterados o clips insuficientes bloquean el render.

Snapshot v1 se amplía aditivamente: visual imagen/vídeo con ruta relativa, fit, focal, offset en frames, silencio y caja segura fija `(90,380,900,1000)`. Usa `local-media-v1`; snapshots tipográficos conservan `typography-v2` y sus hashes previos. `MediaSceneView` utiliza `Img`/`OffthreadVideo`; no inspecciona archivos ni interpreta intenciones. Encabezado y subtítulos quedan fuera de la caja visual.

## Demo técnica

```powershell
npm run demo:visual -- --technical
$demo = Get-Content -Raw .local/phase-1d/technical-demo.json | ConvertFrom-Json
npm run render:production -- --plan $demo.planPath --stills
```

Crea una producción separada: patrón PNG, vídeo de cuatro segundos con rectángulo móvil, captura simulada y escena tipográfica. Narración de prueba: tonos sintéticos con silencios, sin voz humana. Su revisión automatizada es exclusiva del fixture; no sustituye la revisión de grabaciones reales. El índice registra el estado al crear la demo; el plan contiene el estado vigente tras renderizar.

## Límites pendientes

Sin detección de caras, recorte semántico ni comprobación automática de identidad. El focal es manual. No hay limpieza automática de originales de intentos rechazados ni recuperación transaccional de fallos entre escrituras. El servidor carga recursos en memoria con límite agregado. Dependencia del FFmpeg incluido y Windows x64. Avatar, generación automática y servicios externos pertenecen a futuras fases y no están implementados.
