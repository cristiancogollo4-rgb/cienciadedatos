# Backend FastAPI

API REST para usar el modelo entrenado como servicio.

## Ejecutar localmente

Desde la raiz del proyecto:

```powershell
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8010
```

La conexion Arduino por USB local se hace desde el navegador con Web Serial cuando el backend corre en AWS. El serial del backend queda deshabilitado por defecto.

Para pruebas locales antiguas con Arduino conectado al mismo equipo del backend, habilitalo explicitamente:

```powershell
$env:BACKEND_IOT_ENABLED="true"
$env:ARDUINO_PORT="COM3"
$env:ARDUINO_BAUDRATE="9600"
```

Documentacion interactiva:

```text
http://localhost:8010/docs
```

## Endpoints

### `GET /health`

Verifica que la API este activa y muestra la ruta del modelo.
Este endpoint no fuerza la carga del modelo, para que el servicio pueda arrancar rapido.

### `GET /classes`

Devuelve las clases disponibles:

```json
{
  "classes": ["arbejas", "arroz", "frijol", "maiz_pira"]
}
```

### `GET /iot/status`

Muestra si el serial del backend esta disponible. En AWS debe permanecer deshabilitado porque el Arduino esta conectado al navegador del usuario.

### `POST /iot/connect`

Abre la conexion serial. Si quieres indicar el puerto desde la URL:

```powershell
Invoke-RestMethod -Uri "http://localhost:8010/iot/connect?port=COM3" -Method Post
```

### `POST /iot/disconnect`

Cierra la conexion serial con Arduino.

### `POST /iot/classify`

Envia al Arduino el comando que corresponde a la prediccion del modelo. Solo mueve el sistema si la prediccion es confiable.

```powershell
$body = @{
  prediction = "arroz"
  confidence = 0.91
  status = "confiable"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8010/iot/classify" -Method Post -ContentType "application/json" -Body $body
```

Mapeo usado por el backend:

```text
arroz    -> ARROZ
frijol   -> FRIJOL
arbejas  -> ARBEJA
maiz_pira -> MAIZ_PIRA
```

### `POST /predict`

Recibe una imagen y devuelve la prediccion del modelo.
El modelo se carga automaticamente en la primera prediccion.

Ejemplo con PowerShell:

```powershell
curl.exe -X POST "http://localhost:8010/predict" -F "file=@validacion_internet/arroz.jpg"
```

Para enviar tambien la clasificacion al Arduino desde el mismo endpoint:

```powershell
curl.exe -X POST "http://localhost:8010/predict?send_to_iot=true" -F "file=@validacion_internet/arroz.jpg"
```

Respuesta esperada:

```json
{
  "filename": "arroz.jpg",
  "prediction": "arroz",
  "confidence": 0.7362,
  "margin": 0.6205,
  "status": "confiable",
  "probabilities": {
    "arbejas": 0.1157,
    "arroz": 0.7362,
    "frijol": 0.0772,
    "maiz_pira": 0.0708
  }
}
```

### `POST /predict-url`

Recibe una URL directa de imagen o video. En videos, extrae un frame y lo envia al modelo.

Ejemplo:

```powershell
$body = @{
  url = "https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg?cs=srgb&dl=pexels-polina-tankilevitch-4110251.jpg&fm=jpg"
  media_type = "image"
  use_tta = $true
  send_to_iot = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8010/predict-url" -Method Post -ContentType "application/json" -Body $body
```


## Variables de entorno opcionales

```powershell
$env:MODEL_PATH="C:\ruta\al\modelo.keras"
$env:DATASET_DIR="C:\ruta\al\dataset_clean"
$env:CLASS_NAMES="arbejas,arroz,frijol,maiz_pira"
$env:CORS_ORIGINS="https://tu-frontend.example.com"
$env:BACKEND_IOT_ENABLED="false"
$env:ARDUINO_PORT="COM3"
$env:IOT_MIN_CONFIDENCE="0.70"
```
