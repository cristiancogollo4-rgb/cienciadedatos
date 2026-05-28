# Frontend

Interfaz web para consumir la API del clasificador de semillas.

## Ejecutar

Desde la raiz del proyecto:

```powershell
python -m http.server 5500 -d frontend
```

Abrir:

```text
http://127.0.0.1:5500
```

## Funciones

- Subir imagen local.
- Capturar imagen desde camara en vivo.
- Ejecutar prediccion continua desde camara en vivo.
- Registrar seguimiento en vivo con conteo por clase y eventos detectados.
- Cargar video local y clasificar el frame actual.
- Enviar URL directa de imagen.
- Enviar URL directa de video.
- Ver vista previa de URLs de imagen o video directo cuando el navegador lo permita.
- Ver clase predicha, confianza, margen y probabilidades.
- Mantener historial local de predicciones.
- Conectar el Arduino por USB local desde el navegador con Web Serial.

## Seguimiento en vivo

El seguimiento actual esta pensado para una canaleta o zona de captura donde las semillas pasan una por una frente a la camara. La app toma frames cada pocos segundos, clasifica la imagen completa y registra una semilla cuando la prediccion es confiable.

Si se necesitan varias semillas simultaneas con cajas de deteccion alrededor de cada objeto, se debe entrenar un detector de objetos, por ejemplo YOLO, porque el modelo actual es un clasificador de imagen completa.

## Requisito

El backend debe estar activo, por ejemplo:

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8010
```

## API en produccion

Para AWS o cualquier dominio publico, configura `frontend/config.js`:

```js
window.SEED_API_BASE = "https://api.tu-dominio.com";
```

Si el frontend y el backend viven bajo el mismo dominio, la app usara automaticamente el origen actual.

## Arduino USB local

El Arduino no se controla desde AWS. Se conecta al computador donde se abre la pagina y la app envia comandos usando Web Serial. Esto requiere Chrome o Edge y una pagina servida por HTTPS, o `localhost` para pruebas.
