# Flujo n8n para WhatsApp y conteo

Objetivo:

1. Recibir cada prediccion de la app.
2. Clasificarla por categoria y estado (`confiable` o `dudosa`).
3. Mantener un conteo acumulado por categoria.
4. Enviar un mensaje de WhatsApp por cada prediccion.

## 1. Crear Webhook en n8n

Opcion rapida: importar la plantilla `docs/n8n_semillas_workflow_template.json` desde n8n:

1. Ir a `Workflows`.
2. Elegir `Import from File`.
3. Seleccionar `docs/n8n_semillas_workflow_template.json`.
4. Abrir el nodo `Webhook prediccion`.
5. Copiar la `Production URL`.
6. Abrir el nodo `Enviar WhatsApp`.
7. Reemplazar `TU_PHONE_NUMBER_ID` por el Phone Number ID de Meta.
8. Reemplazar `TU_ACCESS_TOKEN` por el token de acceso de WhatsApp Cloud API.
9. Activar/publicar el workflow.

Opcion manual: crear un workflow nuevo:

1. Agregar nodo `Webhook`.
2. Method: `POST`.
3. Path sugerido: `semillas-prediction`.
4. Response: `Using Respond to Webhook node` si vas a devolver el resultado procesado, o `Respond immediately` si no necesitas respuesta.
5. Copiar la `Production URL`.
6. Activar el workflow cuando este listo.

La app enviara eventos con esta forma:

```json
{
  "project": "clasificador-semillas",
  "prediction": "arroz",
  "confidence": 0.918711,
  "margin": 0.886433,
  "status": "confiable",
  "filename": "camera-frame.jpg",
  "source_type": "camera",
  "client_timestamp": "2026-05-20T16:00:00.000Z",
  "server_timestamp": "2026-05-20T16:00:00Z",
  "probabilities": {
    "arbejas": 0.029789,
    "arroz": 0.918711,
    "frijol": 0.032278,
    "maiz_pira": 0.019222
  }
}
```

## 2. Configurar backend AWS

En EC2 editar el servicio:

```bash
sudo nano /etc/systemd/system/semillas-api.service
```

Agregar estas variables dentro de `[Service]`:

```text
Environment=N8N_WEBHOOK_URL=https://TU-N8N/webhook/semillas-prediction
Environment=N8N_WEBHOOK_SECRET=semillas-demo
```

Si usas n8n local con tunel, la URL normalmente se vera parecida a:

```text
https://TU-N8N/webhook/semillas-prediction
```

Reiniciar:

```bash
sudo systemctl daemon-reload
sudo systemctl restart semillas-api
```

Probar:

```bash
curl http://127.0.0.1:8080/health
```

Debe aparecer:

```json
{
  "n8n_enabled": true
}
```

## 3. Nodo Code para conteo

Agregar un nodo `Code` despues del Webhook con JavaScript:

```js
const event = $input.first().json.body ?? $input.first().json;
const data = $getWorkflowStaticData('global');

if (!data.counts) {
  data.counts = {
    total: 0,
    byCategory: {},
    byStatus: {
      confiable: 0,
      dudosa: 0
    },
    byCategoryAndStatus: {}
  };
}

const category = event.prediction || 'desconocida';
const status = event.status || 'sin_estado';

data.counts.total += 1;
data.counts.byCategory[category] = (data.counts.byCategory[category] || 0) + 1;
data.counts.byStatus[status] = (data.counts.byStatus[status] || 0) + 1;

if (!data.counts.byCategoryAndStatus[category]) {
  data.counts.byCategoryAndStatus[category] = {};
}

data.counts.byCategoryAndStatus[category][status] =
  (data.counts.byCategoryAndStatus[category][status] || 0) + 1;

const confidence = Number(event.confidence || 0);
const margin = Number(event.margin || 0);

const message = [
  'Nueva prediccion de semillas',
  `Clase: ${category}`,
  `Estado: ${status}`,
  `Confianza: ${(confidence * 100).toFixed(2)}%`,
  `Margen: ${(margin * 100).toFixed(2)}%`,
  `Origen: ${event.source_type || 'app'}`,
  '',
  'Conteo acumulado',
  `Total: ${data.counts.total}`,
  `Arroz: ${data.counts.byCategory.arroz || 0}`,
  `Frijol: ${data.counts.byCategory.frijol || 0}`,
  `Arbejas: ${data.counts.byCategory.arbejas || 0}`,
  `Maiz pira: ${data.counts.byCategory.maiz_pira || 0}`,
  '',
  'Por estado',
  `Confiables: ${data.counts.byStatus.confiable || 0}`,
  `Dudosas: ${data.counts.byStatus.dudosa || 0}`
].join('\n');

return [
  {
    json: {
      ...event,
      counts: data.counts,
      whatsapp_message: message
    }
  }
];
```

Nota: el almacenamiento con `workflow static data` es suficiente para demo, pero n8n advierte que no es ideal para alto volumen. Para produccion conviene guardar en Google Sheets, Airtable o una base de datos.

## 4. Nodo WhatsApp

La plantilla incluida ya trae una rama de WhatsApp:

```text
Contar semillas -> Preparar destinatarios -> Enviar WhatsApp
```

El nodo `Preparar destinatarios` envia el informe a:

```text
573160567337
573187950586
```

El nodo `Enviar WhatsApp` usa un `HTTP Request` directo a Meta Graph API. Antes de publicar, reemplazar:

```text
TU_PHONE_NUMBER_ID
TU_ACCESS_TOKEN
```

El cuerpo que se envia a WhatsApp usa:

```js
{
  messaging_product: 'whatsapp',
  to: $json.whatsapp_to,
  type: 'text',
  text: {
    preview_url: false,
    body: $json.whatsapp_message
  }
}
```

Si se prefiere usar el nodo oficial `WhatsApp Business Cloud`, se puede reemplazar el nodo `Enviar WhatsApp` por ese nodo y usar:

```text
Recipient Phone Number: {{$json.whatsapp_to}}
Text: {{$json.whatsapp_message}}
```

## 5. Prueba desde AWS

Cuando `N8N_WEBHOOK_URL` este configurada, cada prediccion hecha en la app debe disparar el flujo.

Tambien puedes probar manualmente desde EC2:

```bash
curl -X POST http://127.0.0.1:8080/automation/prediction-event \
  -H "Content-Type: application/json" \
  -d '{
    "prediction":"arroz",
    "confidence":0.91,
    "margin":0.88,
    "status":"confiable",
    "filename":"test.jpg",
    "source_type":"manual"
  }'
```

## 6. Si no llega WhatsApp

Revisar:

1. El workflow n8n esta activo.
2. Estas usando la `Production URL`, no solo la de test.
3. Las credenciales de WhatsApp Business Cloud estan conectadas.
4. El numero destino esta permitido por la configuracion de Meta/WhatsApp.
5. El servicio en EC2 tiene `N8N_WEBHOOK_URL` y fue reiniciado.
