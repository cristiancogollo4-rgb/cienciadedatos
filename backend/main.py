from io import BytesIO
import ipaddress
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import time
import unicodedata
from datetime import datetime
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from tensorflow import keras

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    serial = None
    list_ports = None


IMG_SIZE = (224, 224)
DEFAULT_MIN_CONFIDENCE = float(os.getenv("MIN_CONFIDENCE", "0.70"))
DEFAULT_MIN_MARGIN = float(os.getenv("MIN_MARGIN", "0.20"))
MAX_URL_BYTES = 80 * 1024 * 1024
ARDUINO_BAUDRATE = int(os.getenv("ARDUINO_BAUDRATE", "9600"))
ARDUINO_PORT = os.getenv("ARDUINO_PORT")
BACKEND_IOT_ENABLED = os.getenv("BACKEND_IOT_ENABLED", "false").lower() == "true"
IOT_MIN_CONFIDENCE = float(os.getenv("IOT_MIN_CONFIDENCE", str(DEFAULT_MIN_CONFIDENCE)))
SG90_SPEED_MIN_MS = 1
SG90_SPEED_MAX_MS = 40
SG90_SPEED_DEFAULT_MS = int(os.getenv("SG90_SPEED_MS", "8"))
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")
N8N_WEBHOOK_SECRET = os.getenv("N8N_WEBHOOK_SECRET")
N8N_TIMEOUT_SECONDS = float(os.getenv("N8N_TIMEOUT_SECONDS", "8"))

PROJECT_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = Path(os.getenv("MODEL_PATH", PROJECT_DIR / "models" / "modelo_semillas_best.keras"))
DATASET_DIR = Path(os.getenv("DATASET_DIR", PROJECT_DIR / "dataset_clean"))
FRONTEND_DIR = Path(os.getenv("FRONTEND_DIR", PROJECT_DIR / "frontend"))
DEFAULT_CLASS_NAMES = ["arbejas", "arroz", "frijol", "maiz_pira"]
CLASS_NAMES_ENV = os.getenv("CLASS_NAMES")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app = FastAPI(
    title="API Clasificador de Semillas",
    description="API REST para clasificar semillas usando el modelo entrenado del proyecto.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
class_names = []
loaded_model_path = None
loaded_model_mtime = None
iot_serial = None
iot_last_error = None
iot_lock = threading.Lock()

ARDUINO_COMMANDS = {
    "arroz": "ARROZ",
    "frijol": "FRIJOL",
    "frijoles": "FRIJOL",
    "arbeja": "ARBEJA",
    "arbejas": "ARBEJA",
    "arveja": "ARBEJA",
    "arvejas": "ARBEJA",
    "maiz": "MAIZ_PIRA",
    "maiz pira": "MAIZ_PIRA",
    "maiz_pira": "MAIZ_PIRA",
    "maizpira": "MAIZ_PIRA",
}


class UrlPredictionRequest(BaseModel):
    url: str
    media_type: str = "auto"
    use_tta: bool = True
    send_to_iot: bool = False


class IotClassificationRequest(BaseModel):
    prediction: str
    confidence: float | None = None
    status: str | None = None
    force: bool = False


class Sg90SpeedRequest(BaseModel):
    speed_ms: int


class ThresholdsRequest(BaseModel):
    min_confidence: float
    min_margin: float


class PredictionEventRequest(BaseModel):
    filename: str | None = None
    prediction: str
    confidence: float
    margin: float | None = None
    status: str
    probabilities: dict[str, float] | None = None
    thresholds: dict[str, float] | None = None
    source_type: str | None = None
    client_timestamp: str | None = None
    user_agent: str | None = None


def normalize_label(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().lower())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def command_for_prediction(prediction: str) -> str:
    label = normalize_label(prediction)
    command = ARDUINO_COMMANDS.get(label)
    if not command:
        raise HTTPException(status_code=400, detail=f"No hay comando Arduino para la clase: {prediction}")
    return command


def available_arduino_ports() -> list[dict]:
    if list_ports is None:
        return []

    return [
        {
            "device": port.device,
            "description": port.description,
            "manufacturer": port.manufacturer,
        }
        for port in list_ports.comports()
    ]


def autodetect_arduino_port() -> str | None:
    ports = available_arduino_ports()
    preferred_terms = ("arduino", "ch340", "wch", "usb serial", "usb-serial")

    for port in ports:
        haystack = f"{port.get('description') or ''} {port.get('manufacturer') or ''}".lower()
        if any(term in haystack for term in preferred_terms):
            return port["device"]

    return ports[0]["device"] if len(ports) == 1 else None


def connected_iot_port() -> str | None:
    return iot_serial.port if iot_serial is not None and iot_serial.is_open else None


def connect_arduino(port: str | None = None):
    global iot_serial, iot_last_error

    if not BACKEND_IOT_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="IoT serial del backend deshabilitado. En AWS usa Web Serial desde el navegador.",
        )

    if serial is None:
        raise HTTPException(
            status_code=503,
            detail="pyserial no esta instalado. Ejecuta: pip install -r requirements.txt",
        )

    selected_port = port or ARDUINO_PORT or connected_iot_port() or autodetect_arduino_port()
    if not selected_port:
        raise HTTPException(
            status_code=400,
            detail="No se pudo detectar Arduino. Define ARDUINO_PORT, por ejemplo: $env:ARDUINO_PORT='COM3'",
        )

    if iot_serial is not None and iot_serial.is_open and iot_serial.port == selected_port:
        return iot_serial

    if iot_serial is not None and iot_serial.is_open:
        iot_serial.close()

    try:
        iot_serial = serial.Serial(
            selected_port,
            ARDUINO_BAUDRATE,
            timeout=2,
            write_timeout=2,
        )
        time.sleep(2)
        iot_last_error = None
        return iot_serial
    except serial.SerialException as error:
        iot_last_error = str(error)
        raise HTTPException(status_code=503, detail=f"No se pudo abrir el puerto Arduino {selected_port}: {error}") from error


