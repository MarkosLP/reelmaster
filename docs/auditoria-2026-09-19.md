# Auditoría externa — 19 de septiembre de 2026

Revisión independiente del proyecto realizada por Claude (Opus 5) a petición de
Marcos, sobre el estado entregado por Codex Astra tras la fase 1K. Las puertas de
calidad se ejecutaron en local y el hash del MP4 entregado se recalculó a mano en
lugar de leerlo de `verification.json`.

El estado de cada hallazgo se registra en
[auditoria-2026-09-19-arreglos.md](auditoria-2026-09-19-arreglos.md).

## Veredicto

Es un proyecto **serio y de calidad poco común**. La disciplina de Codex Astra es real, no cosmética: la arquitectura hexagonal no se sostiene por convención sino por reglas de ESLint y tests que leen el propio `.tsx` como texto para verificar que no contiene identificadores prohibidos. Cero `any`, cero `@ts-ignore`, cero `eslint-disable`, un solo `TODO` (y es contenido de fixture, no deuda).

Los problemas que encontré **no son de código**. Son de infraestructura de trabajo y de deriva entre lo documentado y lo entregado.

## Verificaciones ejecutadas

| Puerta                                       | Resultado                                                   |
| -------------------------------------------- | ----------------------------------------------------------- |
| `tsc --noEmit`                               | ✅ exit 0                                                   |
| `eslint .`                                   | ✅ exit 0                                                   |
| `npm test`                                   | ✅ **160/160**, 23,0 s                                      |
| `npm audit`                                  | ✅ 0 vulnerabilidades                                       |
| `prettier --check .`                         | ❌ **falla** en `CONTINUAR-MANANA.md`                       |
| SHA-256 de `out/phase-1k/reel-1k-marcos.mp4` | ✅ `2a69b4bc…e3dd` — **coincide exacto** con lo documentado |

La entrega 1K es auténtica. Verifiqué el hash yo mismo, no me fié del `verification.json`.

## Lo que está bien hecho (no tocar)

