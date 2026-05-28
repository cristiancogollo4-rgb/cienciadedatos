# Sistema inteligente de clasificacion de semillas

Proyecto de Ciencia de Datos para clasificar semillas con vision por computador y conectar el resultado con una interfaz web, un prototipo Arduino y automatizaciones en n8n.

El sistema reconoce cuatro clases:

- `arbejas`
- `arroz`
- `frijol`
- `maiz_pira`

## Estado Actual

El proyecto queda limpio para entrega y operacion. Se conservaron solamente los archivos necesarios para ejecutar, desplegar y documentar el sistema:

```text
cienciadedatos/
|-- app.py
|-- backend/
|   |-- main.py
|   |-- README.md
|-- frontend/
|   |-- index.html
|   |-- app.js
|   |-- styles.css
|   |-- config.js
|   |-- README.md
|-- models/
|   |-- modelo_semillas_best.keras
|-- notebooks/
|   |-- 00_diagnostico_fuga_datos.ipynb
|   |-- 01_extraer_frames_originales.ipynb
|   |-- 02_preparar_dataset_limpio.ipynb
|   |-- 03_entrenar_modelo_gpu.ipynb
|   |-- 04_evaluar_modelo.ipynb
|   |-- 05_predecir_imagen.ipynb
|   |-- 06_validacion_externa.ipynb
|-- IOTarduino/
|   |-- IOTarduino.ino
|-- CalibrarServos/
|   |-- CalibrarServos.ino
|-- PruebaTipoServo/
|   |-- PruebaTipoServo.ino
|-- docs/
|   |-- aws_deploy.md
|   |-- aws_ec2_learner_lab.md
|   |-- aws_public_access.md
|   |-- n8n_telegram_workflow.md
|   |-- n8n_semillas_telegram_workflow_template.json
|   |-- n8n_whatsapp_workflow.md
|   |-- n8n_semillas_workflow_template.json
|   |-- arquitectura_iot_prototipo.md
|   |-- blueprint_iot_prototipo.svg
|-- deploy/
|-- Dockerfile
|-- requirements.txt
|-- requirements-prod.txt
|-- requirements-ec2.txt
```

Se eliminaron artefactos pesados o locales: videos originales, datasets generados, `.venv`, `dist`, logs, caches, imagenes temporales y la llave privada `.pem`. Los notebooks se conservan como evidencia del flujo, sin salidas pesadas ni datasets embebidos.

## Resultado Del Modelo

Modelo productivo:

```text
models/modelo_semillas_best.keras
```

Resultado auditado del ultimo entrenamiento:

```text
Test loss: 0.1852
Test accuracy: 1.0000
Clases: ['arbejas', 'arroz', 'frijol', 'maiz_pira']
```

El sistema marca una prediccion como confiable cuando cumple dos condiciones:

```text
min_confidence = 0.70
min_margin = 0.20
```

`min_confidence` es la confianza minima de la clase ganadora. `min_margin` es la diferencia minima entre la clase ganadora y la segunda clase mas probable.

## Fase 1: Ciencia De Datos Y Modelo

Esta fase construye el clasificador de semillas.

### 1. Recoleccion De Datos

Se grabaron videos propios de las semillas y se extrajeron frames para formar el dataset inicial. Las clases trabajadas fueron:

```text
arbejas
arroz
frijol
maiz_pira
```

El objetivo fue que cada clase tuviera imagenes variadas en iluminacion, fondo, posicion y color.

### 2. Limpieza Y Balanceo

Se depuraron imagenes repetidas, borrosas o con mala representacion de la clase. Luego se preparo un dataset balanceado para evitar que el modelo favoreciera clases con mas ejemplos.

Division usada:

```text
train
validation
test
```

El split de test se mantuvo separado para evaluar el modelo con imagenes no vistas durante el entrenamiento.

### 3. Aumentacion De Datos

Se aplico aumentacion para mejorar generalizacion:

- rotaciones pequenas,
- cambios de brillo,
- variaciones de contraste,
- recortes y desplazamientos ligeros,
- ejemplos externos dificiles para reforzar casos donde el modelo se podia confundir.

Los datasets generados no se conservan en esta version limpia del proyecto porque son artefactos pesados. El entregable conserva el modelo final entrenado.

Los notebooks fuente del proceso se conservan en:

```text
notebooks/
```

Para reejecutarlos se deben restaurar los videos y datasets de trabajo indicados en `notebooks/README.md`.