def disconnect_arduino() -> None:
    global iot_serial
    if iot_serial is not None and iot_serial.is_open:
        iot_serial.close()
    iot_serial = None


def send_arduino_command(command: str) -> dict:
    global iot_last_error

    with iot_lock:
        try:
            connection = connect_arduino()
            connection.reset_input_buffer()
            connection.write(f"{command}\n".encode("utf-8"))
            connection.flush()
            response = connection.readline().decode("utf-8", errors="ignore").strip()
            iot_last_error = None
            return {
                "sent": True,
                "command": command,
                "port": connection.port,
                "response": response,
            }
        except HTTPException:
            raise
        except Exception as error:
            iot_last_error = str(error)
            disconnect_arduino()
            raise HTTPException(status_code=503, detail=f"No se pudo enviar comando a Arduino: {error}") from error


sg90_speed_ms = max(SG90_SPEED_MIN_MS, min(SG90_SPEED_MAX_MS, SG90_SPEED_DEFAULT_MS))
prediction_min_confidence = max(0.0, min(1.0, DEFAULT_MIN_CONFIDENCE))
prediction_min_margin = max(0.0, min(1.0, DEFAULT_MIN_MARGIN))


def set_sg90_speed(speed_ms: int) -> dict:
    global sg90_speed_ms

    sg90_speed_ms = max(SG90_SPEED_MIN_MS, min(SG90_SPEED_MAX_MS, int(speed_ms)))
    result = send_arduino_command(f"SG90_SPEED {sg90_speed_ms}")
    result["speed_ms"] = sg90_speed_ms
    return result


def current_thresholds() -> dict:
    return {
        "min_confidence": round(prediction_min_confidence, 6),
        "min_margin": round(prediction_min_margin, 6),
    }


