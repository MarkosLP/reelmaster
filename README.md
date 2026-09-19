# ReelMaster

**Estado actual: fase 1K entregada, pendiente de valoración audiovisual humana.** El reel con Marcos como presentador está en `out/phase-1k/reel-1k-marcos.mp4` (23,933 s · 1080 × 1920 · 30 fps). No consta aprobación temporal ni final. [Informe 1K](docs/phase-1k-report.md) · [Contrato 1K](docs/presenter-edit-phase-1k.md).

Las secciones siguientes documentan cada fase por separado; las más recientes están al final.

## Imagen IA local · FASE 1F

Arquitectura de imagen IA local preparada; generación real **unavailable**. La auditoría detectó RTX 2060 de 6 GB y ningún runtime/checkpoint de imagen utilizable en las ubicaciones revisadas. No se ha descargado ni instalado ningún modelo. [Auditoría e informe 1F](docs/phase-1f-report.md) · [Contrato 1F](docs/image-phase-1f.md).

Una intención explícita `Imagen IA conceptual: ...` se planifica como generatedImage/unavailable. El sistema explica qué falta y conserva el requirement pendiente. No genera una sustitución ni una demo ficticia.

## Gráficos locales de FASE 1E

Intención visual → política local → VisualPlan → PNG ilustrativo determinista → pipeline de assets 1D. [Contrato 1E](docs/visual-phase-1e.md) · [Informe 1E](docs/phase-1e-report.md).

`production:resolve-visuals -- --production <id>` planifica; añadir `--execute` genera los gráficos compatibles. `demo:graphics -- --technical` prepara la demo editorial independiente con tonos de prueba. Presenter, capturas reales y b-roll permanecen manuales. La resolución visual no requiere Ollama.

## Recursos visuales de FASE 1D

Recursos visuales locales asignados manualmente → escenas resueltas → render privado. [Contrato 1D](docs/visual-phase-1d.md) · [Informe 1D](docs/phase-1d-report.md).

Disponibles: `production:assets`, `production:assign-asset`, `production:status` y `demo:visual -- --technical`. La producción principal sigue esperando su narración y cinco recursos reales. La demo técnica independiente ya está renderizada con imagen, vídeo, captura simulada y texto.

## Preparación y narración de FASE 1C

ReelDraft → ProductionPlan y guion de grabación → importación privada de narración revisada → PreparedReel. [Contrato 1C](docs/production-phase-1c.md) · [Informe 1C](docs/phase-1c-report.md).

```powershell
npm run prepare:production -- --draft .local/generated/654ce19c402e9b76-21c2cb110e118dbe-1789108461701.json
```

La demo queda en `waitingForNarration`. El directorio `.local/productions/production-<hash>/` contiene `narration.txt`, manifiesto y plan. Después de grabar existen `inspect:narration`, `import:narration` y `render:production`; consulta el contrato para preparar la revisión y los cortes. No se reutiliza VozMarcos para guiones distintos. Visuals pendientes bloquean render; 1D permite resolverlos con archivos locales. No hay TTS ni avatar.

## Generación de contenido de FASE 1B

Idea → guion y plan de escenas con Ollama local → ReelDraft validado. [Contrato 1B](docs/content-phase-1b.md) · [Informe 1B](docs/phase-1b-report.md).

```powershell
npm run generate:reel -- --topic "Explica qué es un agente de IA" --duration 30 --style educational
npm run test:integration:text -- --local
```

Modelo ya instalado, sin descargas. Defaults locales: `http://127.0.0.1:11434`, `qwen2.5:7b-instruct`; variables `REELMASTER_TEXT_ENDPOINT`, `REELMASTER_TEXT_MODEL`, `REELMASTER_TEXT_TIMEOUT_MS`. Resultados en `.local/generated/`, borradores sin audio nuevo ni Reel final. La preparación de producción 1C es una operación posterior explícita.

## Demo independiente de FASE 1A

Audio real local de Marcos → WAV normalizado → cinco escenas → tiempos estimados con pausas detectadas → subtítulos → snapshot → MP4. No TTS, APIs, clonación ni avatar.

[Arquitectura](docs/architecture.md) · [Audio y privacidad](docs/audio-phase-1a.md) · [Informe](docs/phase-1a-report.md).

Requisitos: Windows x64, Node 22.19.0, grabación original `VozMarcos.m4a` en `.local/presenters/presenter-marcos/originals/` y navegador de Remotion ya disponible localmente. FASE 1A no descarga modelos ni navegador. Se conserva el navegador instalado en `.local/tools/` para sobrevivir a npm ci. Si falta, el render se detiene.

```powershell
# Esta fase se instaló con el caché existente, sin red:
$env:npm_config_offline='true'
$env:npm_config_audit='false'
$env:npm_config_fund='false'
npm ci
npm run lint
npm run typecheck
npm test
npm run format:check
npm run prepare:marcos
npm run build:renderer
npm run discover
npm run render
```

Salida: `out/marcos/reel-marcos.mp4`, metadatos y cinco capturas. El audio original y todos los derivados permanecen locales. Nunca copiar el audio personal a `public/`: el renderer recibe sus segmentos mediante un servidor temporal en loopback que termina con el render. Los tiempos de palabra son **ESTIMATED**, no forced alignment; no se muestra resaltado por palabra. Ver el informe para limitaciones.

