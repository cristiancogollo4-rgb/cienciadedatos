# Flujo n8n para Telegram y conteo

Objetivo:

1. Recibir cada prediccion de la app.
2. Mantener conteo acumulado por categoria y estado.
3. Enviar un informe por Telegram.

## 1. Crear bot en Telegram

1. Abrir Telegram.
2. Buscar `@BotFather`.
3. Enviar `/newbot`.
4. Elegir nombre y usuario del bot.
5. Copiar el token entregado por BotFather.

## 2. Obtener chat_id

Para un chat personal:

1. Abrir el bot creado.
2. Enviar cualquier mensaje, por ejemplo `hola`.
3. Abrir en navegador:

```text
https://api.telegram.org/botTU_TOKEN/getUpdates
```

4. Buscar:

```json
"chat": {
  "id": 123456789
}
```

Ese numero es el `chat_id`.

Para un grupo:

1. Crear un grupo de Telegram.
2. Agregar el bot al grupo.
3. Escribir un mensaje en el grupo mencionando o usando el bot, por ejemplo `/start @nombre_del_bot`.
4. Abrir `getUpdates` y copiar el `chat.id` del grupo.

El `chat_id` de un grupo normalmente es negativo. En supergrupos suele tener esta forma:

```text
-1001234567890
```

Si `getUpdates` no muestra mensajes del grupo, desactivar la privacidad del bot en BotFather:

```text
/setprivacy
```

Seleccionar el bot y elegir `Disable`. Luego enviar otro mensaje en el grupo y volver a abrir `getUpdates`.

## 3. Importar plantilla n8n

Importar:

```text
docs/n8n_semillas_telegram_workflow_template.json
```

La plantilla crea:

```text
Webhook prediccion -> Contar semillas -> Responder a la app
Contar semillas -> Preparar chats Telegram -> Enviar Telegram
```

## 4. Configurar nodos

En el nodo `Preparar chats Telegram`, reemplazar:

```text
TU_GROUP_CHAT_ID
```

por el `chat_id` real del grupo.

En el nodo `Enviar Telegram`, reemplazar en la URL:

```text
TU_TELEGRAM_BOT_TOKEN
```

por el token del bot.

La URL debe quedar asi:

```text
https://api.telegram.org/botTOKEN_REAL/sendMessage
```

## 5. Publicar y probar

Publicar el workflow en n8n y probar desde PowerShell:

```powershell
Invoke-RestMethod -Uri "https://independent-remote-flag-profiles.trycloudflare.com/automation/prediction-event" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"prediction":"arroz","confidence":0.91,"margin":0.88,"status":"confiable","filename":"test.jpg","source_type":"manual"}'
```

Debe llegar un informe de Telegram al chat configurado.