def set_prediction_thresholds(min_confidence: float, min_margin: float) -> dict:
    global prediction_min_confidence, prediction_min_margin

    if not 0 <= min_confidence <= 1:
        raise HTTPException(status_code=400, detail="min_confidence debe estar entre 0 y 1.")
    if not 0 <= min_margin <= 1:
        raise HTTPException(status_code=400, detail="min_margin debe estar entre 0 y 1.")

    prediction_min_confidence = float(min_confidence)
    prediction_min_margin = float(min_margin)
    return current_thresholds()


def forward_prediction_to_n8n(payload: PredictionEventRequest) -> dict:
    if not N8N_WEBHOOK_URL:
        return {"enabled": False, "sent": False}

    event = payload.model_dump()
    event["server_timestamp"] = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    event["project"] = "clasificador-semillas"

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "clasificador-semillas-api/1.0",
    }
    if N8N_WEBHOOK_SECRET:
        headers["X-Seed-Webhook-Secret"] = N8N_WEBHOOK_SECRET

    request = Request(
        N8N_WEBHOOK_URL,
        data=json.dumps(event).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=N8N_TIMEOUT_SECONDS) as response:
            response_body = response.read(1024).decode("utf-8", errors="ignore")
            return {
                "enabled": True,
                "sent": True,
                "status_code": response.status,
                "response": response_body,
            }
    except HTTPError as error:
        detail = error.read(1024).decode("utf-8", errors="ignore")
        raise HTTPException(
            status_code=502,
            detail=f"n8n rechazo el evento: HTTP {error.code} {detail}",
        ) from error
    except URLError as error:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con n8n: {error}") from error


def classify_with_iot(payload: IotClassificationRequest) -> dict:
    if not payload.force:
        if payload.status and normalize_label(payload.status) != "confiable":
            return {
                "sent": False,
                "skipped_reason": "La prediccion no es confiable.",
                "prediction": payload.prediction,
            }

        if payload.confidence is not None and payload.confidence < IOT_MIN_CONFIDENCE:
            return {
                "sent": False,
                "skipped_reason": f"La confianza es menor a {IOT_MIN_CONFIDENCE:.2f}.",
                "prediction": payload.prediction,
            }

    command = command_for_prediction(payload.prediction)
    result = send_arduino_command(command)
    result["prediction"] = payload.prediction
    return result


def load_class_names() -> list[str]:
    if CLASS_NAMES_ENV:
        names = [name.strip() for name in CLASS_NAMES_ENV.split(",") if name.strip()]
        if names:
            return names

    train_dir = DATASET_DIR / "train"
    if train_dir.exists():
        names = sorted(path.name for path in train_dir.iterdir() if path.is_dir())
        if names:
            return names

    names = DEFAULT_CLASS_NAMES
    return names


def load_model_once():
    global model, class_names, loaded_model_path, loaded_model_mtime
    if model is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"No existe el modelo: {MODEL_PATH}")
        class_names = load_class_names()
        model = keras.models.load_model(MODEL_PATH)
        loaded_model_path = str(MODEL_PATH)
        loaded_model_mtime = MODEL_PATH.stat().st_mtime
    return model


def timestamp_or_none(value: float | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value).isoformat(timespec="seconds")


def square_crop(image: Image.Image, scale: float = 1.0) -> Image.Image:
    width, height = image.size
    side = int(min(width, height) * scale)
    left = (width - side) / 2
    top = (height - side) / 2
    return image.crop((left, top, left + side, top + side)).resize(IMG_SIZE)


def read_image(contents: bytes) -> Image.Image:
    try:
        return Image.open(BytesIO(contents)).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen valida.") from error


def validate_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="La URL debe iniciar con http:// o https://.")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="La URL no tiene un host valido.")

    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or None, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise HTTPException(status_code=400, detail=f"No se pudo resolver el host de la URL: {error}") from error

    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise HTTPException(status_code=400, detail="La URL debe apuntar a un host publico.")


