# Elastic Beanstalk

Contenido usado para armar el ZIP del backend en AWS Elastic Beanstalk.

Variables de entorno recomendadas:

```text
BACKEND_IOT_ENABLED=false
CLASS_NAMES=arbejas,arroz,frijol,maiz_pira
MODEL_PATH=models/modelo_semillas_best.keras
CORS_ORIGINS=https://URL-DEL-FRONTEND
```

Comando del proceso web:

```text
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