### 4. Entrenamiento

Se entreno con transfer learning usando TensorFlow. La estrategia general fue:

1. cargar una red base preentrenada,
2. adaptar la cabeza de clasificacion a cuatro clases,
3. entrenar la cabeza,
4. hacer fine tuning parcial,
5. evaluar con `validation` y `test`,
6. guardar el mejor modelo como `models/modelo_semillas_best.keras`.

### 5. Evaluacion

La salida del modelo incluye:

- clase predicha,
- confianza,
- margen frente a la segunda clase,
- probabilidades por clase,
- estado `confiable` o `dudosa`.

Esta informacion viaja despues al frontend, Arduino y n8n.

## Fase 2: Aplicacion Local, Backend, Frontend Y Arduino

Esta fase convierte el modelo en una aplicacion usable.

### 1. Crear Entorno Local

Desde la carpeta del proyecto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Levantar Backend

El backend esta en:

```text
backend/main.py
```

Comando local:

```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8010
```

URLs locales:

```text
http://localhost:8010/health
http://localhost:8010/docs
```

Endpoints principales:

| Endpoint | Metodo | Funcion |
|---|---|---|
| `/health` | GET | Estado general del servidor |
| `/classes` | GET | Lista de clases |
| `/predict` | POST | Prediccion desde imagen |
| `/predict-url` | POST | Prediccion desde URL |
| `/prediction-thresholds` | GET/POST | Consultar o cambiar umbrales |
| `/automation/prediction-event` | POST | Enviar evento a n8n |
| `/iot/status` | GET | Estado IoT |
| `/iot/classify` | POST | Enviar clase al Arduino si el backend controla serial |

### 3. Levantar Frontend

El frontend esta en:

```text
frontend/
```

Comando local:

```powershell
python -m http.server 5500 -d frontend
```

Abrir:

```text
http://127.0.0.1:5500
```

Funciones disponibles:

- cargar imagen local,
- usar camara del navegador,
- clasificar frames,
- predecir desde URL,
- ver probabilidades,
- ver historial,
- ajustar umbrales,
- conectar Arduino por Web Serial,
- enviar eventos de prediccion a n8n.

### 4. Configurar URL Del Backend En Frontend

El archivo:

```text
frontend/config.js
```

puede dejarse vacio para usar deteccion automatica o configurarse explicitamente:

```js
window.SEED_API_BASE = "http://localhost:8010";
```

En AWS o Cloudflare se puede usar:

```js
window.SEED_API_BASE = "https://URL_PUBLICA";
```

### 5. Arduino

Sketch principal:

```text
IOTarduino/IOTarduino.ino
```

Comandos enviados por la app:

| Clase IA | Comando Arduino |
|---|---|
| `arroz` | `ARROZ` |
| `frijol` | `FRIJOL` |
| `arbejas` | `ARBEJA` |
| `maiz_pira` | `MAIZ_PIRA` |

En modo cloud, Arduino no se conecta a AWS. El Arduino se conecta por USB al computador donde se abre la pagina web. El navegador envia los comandos usando Web Serial.

Requisitos para Web Serial:

- Chrome o Edge,
- pagina abierta en `localhost` o HTTPS,
- Arduino conectado por USB,
- seleccionar el puerto desde la interfaz.

## Fase 3: Despliegue En AWS Y Acceso Publico

Esta fase publica la API y permite usar la app desde otros equipos.

### 1. Instancia EC2

En AWS Learner Lab se usa una instancia EC2 Ubuntu. Recomendaciones:

- abrir puerto `22` para SSH,
- abrir puerto `8080` para la API,
- usar al menos 32 GiB de almacenamiento,
- mantener `BACKEND_IOT_ENABLED=false` en AWS.

La API corre en:

```text
http://IP_PUBLICA:8080
```

En la configuracion actual se uso una Elastic IP:

```text
34.230.181.169
```

La Elastic IP evita que la IP cambie cada vez que se apaga y enciende la instancia.

### 2. Conectarse Por SSH

La llave `.pem` no debe guardarse dentro del proyecto. Debe mantenerse en una carpeta privada del usuario.

Ejemplo:

```powershell
ssh -i "RUTA_A_TU_LLAVE\semillas.pem" ubuntu@34.230.181.169
```

### 3. Servicio Systemd

El backend queda como servicio:

```bash
sudo systemctl status semillas-api
sudo systemctl restart semillas-api
sudo journalctl -u semillas-api -f
```