**Cuantización temporal.** [compile.ts:16](../src/snapshot/compile.ts#L16) aplica `Q(ms)` a fronteras globales, no a duraciones independientes. Es la forma correcta de evitar deriva acumulada, y mucha gente lo hace mal.

**Postura de privacidad.** Está genuinamente bien diseñada, no es teatro:

- [local-only.mjs](../scripts/local-only.mjs) parchea `net.Socket.prototype.connect` y falla cerrado.
- [private-server.ts](../src/infrastructure/audio/private-server.ts) sirve por loopback con token aleatorio de 24 bytes en la ruta, verificación de hash por archivo, `realpath` + contención relativa, tope de 256 MiB, `nosniff` y allowlist de origen.
- [ollama.ts:44](../src/infrastructure/text/ollama.ts#L44) fija `localhost`→`127.0.0.1` para anular DNS rebinding, rechaza credenciales/path/query, rechaza no-200 (nunca sigue redirecciones), corta a 256 KiB y bloquea modelos `:cloud` y `remote_model`.
- `execFile` en todas partes, nunca `shell: true`; ffmpeg con `-protocol_whitelist file,pipe -nostdin`.
- [import-asset.ts:39](../src/infrastructure/visual/import-asset.ts#L39) hace sniffing por magic bytes y desconfía explícitamente de la extensión, con parser EXIF acotado.

**Honestidad en el etiquetado.** `estimated` vs `forced-alignment`, `MODEL_ESTIMATED_HUMAN_TEXT`, `timingApproval: false`. El proyecto se niega sistemáticamente a sobrevender lo que hace. Eso es raro y hay que preservarlo.

---

## Hallazgos

### 🔴 P0 — No hay control de versiones

**No existe `.git`.** Ni repositorio, ni historial, ni respaldo. Hay 16 fases de trabajo, ~16.700 líneas y 24 documentos viviendo en una carpeta de Descargas. El `.gitignore` está escrito y es correcto, lo que lo hace más llamativo todavía: la intención estaba, el `git init` nunca se ejecutó.

Un borrado accidental se lleva meses de trabajo. Es, con diferencia, el riesgo más grave del proyecto y el más barato de arreglar.

### 🟠 P1 — El script que produjo la entrega 1K no es reproducible

[render-presenter.ts](../scripts/render-presenter.ts) **no está en `package.json`**. Es el único camino al vídeo entregado y hay que invocarlo a mano con `tsx`. Además es el único script de render que **no** carga `--import ./scripts/local-only.mjs`, el cortafuegos de red del proyecto.

Tampoco lo cargan `audio`, `snapshot`, `render:baseline` ni `build:renderer`. Son rutas sintéticas, pero rompen la coherencia de "fallar cerrado".

### 🟠 P1 — `withProductionLock` deja un lock huérfano

[local-files.ts:66](../src/infrastructure/production/local-files.ts#L66): si el proceso muere entre `open(lockPath,"wx")` y el `unlink` del `finally` —un Ctrl-C, un crash de ffmpeg—, el `.operation.lock` queda en disco **para siempre**. Toda operación posterior falla con `BUSY` sin TTL, sin PID, sin timestamp y sin remediación documentada. Hay que saber ir a borrar el archivo a mano.

### 🟠 P1 — `format:check` está en rojo

[CONTINUAR-MANANA.md](../CONTINUAR-MANANA.md) lleva BOM UTF-8 y una diferencia en la línea 22. El README documenta `npm run format:check` como parte de la suite de verificación, así que ahora mismo la afirmación de "todas las puertas en verde" es falsa. Se arregla con `npm run format`.

### 🟡 P2 — `presenter-edit.ts` rompe el contrato "strict"

[architecture.md](architecture.md) dice: _"Todas las entidades son objetos estrictos: se rechazan claves desconocidas"_. [presenter-edit.ts](../src/domain/presenter-edit.ts) tiene 3 `z.object` y **cero** `.strict()` — las claves desconocidas se descartan en silencio en lugar de rechazarse. Es el archivo de dominio más nuevo: deriva del estándar establecido.

(Los esquemas no-strict de `comfy-image-provider.ts` sí son correctos: parsean una API ajena, ahí la tolerancia es deliberada.)

### 🟡 P2 — El README va tres fases por detrás

Documenta 1A–1H. Entregado: 1I, 1I-v2, 1J y **1K**. El vídeo real, que es el resultado tangible del proyecto, no aparece en el README. En `docs/` hay informes hasta 1i-v2 pero solo contratos (sin informe) para 1J y 1K.

### 🟡 P2 — El motivo `signal` no está implementado

El dominio ofrece `orbit|cards|signal`. [SceneView.tsx:87-90](../src/composition/SceneView.tsx#L87-L90) solo bifurca en `cards`: **`signal` y `orbit` se pintan idénticos**. Y [demo.ts:63](../src/fixtures/demo.ts#L63) usa los tres, así que la demo muestra dos escenas visualmente iguales creyendo que son distintas.

### 🟡 P2 — Incoherencia wav/mp3

[compile.ts:32](../src/snapshot/compile.ts#L32) acepta `audio/*.{wav,mp3}` y el dominio acepta `audio/mpeg`, pero [private-server.ts:18](../src/infrastructure/audio/private-server.ts#L18) solo permite `.wav`. Un reel con mp3 compila bien y revienta en render con _"Unsafe local media path"_. O es rama muerta o es una trampa latente.

### 🟡 P2 — La capa de composición no tiene tests de render

~1.050 líneas de React sin cobertura automatizada: `MotionSceneView` (589), `PresenterReel` (203), `SceneView` (167), `MediaSceneView` (91). **No hay un solo `renderStill` en toda la suite.** La cobertura actual son reglas de lint, greps sobre el código fuente y tests unitarios de `timing.ts`. Las regresiones visuales solo las detecta un humano mirando.

### 🔵 P3 — Otros

- **Máquina de estados terminal.** [production-plan.ts:202](../src/application/production-plan.ts#L202): `rendered` no tiene aristas de salida y no hay vuelta atrás para regrabar. Iterar sobre un reel exige crear una producción nueva. Puede ser deliberado (procedencia inmutable), pero merece ser una decisión explícita y no un efecto colateral.
- **Heurística de subtítulos fija.** [captions.ts](../src/application/captions.ts): máx. 4 palabras / 26 caracteres, sin ninguna relación con `theme.captionStyle.fontSize` (24–72) ni con la caja de 900 px. A tamaño 72, 26 caracteres se desbordan y nada lo valida.
- **`render-presenter.ts` usa `startsWith(resolve(".local") + "\\")`**: separador Windows escrito a mano y sin `realpath`, mientras `local-files.ts` y `private-server.ts` sí usan `realpath` + `relative`. Un symlink dentro de `.local/` pasaría el filtro aquí.
- **`presenter-index.tsx`** tiene `defaultProps` que el propio esquema rechazaría (`segments: []`, `sourceHash: ""`, `videoUrl: ""`). Solo afecta a `remotion studio`.
- **Rendimiento de `analyzePcm16`**: asigna un array por frame dentro del bucle → ~1,15 M asignaciones para 24 s a 48 kHz. Funciona, pero es la ruta caliente de la preparación.
- **Higiene**: `out/` mezcla restos de la fase 0 (`frame-*.png`, `preview.png`, `reel-demo.mp4`) con los directorios de fase; hay **18 directorios huérfanos** `presenter-test-*` / `recording-path-test-*` en `.local/`; y `scripts/__pycache__/` está en disco.

---

## Dónde puedo ayudar

Lo ordeno por relación valor/riesgo, no por dificultad:

1. **`git init` + commit inicial** — 5 minutos, elimina el único riesgo catastrófico. Empezaría por aquí antes de tocar una línea.
2. **Cerrar las puertas rojas** — `npm run format`, meter `render:presenter` en `package.json` con su `local-only.mjs`, y añadir el guard a los 4 scripts que le faltan.
3. **Lock con recuperación** — PID + timestamp + TTL en `withProductionLock`, y mensaje de error que diga qué archivo borrar.
4. **Tests de render para la composición** — es el hueco de cobertura más grande y el más alineado con el estilo del proyecto: `renderStill` sobre el snapshot de fixture + hash del PNG resultante. Encaja con el determinismo que ya se exige en todo lo demás.
5. **Cerrar las incoherencias pequeñas** — `.strict()` en `presenter-edit.ts`, decidir mp3 (implementarlo o quitarlo del dominio), implementar o eliminar `signal`.
6. **Actualizar README + informes 1J/1K** — el trabajo está hecho, solo falta que se vea.