def download_url(url: str) -> tuple[bytes, str]:
    validate_public_url(url)

    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=30) as response:
            content_type = response.headers.get_content_type()
            chunks = []
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_URL_BYTES:
                    raise HTTPException(status_code=413, detail="El archivo remoto es demasiado grande.")
                chunks.append(chunk)
    except HTTPException:
        raise
    except URLError as error:
        raise HTTPException(status_code=400, detail=f"No se pudo descargar la URL: {error}") from error

    return b"".join(chunks), content_type


def read_video_frame(contents: bytes) -> Image.Image:
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_file:
        temp_path = temp_file.name
        temp_file.write(contents)

    try:
        capture = cv2.VideoCapture(temp_path)
        if not capture.isOpened():
            raise HTTPException(status_code=400, detail="No se pudo abrir el video.")

        frame = None
        for _ in range(30):
            success, current_frame = capture.read()
            if success and current_frame is not None:
                frame = current_frame
                break

        if frame is None:
            raise HTTPException(status_code=400, detail="No se pudo extraer un frame del video.")

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb_frame)
    finally:
        capture.release()
        Path(temp_path).unlink(missing_ok=True)


def predict_probabilities(image: Image.Image, use_tta: bool = True) -> np.ndarray:
    current_model = load_model_once()
    if not use_tta:
        array = np.expand_dims(np.array(square_crop(image), dtype=np.float32), axis=0)
        return current_model.predict(array, verbose=0)[0]

    variants = [
        square_crop(image, 1.0),
        square_crop(image, 0.88),
        square_crop(image, 0.76),
    ]
    variants.extend([variant.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for variant in variants])
    batch = np.stack([np.array(variant, dtype=np.float32) for variant in variants], axis=0)
    return current_model.predict(batch, verbose=0).mean(axis=0)


def build_prediction_response(probabilities: np.ndarray, filename: str) -> dict:
    order = np.argsort(probabilities)[::-1]
    top_index = int(order[0])
    second_index = int(order[1])
    confidence = float(probabilities[top_index])
    margin = float(probabilities[top_index] - probabilities[second_index])
    status = (
        "confiable"
        if confidence >= prediction_min_confidence and margin >= prediction_min_margin
        else "dudosa"
    )

    return {
        "filename": filename,
        "prediction": class_names[top_index],
        "confidence": round(confidence, 6),
        "margin": round(margin, 6),
        "status": status,
        "thresholds": current_thresholds(),
        "probabilities": {
            class_names[index]: round(float(probabilities[index]), 6)
            for index in range(len(class_names))
        },
    }


@app.get("/health")
def health():
    model_file_mtime = MODEL_PATH.stat().st_mtime if MODEL_PATH.exists() else None
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "model_file_modified_at": timestamp_or_none(model_file_mtime),
        "loaded_model_path": loaded_model_path,
        "loaded_model_modified_at": timestamp_or_none(loaded_model_mtime),
        "model_file_changed_since_load": (
            model is not None
            and model_file_mtime is not None
            and loaded_model_mtime is not None
            and model_file_mtime != loaded_model_mtime
        ),
        "classes_loaded": bool(class_names),
        "class_names": class_names or load_class_names(),
        "backend_iot_enabled": BACKEND_IOT_ENABLED,
        "iot_mode": "backend_serial" if BACKEND_IOT_ENABLED else "browser_web_serial",
        "n8n_enabled": bool(N8N_WEBHOOK_URL),
        "iot_connected": connected_iot_port() is not None,
        "iot_port": connected_iot_port(),
        "sg90_speed_ms": sg90_speed_ms,
        "thresholds": current_thresholds(),
    }


@app.get("/classes")
def classes():
    names = class_names or load_class_names()
    return {"classes": names}


@app.get("/prediction-thresholds")
def prediction_thresholds():
    return current_thresholds()


@app.post("/prediction-thresholds")
def update_prediction_thresholds(payload: ThresholdsRequest):
    return set_prediction_thresholds(payload.min_confidence, payload.min_margin)


