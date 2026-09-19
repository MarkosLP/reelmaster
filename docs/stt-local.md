# STT local experimental

`scripts/stt_local.py` contiene un proveedor local de transcripción en CPU. Remotion no importa Whisper: la salida es JSON con procedencia `LOCAL_STT`, palabras y segmentos con tiempos `MODEL_ESTIMATED`, hash de entrada y revisión humana pendiente.

El proveedor exige rutas bajo `.local/`, modelo disponible y hash de pesos fijado. No descarga modelos durante la inferencia. Utiliza `local_files_only`, variables offline y bloqueo de sockets/DNS Python. Este bloqueo no equivale a aislamiento de red del sistema operativo para bibliotecas nativas.

El entorno aislado y su lock con hashes residen en `.local/tools/stt/`. La instalación, licencias, procedencia, resultados y comprobaciones reales se documentan en el informe privado de `.local/phase-1k-stt/`. No se incluyen transcripts personales en código o documentación pública.

Uso desde la raíz, con rutas locales previamente preparadas:

```powershell
.local/tools/stt/venv/Scripts/python.exe scripts/stt_local.py --source <archivo-privado> --model <directorio-modelo-privado> --output <directorio-nuevo-privado>
.local/tools/stt/venv/Scripts/python.exe tests/stt_local_test.py
```

El directorio de salida debe ser nuevo. El contrato valida texto no vacío, límites temporales, orden de segmentos/palabras y serialización canónica. Los tiempos no son fronteras fonéticas verificadas; pueden abarcar pausas. Los indicadores de probabilidad sirven para orientar revisión, no para aprobar automáticamente palabras. No se continúa al montaje sin la revisión de Marcos.
