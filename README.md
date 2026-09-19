# ReelMaster · FASE 1F

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
