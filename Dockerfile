FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV BACKEND_IOT_ENABLED=false
ENV CLASS_NAMES=arbejas,arroz,frijol,maiz_pira
ENV MODEL_PATH=/app/models/modelo_semillas_best.keras

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY backend ./backend
COPY models/modelo_semillas_best.keras ./models/modelo_semillas_best.keras

EXPOSE 8010

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8010}"]