`npm run prepare:marcos` se ejecuta cuando cambia la preparación; editar solo presentación del fixture preparado y renderizar no vuelve a sintetizar/preparar audio. `npm test` sí prepara el fixture para comprobar reproducibilidad. Los scripts de Marcos y tests bloquean conexiones TCP externas en Node.

El baseline sintético 0B se conserva en `src/fixtures/demo.ts`, `npm run audio`, `npm run snapshot` y `npm run render:baseline`. El build utiliza el snapshot sintético como props por defecto, sin bytes personales; el comando render inyecta los datos de Marcos en ejecución. `npm run studio` sigue mostrando el baseline técnico, no un editor ni una ruta pública para Marcos.

La generación 1B no utiliza esta grabación para sus nuevos guiones.

## Imágenes locales · FASE 1G

Integración opcional mediante `ImageGenerationProvider`, con ComfyUI y el checkpoint local ya instalado. [Configuración, API, ciclo de vida y límites](docs/image-phase-1g.md). `test:integration:image -- --real-local` valida una imagen real y `demo:images -- --technical` crea una producción mixta independiente, ambos con `REELMASTER_COMFY_CONFIG` explícito. Los tests normales desactivan esta variable y nunca arrancan el backend real.

## Dirección y revisión editorial · FASE 1H

El flujo optativo `quality:images` crea VisualDirection con Ollama local, construye prompts v2 y mantiene un máximo de dos candidatos por concepto. Una inspección de Codex y una decisión humana final quedan separadas; solo ACCEPT humano permite asignar el asset. `demo:quality -- --technical` exige al menos dos imágenes aceptadas. [Contrato, configuración y comandos](docs/image-phase-1h.md) · [Informe final](docs/phase-1h-report.md).

## Reel con voz real · FASES 1I y 1I-V2

Primer recorrido completo desde la idea hasta un reel con la voz real de Marcos, y una segunda variante visual del mismo reel. Ambas entregadas para valoración humana: **PASS WITH ISSUES** en 1I, **CLOSE BUT NEEDS POLISH** en 1I-v2, con mejora comprobada en redundancia, variedad y evolución visual. [Informe 1I](docs/phase-1i-report.md) · [Informe 1I-V2](docs/phase-1i-v2-report.md).

Salidas en `out/phase-1i/reel-1i-marcos.mp4` y `out/phase-1i-v2/reel-1i-v2-marcos.mp4`.

## Presentador real · FASE 1J

Grabación vertical real → PresenterAsset preparado, con el vídeo copiado sin recodificar y el audio normalizado a −18 LUFS con techo de true peak. No monta un reel ni autoriza su uso editorial: `approvedForMontage` permanece en `false`. [Contrato 1J](docs/presenter-phase-1j.md) · [Informe 1J](docs/phase-1j-report.md).

```powershell
npm run prepare:presenter -- --source .local/presenters/presenter-marcos/originals/VideoSelfie.mp4 --presenter presenter-marcos
```

Originales y preparados viven bajo `.local/presenters/<presenterId>/`, fuera de Git. La aceptación de la receta es técnica y no sustituye una escucha.

## Montaje de presentador · FASE 1K

`PresenterEditPlan` describe cortes conjuntos de audio y vídeo sobre una base de 30 fps; la composición recibe decisiones ya resueltas y no decide qué cortar. Cinco segmentos, veinte captions y tres apoyos producen 718 frames de salida. [Contrato 1K](docs/presenter-edit-phase-1k.md) · [Informe 1K](docs/phase-1k-report.md).

```powershell
npm run render:presenter -- --plan .local/phase-1k/edit-plan.json --video <preparado.mp4> --output .local/phase-1k/work/rendered-silent.mp4
```

Entrada y salida deben quedar dentro de `.local/`, resueltas con `realpath`. El vídeo se sirve al renderer por el servidor privado en loopback con allowlist y hash; al bundle solo se copia la fuente tipográfica pública.

La revisión del texto por una persona **no** convierte sus tiempos en alineación humana: los captions siguen etiquetados `MODEL_ESTIMATED_HUMAN_TEXT`. La verificación registrada cubre decodificación, sincronía, loudness, ausencia de frames negros y correspondencia de captions; la escucha humana sigue pendiente.

## Revisión de montaje

Primera superficie de interfaz. Cierra el paso que 1K dejó abierto: aprobar o rechazar un montaje exigía ver el MP4 por fuera y editar JSON a mano. [Contrato y límites](docs/revision-montaje.md).

```powershell
npm run review:presenter -- --plan .local/phase-1k/edit-plan.json --video out/phase-1k/reel-1k-marcos.mp4
```

Abre una URL de loopback con token; la página muestra el montaje, los cortes con su motivo y los subtítulos, todo navegable. El veredicto se sella en `.local/reviews/<planHash>.json`, atado a los hashes del plan y del vídeo que se miraron.

Es una pantalla de revisión, no un editor: no cambia cortes ni vuelve a renderizar. Y aprobar aquí **no** convierte los tiempos en alineación humana; los captions siguen siendo `MODEL_ESTIMATED_HUMAN_TEXT`.

## Auditoría externa

Revisión independiente del 19/09/2026 y registro de los arreglos aplicados: [auditoría](docs/auditoria-2026-09-19.md) · [arreglos](docs/auditoria-2026-09-19-arreglos.md).
