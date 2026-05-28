# Despliegue en AWS

## Arquitectura

```text
Navegador del usuario
  - Captura imagen / camara / video
  - Recibe prediccion desde AWS
  - Envia comando al Arduino por USB local con Web Serial

AWS
  - Backend FastAPI
  - Modelo Keras
  - Sin conexion fisica al Arduino
```

El Arduino debe estar conectado por USB al computador donde se abre la pagina. El backend en AWS no abre puertos `COM` ni `/dev/tty*`.

## Backend

Construir imagen:

```bash
docker build -t clasificador-semillas-api .
```

Ejecutar localmente como produccion:

```bash
docker run --rm -p 8010:8010 \
  -e CORS_ORIGINS="https://tu-frontend.example.com" \
  clasificador-semillas-api
```

Variables importantes:

| Variable | Uso |
|---|---|
| `PORT` | Puerto que usara el contenedor. Por defecto `8010`. |
| `MODEL_PATH` | Ruta del modelo Keras dentro del contenedor. |
| `CLASS_NAMES` | Orden de clases del modelo. Por defecto `arbejas,arroz,frijol,maiz_pira`. |
| `CORS_ORIGINS` | Dominios permitidos para consumir la API. Usar el dominio real del frontend. |
| `BACKEND_IOT_ENABLED` | Mantener `false` en AWS. |

Servicios recomendados:

- AWS App Runner si quieres un despliegue simple desde contenedor.
- ECS Fargate si quieres mas control.
- EC2 si prefieres administrarlo manualmente.

Lambda no es ideal porque TensorFlow hace el arranque pesado.

## Frontend

Publicar la carpeta `frontend/` como sitio estatico, por ejemplo en S3 + CloudFront.

Editar `frontend/config.js` antes de publicar:

```js
window.SEED_API_BASE = "https://api.tu-dominio.com";
```

Web Serial requiere Chrome o Edge y contexto seguro:

- `https://...` en produccion.
- `http://localhost` para pruebas locales.

## Arduino USB local

1. Abrir la pagina publicada.
2. Conectar el Arduino al computador por USB.
3. Pulsar `Seleccionar` en la seccion Arduino USB local.
4. Elegir el puerto del Arduino en el dialogo del navegador.
5. Ejecutar predicciones. Cuando sean confiables, el navegador enviara el comando serial local.

Comandos enviados:

| Clase | Comando |
|---|---|
| `arroz` | `ARROZ` |
| `frijol` | `FRIJOL` |
| `arbejas` | `ARBEJA` |
| `maiz_pira` | `MAIZ_PIRA` |

## Que no subir

No incluyas datasets, videos ni la carpeta `.venv` en el despliegue. Para inferencia solo hace falta el backend, el frontend y `models/modelo_semillas_best.keras`.
