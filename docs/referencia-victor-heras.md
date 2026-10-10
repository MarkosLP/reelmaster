# Referencia externa — el método de Víctor Heras

Estudio del canal de YouTube [@Victorherasmedia](https://www.youtube.com/@Victorherasmedia)
realizado por Claude (Opus 5) a petición de Marcos el 20/09/2026, para contrastar
las variantes de gancho de este proyecto contra la doctrina de alguien que vive de
hacer crecer cuentas de Instagram.

Este documento **no es doctrina del proyecto**. Es material de fuera, resumido con
su procedencia a la vista, y su único uso legítimo aquí es generar hipótesis que
luego el registro de experimentos tendrá que medir.

## Procedencia

Lo que sostiene cada tipo de afirmación es distinto, y conviene no mezclarlo:

| Dato                         | Procedencia                         | Fiabilidad                                         |
| ---------------------------- | ----------------------------------- | -------------------------------------------------- |
| Número de vídeos, duraciones | Listado público de YouTube (yt-dlp) | Exacto                                             |
| Visitas por vídeo            | Listado público de YouTube          | **Redondeado** por la plataforma (11.000, 337.000) |
| Fechas de publicación        | Listado público, modo aproximado    | **Solo el año es orientativo**                     |
| Lo que dice en sus vídeos    | Subtítulos automáticos de YouTube   | Transcripción automática, con errores de palabra   |
| Sus cifras de resultados     | Se las atribuye él mismo            | **No verificable desde fuera**                     |

Las citas de este documento vienen de subtítulos automáticos: la redacción es
aproximada y se ha limpiado lo justo para que se lean. Están anotadas con el id
del vídeo y la marca de tiempo para que se puedan comprobar.

El corpus queda en `.local/referencias/victor-heras/` —fuera de Git, porque es
contenido de un tercero— con un `manifest.json` que lleva el SHA-256 de cada
archivo de subtítulos.

## El canal en números

183 vídeos, 118.000 suscriptores, 4,7 millones de visitas acumuladas, mediana de
12.000 por vídeo. **No tiene pestaña de shorts: todo es formato largo**, con una
mediana de 24 minutos.

La duración juega a favor, y con fuerza:

| Duración  | n   | Mediana de visitas |
| --------- | --- | ------------------ |
| < 10 min  | 22  | 2.850              |
| 10–30 min | 99  | 11.000             |
| 30–60 min | 53  | 18.000             |
| > 60 min  | 9   | 30.000             |

Sus vídeos de más de una hora rinden diez veces más que los de menos de diez
minutos. Prometer «guía completa» en el título va con una mediana de 44.000, tres
veces y media la global — pero está confundido con la duración, porque las guías
son precisamente los vídeos largos.

Por tema, la mediana se mueve así: marca personal 30.000 (n=8), edición y
storytelling 28.000 (n=8), reels y viralidad 22.000 (n=38), dinero y negocio
9.150 (n=54), entrevistas y vlogs 1.700 (n=3). Enseñar método rinde; enseñarse a
sí mismo, no.

El idioma resulta indiferente: 84 vídeos en español con mediana de 11.500 y 99 en
inglés con 12.000.

Y creció de verdad: mediana de 4.200 en 2023, 14.000 en 2024, 16.000 en 2025. La
subida es real y no un artefacto del tiempo, porque los vídeos viejos han tenido
**más** tiempo para acumular visitas, no menos.

## El método, tal como lo enseña

**Estructura de tres partes**: gancho, contenido, llamada a la acción. Sitúa el
gancho «del segundo 0 al segundo 4». [`FoKMw-A8EBM` 02:22]

**La ventana de decisión es de 0,6 segundos.** Sostiene que el estudio de Google
de los 3 segundos quedó obsoleto y que midiendo con su equipo obtiene entre 0,3 y
0,8 segundos. De ahí deriva una regla del 90/10: el 90 % del esfuerzo va a
convencer a un desconocido dentro de ese primer medio segundo.
[`sckAnDBg--E` 06:46]

**El reparto del esfuerzo de edición**: el 80 % del tiempo en los primeros 5
segundos y el 20 % en los 55 restantes; y dentro de ese 80 %, el 60 % en los **2
primeros segundos**. Su ejemplo: de una hora de edición, 48 minutos para cinco
segundos de vídeo. [`iWfXMu4f-zs` 08:22]

**La única métrica que reconoce es la retención** — que la gente vea el 70, 80 o
90 % del vídeo. Y una estadística que repite: quien pasa de los 5 segundos suele
terminarlo. [`uk6nAbTkkN4` 12:49]

**El error que da por mortal**: hacer un buen gancho y resolver la curiosidad
justo después. Si prometes cómo perder diez kilos y a los seis segundos ya lo has
contado, el vídeo se queda sin razón de ser y nadie llega al final. La respuesta
va al final. [`uk6nAbTkkN4` 16:00–18:00]

**Tipos de gancho.** Afirma tener más de treinta en su metodología y explica dos:
el _contracorriente_, decir algo opuesto a lo que el espectador cree —«los chicos
feos ligan mucho más que los guapos»—, y el _reto_, «el 90 % de las personas no va
a entender esto», para que quiera pertenecer al 10 %. [`uk6nAbTkkN4` 14:38–16:00]

**En edición**: subtítulos presentes durante todo el vídeo sin excepción, «porque
la gente necesita leer»; cortes duros por defecto y transiciones con cuentagotas
para no recargar; y un flujo de corte en Premiere y animación en After Effects.
[`iWfXMu4f-zs` 46:39 y 48:12]

**Sobre el algoritmo** defiende que lo único que decide la viralidad es el RI o
ratio de interés: de la gente a la que Instagram enseña el vídeo, qué proporción
reacciona. Y que conviene bajar el volumen de publicación y subir la calidad.
[`rKGI9U1eR78` 17:28 · `sckAnDBg--E` 06:23]

## Qué dice esto de las variantes de gancho

El contraste con [`out/variants/variants.json`](../out/variants/variants.json) es
directo. Esto es lo que ve alguien en el segundo 0,6, la ventana que él considera
decisiva:

| Variante        | En pantalla a los 0,6 s | Primer corte |
| --------------- | ----------------------- | ------------ |
| gancho-completo | «¿Sabías que la»        | 4,77 s       |
| gancho-corto    | «IA puede ahorrarte»    | 3,63 s       |
| gancho-directo  | «Primero, la IA»        | 4,80 s       |

Las tres muestran tres palabras sin información sobre un plano fijo, **sin un solo
corte**. El primer apoyo visual entra en el segundo 6,6. Donde su reparto pondría
el 60 % del trabajo de edición, los tres montajes no tienen ningún evento.

Hay algo más de fondo. El texto entregado es:

> ¿Sabías que la IA puede ahorrarte tiempo en tareas cotidianas? Primero, la IA
> puede responder preguntas rápidamente, como el tiempo o recetas. Segundo, puedes
> usarla para programar recordatorios y listas de tareas. Y tercero, la IA puede
> analizar datos y generar informes automáticamente. Prueba estas tres formas
> sencillas de ahorrar tiempo con la IA.

El gancho pregunta y la respuesta empieza en el segundo 4,9: es exactamente el
fallo que él nombra, la curiosidad resuelta antes de que haya motivo para
quedarse. El cierre —«prueba estas tres formas»— tampoco pide ninguna acción en la
plataforma: ni seguir, ni comentar, ni abrir un enlace.

Y el experimento tiene un punto ciego que conviene ver antes de medirlo: **las tres
variantes comparten el mismo cuerpo**, así que lo que su marco señala como problema
principal es idéntico en las tres. `trimMontageStart` mide una diferencia real
entre tres entradas, pero serían tres entradas flojas por igual según este criterio.

## Qué hacer con esto

Nada de lo anterior es evidencia. Es la doctrina de un practicante, y sus cifras
—1.300 millones de visitas, 5,7 millones de euros— se las atribuye él sin forma de
comprobarlas; su propio canal tiene una mediana de 12.000 visitas, que está bien
pero no es extraordinaria. El dato de los 0,6 segundos lo presenta como medición y
lo respalda con pruebas hechas a su familia.

Eso no lo invalida: lo convierte en hipótesis, que es lo que
[`reel-experiment.ts`](../src/domain/reel-experiment.ts) sabe manejar. Las tres más
medibles, por orden de choque con lo que hay montado:

1. Que la decisión ocurra antes del primer segundo, cuando ningún montaje actual
   tiene nada que ofrecer ahí.
2. Que resolver la promesa al principio hunda la retención.
3. Que un cierre sin petición desaproveche a quien llegó al final.

Ninguna se decide leyendo esto. Se deciden publicando y apuntando los números, y
el repaso semanal seguirá negándose a concluir con menos de seis medidas.

Queda una tensión que este documento no resuelve porque no le corresponde: rehacer
las variantes ahora reinicia ese recuento.

## Cómo se obtuvo

`yt-dlp` se instaló en el Python del sistema, **fuera del proyecto**, y todo esto
se ejecutó a mano fuera de `npm`. Ningún script del repositorio toca la red, y el
cortafuegos `local-only.mjs` sigue intacto: esta captura no pasó por él y no debe
pasar.

```powershell
python -m pip install yt-dlp
python -m yt_dlp --flat-playlist --dump-single-json --extractor-args "youtubetab:approximate_date" "https://www.youtube.com/@Victorherasmedia/videos"
python -m yt_dlp --skip-download --write-auto-subs --sub-langs "es-orig,en-orig,en" --sub-format vtt --sleep-subtitles 6 --sleep-requests 3 -a seleccion.txt
```

Los diez vídeos transcritos se eligieron por relevancia de título (reel, gancho,
viral, algoritmo, storytelling, edición) y por visitas. YouTube corta con un error
429 si se le piden los subtítulos de golpe; de ahí las esperas.

`vtt.py`, junto al corpus, deshace la repetición en cascada de los subtítulos
automáticos, que de otro modo duplican cada frase y doblan el recuento de palabras.

## Límites

- Es un canal y una metodología. No es una revisión de la literatura ni una
  comparación entre escuelas.
- No se ha visto ni oído ningún vídeo: todo sale de transcripciones automáticas y
  de metadatos públicos. Nada de lo que se afirma aquí sobre su edición procede de
  mirar sus imágenes.
- Las visitas vienen redondeadas por YouTube y las fechas del listado son
  aproximadas, así que las medianas por año valen para ver una tendencia y no para
  afinar.
- El contraste con las variantes compara planes de montaje y huellas
  estructurales, no percepción. Si las entradas funcionan o no, sigue sin saberse.
- Este documento no cambia ningún esquema, ningún plan ni ningún veredicto.
