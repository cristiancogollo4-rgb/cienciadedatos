# Despliegue EC2 en AWS Learner Lab

Esta guia sigue el mismo enfoque del ejemplo de clase: una instancia EC2 Ubuntu, entorno virtual Python, FastAPI con Uvicorn y puerto publico `8080`.

## 1. Crear instancia EC2

En AWS Learner Lab:

1. Iniciar el laboratorio.
2. Abrir `EC2`.
3. Lanzar una instancia Ubuntu.
4. Tipo recomendado: `t2.large` o similar si esta permitido por la cuenta. TensorFlow puede quedarse corto en `t2.micro`.
5. Almacenamiento recomendado: minimo `32 GiB`.
6. Crear o seleccionar un par de claves `.pem`.
7. En reglas de entrada del Security Group abrir:
   - `SSH` puerto `22`, idealmente solo desde tu IP.
   - `TCP personalizado` puerto `8080`, origen `0.0.0.0/0` para pruebas.

## 2. Subir el proyecto

Desde Windows, en la carpeta del proyecto:

```powershell
scp -i "TU_LLAVE.pem" dist/aws-ec2-manual.zip ubuntu@IP_PUBLICA:/home/ubuntu/
```

En la instancia:

```bash
sudo apt update
sudo apt install -y unzip python3-pip python3-venv libgl1 libglib2.0-0 libgomp1
mkdir -p proyecto
unzip aws-ec2-manual.zip -d proyecto
cd proyecto
```

## 3. Crear entorno e instalar dependencias

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-ec2.txt
```

## 4. Variables de entorno

```bash
export BACKEND_IOT_ENABLED=false
export CLASS_NAMES=arbejas,arroz,frijol,maiz_pira
export MODEL_PATH=models/modelo_semillas_best.keras
export CORS_ORIGINS="*"
export PORT=8080
```

En produccion, cambia `CORS_ORIGINS="*"` por el dominio real del frontend.

## 5. Ejecutar API

```bash
python3 app.py
```

Probar:

```text
http://IP_PUBLICA:8080/health
http://IP_PUBLICA:8080/docs
```

Endpoint principal:

```text
POST http://IP_PUBLICA:8080/predict
```

## 6. Frontend

Antes de publicar el frontend, edita `frontend/config.js`:

```js
window.SEED_API_BASE = "http://IP_PUBLICA:8080";
```

Para pruebas puedes abrir el frontend localmente desde tu computador. El Arduino se conecta al computador donde abras la pagina, no a AWS.

## 7. Mantener el servidor vivo

Para una demo rapida:

```bash
source venv/bin/activate
nohup python3 app.py > server.log 2>&1 &
```

Ver logs:

```bash
tail -f server.log
```

Detener:

```bash
pkill -f "python3 app.py"
```

## Nota sobre Arduino

La instancia EC2 no controla el Arduino. El Arduino se conecta por USB al computador del usuario y el navegador envia comandos con Web Serial. Por eso `BACKEND_IOT_ENABLED` debe quedarse en `false`.