Verificacion desde la instancia:

```bash
curl http://127.0.0.1:8080/health
```

Verificacion publica:

```text
http://34.230.181.169:8080/health
http://34.230.181.169:8080/docs
```

### 4. Cloudflare Quick Tunnel

Como camara y Web Serial funcionan mejor con HTTPS, se usa Cloudflare Tunnel para exponer la app con HTTPS temporal.

Arrancar tunel:

```bash
nohup cloudflared tunnel --url http://127.0.0.1:8080 --no-autoupdate > /home/ubuntu/cloudflared.log 2>&1 &
```

Ver URL:

```bash
cat /home/ubuntu/cloudflared.log
```

Verificar que el tunel responde:

```bash
curl https://URL_GENERADA.trycloudflare.com/health
```

La URL tendra forma:

```text
https://algo-algo-algo.trycloudflare.com
```

Si no se tiene acceso SSH a la instancia, se puede levantar el tunel desde Windows apuntando a la IP publica de AWS:

```powershell
$toolsDir = Join-Path (Resolve-Path .).Path ".codex-tools"
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$exe = Join-Path $toolsDir "cloudflared.exe"
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $exe
& $exe tunnel --url http://34.230.181.169:8080 --no-autoupdate
```

En otra terminal, o leyendo la salida del proceso, copiar la URL que aparece en el bloque:

```text
Your quick Tunnel has been created! Visit it at:
https://xxxxx.trycloudflare.com
```

Para verificarla desde Windows:

```powershell
Invoke-WebRequest -Uri "https://xxxxx.trycloudflare.com/health" -UseBasicParsing
```

Importante: esta URL no es fija. Cambia si se reinicia el tunel o la instancia. Para una URL estable con HTTPS se recomienda dominio propio con Cloudflare Tunnel nombrado, Caddy o Nginx con certificado SSL.

### 5. Variables AWS

Variables relevantes del servicio:

```text
BACKEND_IOT_ENABLED=false
CLASS_NAMES=arbejas,arroz,frijol,maiz_pira
MODEL_PATH=models/modelo_semillas_best.keras
CORS_ORIGINS=*
PORT=8080
N8N_WEBHOOK_URL=https://unab-n8n.duckdns.org:5678/webhook/semillas-prediction
```

Despues de editar variables:

```bash
sudo systemctl daemon-reload
sudo systemctl restart semillas-api
```

## Fase 4: Automatizacion Con n8n Y Telegram

Esta fase envia cada prediccion a n8n y genera un informe automatico por Telegram.

### 1. Flujo General

```text
Frontend
  -> Backend AWS /automation/prediction-event
  -> n8n Webhook
  -> Conteo acumulado
  -> Telegram Bot API
  -> Mensaje tipo informe
```

### 2. Plantilla n8n

Plantilla principal con Telegram:

```text
docs/n8n_semillas_telegram_workflow_template.json
```

Guia:

```text
docs/n8n_telegram_workflow.md
```

La plantilla crea:

```text
Webhook prediccion
-> Contar semillas
-> Responder a la app

Contar semillas
-> Preparar chats Telegram
-> Enviar Telegram
```

### 3. Importar En n8n

1. Entrar a n8n.
2. Ir a `Workflows`.
3. Importar `docs/n8n_semillas_telegram_workflow_template.json`.
4. Abrir el nodo `Webhook prediccion`.
5. Verificar:

```text
Method: POST
Path: semillas-prediction
Response: Using Respond to Webhook node
```

6. Copiar la Production URL:

```text
https://unab-n8n.duckdns.org:5678/webhook/semillas-prediction
```

7. Publicar el workflow.

### 4. Configurar Telegram

Se creo el bot:

```text
https://t.me/Clasificador_semillas_unab_bot
```

Para enviar los informes a un grupo de Telegram:

1. agregar el bot al grupo,
2. escribir un mensaje en el grupo mencionando o usando el bot, por ejemplo `/start @Clasificador_semillas_unab_bot`,
3. consultar:

```text
https://api.telegram.org/botTU_TOKEN/getUpdates
```

4. copiar el `chat.id` del grupo y pegarlo en el nodo `Preparar chats Telegram`, reemplazando `TU_GROUP_CHAT_ID`.

Grupo configurado para la demo:

```text
Nombre: Ciencias de datos
chat_id: -4990473268
```

Codigo del nodo `Preparar chats Telegram`:

```javascript
const event = $input.first().json;
const chatIds = [
  '-4990473268'
].filter((chatId) => !chatId.startsWith('TU_'));

return chatIds.map((chatId) => ({
  json: {
    ...event,
    telegram_chat_id: chatId
  }
}));
```

QR del grupo:

![QR del grupo Ciencias de datos](docs/telegram_grupo_qr.png)

El `chat_id` de un grupo normalmente es negativo. En supergrupos suele verse asi:

```text
-1001234567890
```

Si el grupo no aparece en `getUpdates`, abrir BotFather, usar `/setprivacy`, seleccionar el bot y elegir `Disable`. Despues enviar otro mensaje en el grupo y consultar `getUpdates` otra vez.

El token del bot no debe guardarse en el repositorio. En n8n se configura en el nodo `Enviar Telegram`, reemplazando:

```text
TU_TELEGRAM_BOT_TOKEN
```

La URL del nodo debe quedar con esta forma:

```text
https://api.telegram.org/botTOKEN_REAL/sendMessage
```

Despues de una demo, si el token fue compartido o mostrado, se debe regenerar desde BotFather con:

```text
/revoke
```

### 5. Conectar AWS Con n8n

Editar servicio en EC2:

```bash
sudo nano /etc/systemd/system/semillas-api.service
```

Agregar o actualizar:

```text
Environment=N8N_WEBHOOK_URL=https://unab-n8n.duckdns.org:5678/webhook/semillas-prediction
```

Reiniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl restart semillas-api
```

Verificar:

```bash
curl http://127.0.0.1:8080/health
```

Debe aparecer:

```json
"n8n_enabled": true
```

### 6. Prueba Manual

Desde PowerShell:

```powershell
Invoke-RestMethod -Uri "https://URL_CLOUDFLARE/automation/prediction-event" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"prediction":"arroz","confidence":0.91,"margin":0.88,"status":"confiable","filename":"test.jpg","source_type":"manual"}'
```

Respuesta esperada:

```text
enabled: True
sent: True
status_code: 200
```

En Telegram debe llegar un informe similar a:

```text
Informe de clasificacion de semillas

Clase detectada: arroz
Estado: confiable
Confianza: 91.00%
Margen: 88.00%
Origen: manual
Archivo: test.jpg

Conteo acumulado
Total: 1
Arroz: 1
Frijol: 0
Arbejas: 0
Maiz pira: 0

Resumen por estado
Confiables: 1
Dudosas: 0
```

### 7. Prueba Desde La App

1. Abrir la URL HTTPS de Cloudflare.
2. Hacer una prediccion desde imagen o camara.
3. Revisar n8n en `Ejecuciones`.
4. Confirmar llegada del informe en Telegram.

Para que n8n muestre las ejecuciones exitosas:

```text
Workflow settings
Save successful production executions: Save
Save failed production executions: Save
Save manual executions: Save
Save execution progress: Save
```

## Rubrica

| Criterio | Estado |
|---|---|
| Dataset propio | Implementado |
| Dataset balanceado | Implementado |
| Control de fuga entre splits | Implementado |
| Aumentacion de datos | Implementado |
| Transfer learning | Implementado |
| Fine tuning | Implementado |
| Evaluacion con test | Implementado |
| Prediccion externa | Implementado |
| Backend FastAPI | Implementado |
| Frontend web | Implementado |
| Arduino / servos | Implementado |
| AWS EC2 | Implementado |
| IP elastica | Implementado |
| Cloudflare HTTPS temporal | Implementado |
| n8n | Implementado |
| Telegram | Implementado |
| Docker | Preparado |

## Seguridad Y Limpieza

- No versionar `.venv`.
- No versionar datasets generados ni videos crudos.
- No guardar llaves `.pem` dentro del proyecto.
- No guardar tokens de Telegram, WhatsApp, Meta o n8n dentro del repositorio.
- Si un token fue expuesto, regenerarlo.
- Para una entrega reproducible grande, guardar datasets y notebooks en un almacenamiento externo documentado.

## Comandos Rapidos

Backend local:

```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8010
```

Frontend local:

```powershell
python -m http.server 5500 -d frontend
```

Health AWS:

```text
http://34.230.181.169:8080/health
```

Docs AWS:

```text
http://34.230.181.169:8080/docs
```

Reiniciar API en EC2:

```bash
sudo systemctl restart semillas-api
```

Ver Cloudflare actual:

```bash
cat /home/ubuntu/cloudflared.log
```