@app.post("/automation/prediction-event")
def prediction_event(payload: PredictionEventRequest):
    return forward_prediction_to_n8n(payload)


@app.get("/iot/status")
def iot_status():
    return {
        "pyserial_installed": serial is not None,
        "connected": connected_iot_port() is not None,
        "port": connected_iot_port(),
        "configured_port": ARDUINO_PORT,
        "baudrate": ARDUINO_BAUDRATE,
        "min_confidence": IOT_MIN_CONFIDENCE,
        "sg90_speed_ms": sg90_speed_ms,
        "sg90_speed_min_ms": SG90_SPEED_MIN_MS,
        "sg90_speed_max_ms": SG90_SPEED_MAX_MS,
        "available_ports": available_arduino_ports(),
        "last_error": iot_last_error,
    }


@app.post("/iot/connect")
def iot_connect(port: str | None = None):
    with iot_lock:
        connection = connect_arduino(port)
        try:
            connection.reset_input_buffer()
            connection.write(f"SG90_SPEED {sg90_speed_ms}\n".encode("utf-8"))
            connection.flush()
            response = connection.readline().decode("utf-8", errors="ignore").strip()
        except Exception as error:
            response = f"No se pudo aplicar velocidad SG90: {error}"
        return {
            "connected": True,
            "port": connection.port,
            "baudrate": ARDUINO_BAUDRATE,
            "sg90_speed_ms": sg90_speed_ms,
            "sg90_response": response,
        }


@app.post("/iot/disconnect")
def iot_disconnect():
    with iot_lock:
        disconnect_arduino()
        return {"connected": False}


@app.post("/iot/classify")
def iot_classify(payload: IotClassificationRequest):
    return classify_with_iot(payload)


@app.post("/iot/sg90-speed")
def iot_sg90_speed(payload: Sg90SpeedRequest):
    return set_sg90_speed(payload.speed_ms)


@app.post("/predict")
async def predict(file: UploadFile = File(...), use_tta: bool = True, send_to_iot: bool = False):
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="La imagen esta vacia.")

    image = read_image(contents)
    probabilities = predict_probabilities(image, use_tta=use_tta)
    response = build_prediction_response(probabilities, file.filename or "imagen")
    if send_to_iot:
        try:
            response["iot"] = classify_with_iot(IotClassificationRequest(**response))
        except HTTPException as error:
            response["iot"] = {"sent": False, "error": error.detail}
    return response


@app.post("/predict-url")
def predict_url(payload: UrlPredictionRequest):
    media_type = payload.media_type.lower()

    if media_type not in {"auto", "image", "video"}:
        raise HTTPException(status_code=400, detail="media_type debe ser auto, image o video.")

    contents, content_type = download_url(payload.url)

    is_video = media_type == "video" or (media_type == "auto" and content_type.startswith("video/"))
    if is_video:
        image = read_video_frame(contents)
    else:
        image = read_image(contents)

    probabilities = predict_probabilities(image, use_tta=payload.use_tta)
    response = build_prediction_response(probabilities, payload.url)
    response["source_type"] = "video_url" if is_video else "image_url"
    response["content_type"] = content_type
    if payload.send_to_iot:
        try:
            response["iot"] = classify_with_iot(IotClassificationRequest(**response))
        except HTTPException as error:
            response["iot"] = {"sent": False, "error": error.detail}
    return response


@app.get("/", include_in_schema=False)
def frontend_index():
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend no encontrado.")
    return FileResponse(index_path)


@app.get("/{frontend_path:path}", include_in_schema=False)
def frontend_asset(frontend_path: str):
    if not frontend_path:
        return frontend_index()

    target = (FRONTEND_DIR / frontend_path).resolve()
    frontend_root = FRONTEND_DIR.resolve()
    if target.is_file() and target.is_relative_to(frontend_root):
        return FileResponse(target)

    raise HTTPException(status_code=404, detail="Archivo no encontrado.")
