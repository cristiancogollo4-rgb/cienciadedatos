const apiBaseInput = document.querySelector("#apiBase");
const apiStatus = document.querySelector("#apiStatus");
const message = document.querySelector("#message");

const modeButtons = [...document.querySelectorAll(".mode-button")];
const modeSections = [...document.querySelectorAll(".mode-section")];

const imageInput = document.querySelector("#imageInput");
const videoInput = document.querySelector("#videoInput");
const urlInput = document.querySelector("#urlInput");
const urlType = document.querySelector("#urlType");

const predictImageButton = document.querySelector("#predictImageButton");
const startCameraButton = document.querySelector("#startCameraButton");
const cameraSelect = document.querySelector("#cameraSelect");
const refreshCamerasButton = document.querySelector("#refreshCamerasButton");
const switchCameraButton = document.querySelector("#switchCameraButton");
const stopCameraButton = document.querySelector("#stopCameraButton");
const captureCameraButton = document.querySelector("#captureCameraButton");
const liveCameraButton = document.querySelector("#liveCameraButton");
const captureVideoButton = document.querySelector("#captureVideoButton");
const predictUrlButton = document.querySelector("#predictUrlButton");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const resetTrackingButton = document.querySelector("#resetTrackingButton");

const imagePreview = document.querySelector("#imagePreview");
const videoPreview = document.querySelector("#videoPreview");
const cameraPreview = document.querySelector("#cameraPreview");
const emptyPreview = document.querySelector("#emptyPreview");
const frameCanvas = document.querySelector("#frameCanvas");

const predictionLabel = document.querySelector("#predictionLabel");
const statusBadge = document.querySelector("#statusBadge");
const confidenceValue = document.querySelector("#confidenceValue");
const marginValue = document.querySelector("#marginValue");
const probabilitiesBox = document.querySelector("#probabilities");
const minConfidenceInput = document.querySelector("#minConfidence");
const minMarginInput = document.querySelector("#minMargin");
const setThresholdsButton = document.querySelector("#setThresholdsButton");
const iotStatus = document.querySelector("#iotStatus");
const iotPort = document.querySelector("#iotPort");
const connectIotButton = document.querySelector("#connectIotButton");
const disconnectIotButton = document.querySelector("#disconnectIotButton");
const iotMessage = document.querySelector("#iotMessage");
const sg90SpeedInput = document.querySelector("#sg90Speed");
const setSg90SpeedButton = document.querySelector("#setSg90SpeedButton");
const trackingCountsBox = document.querySelector("#trackingCounts");
const trackingEventsBox = document.querySelector("#trackingEvents");
const historyList = document.querySelector("#historyList");

let selectedImageFile = null;
let selectedVideoFile = null;
let cameraStream = null;
let cameraDevices = [];
let preferredFacingMode = "environment";
let liveCameraTimer = null;
let liveCameraRunning = false;
let livePredictionBusy = false;
let history = [];
let trackingCounts = {};
let trackingEvents = [];
let lastTrackedClass = null;
let lastTrackedAt = 0;
let trackedSequence = 0;
let serialPort = null;

const TRACKING_COOLDOWN_MS = 6000;
const TRACKING_MIN_CONFIDENCE = 0.7;
const ARDUINO_BAUD_RATE = 9600;
const ARDUINO_COMMANDS = {
  arroz: "ARROZ",
  frijol: "FRIJOL",
  frijoles: "FRIJOL",
  arbeja: "ARBEJA",
  arbejas: "ARBEJA",
  arveja: "ARBEJA",
  arvejas: "ARBEJA",
  maiz: "MAIZ_PIRA",
  "maiz pira": "MAIZ_PIRA",
  maiz_pira: "MAIZ_PIRA",
  maizpira: "MAIZ_PIRA",
};

function initialApiBase() {
  const configured = (window.SEED_API_BASE || "").trim();
  if (configured) return configured;
  if (window.location.protocol === "file:") return apiBaseInput.dataset.localDefault;
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    return apiBaseInput.dataset.localDefault;
  }
  return window.location.origin;
}

apiBaseInput.value = initialApiBase();

imagePreview.addEventListener("error", () => {
  const activeMode = document.querySelector(".mode-button.active")?.dataset.mode;
  if (activeMode === "url") {
    setMessage("No se pudo mostrar la vista previa. La URL debe apuntar directo a una imagen o el sitio debe permitir verla en el navegador.", true);
  }
});

videoPreview.addEventListener("error", () => {
  const activeMode = document.querySelector(".mode-button.active")?.dataset.mode;
  if (activeMode === "url") {
    setMessage("No se pudo mostrar la vista previa del video. La URL debe apuntar directo a un archivo de video.", true);
  }
});

function apiBase() {
  return apiBaseInput.value.replace(/\/$/, "");
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function commandForPrediction(prediction) {
  const command = ARDUINO_COMMANDS[normalizeLabel(prediction)];
  if (!command) throw new Error(`No hay comando Arduino para la clase: ${prediction}`);
  return command;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setIotMessage(text, isError = false) {
  iotMessage.textContent = text;
  iotMessage.classList.toggle("error", isError);
}

function setBusy(isBusy) {
  document.body.classList.toggle("busy", isBusy);
  [
    predictImageButton,
    startCameraButton,
    refreshCamerasButton,
    switchCameraButton,
    stopCameraButton,
    captureCameraButton,
    liveCameraButton,
    captureVideoButton,
    predictUrlButton,
    connectIotButton,
    disconnectIotButton,
    setSg90SpeedButton,
    setThresholdsButton,
  ].forEach((button) => {
    if (button.dataset.locked === "true") return;
    button.disabled = isBusy || button.disabled;
  });
}

function restoreButtonState() {
  predictImageButton.disabled = !selectedImageFile;
  cameraSelect.disabled = Boolean(cameraStream);
  switchCameraButton.disabled = !navigator.mediaDevices?.getUserMedia;
  stopCameraButton.disabled = !cameraStream;
  captureCameraButton.disabled = !cameraStream;
  liveCameraButton.disabled = !cameraStream;
  liveCameraButton.textContent = liveCameraRunning ? "Detener tiempo real" : "Tiempo real";
  liveCameraButton.classList.toggle("primary-button", liveCameraRunning);
  captureVideoButton.disabled = !selectedVideoFile;
  startCameraButton.disabled = Boolean(cameraStream);
  predictUrlButton.disabled = false;
  connectIotButton.disabled = false;
  disconnectIotButton.disabled = false;
  setSg90SpeedButton.disabled = false;
  setThresholdsButton.disabled = false;
}

function showPreview(kind) {
  imagePreview.hidden = kind !== "image";
  videoPreview.hidden = kind !== "video";
  cameraPreview.hidden = kind !== "camera";
  emptyPreview.hidden = kind !== "empty";
}

function switchMode(mode) {
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  modeSections.forEach((section) => section.classList.toggle("active", section.id === `mode-${mode}`));

  if (mode === "image" && selectedImageFile) showPreview("image");
  else if (mode === "video" && selectedVideoFile) showPreview("video");
  else if (mode === "webcam" && cameraStream) showPreview("camera");
  else showPreview("empty");

  if (mode === "webcam") refreshCameras(false);
}

async function refreshCameras(requestPermission = false) {
  if (!navigator.mediaDevices?.enumerateDevices) return;

  try {
    if (requestPermission) {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      permissionStream.getTracks().forEach((track) => track.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    cameraDevices = devices.filter((device) => device.kind === "videoinput");
    renderCameraOptions();
    if (cameraDevices.length) {
      setMessage(`${cameraDevices.length} camara(s) detectada(s)`);
    }
  } catch (error) {
    setMessage(error.message, true);
  }
}

function preferredCameraId(devices) {
  if (!devices.length) return "";

  const rearTerms = ["back", "rear", "environment", "trasera", "posterior", "back camera"];
  const frontTerms = ["front", "user", "frontal", "delantera", "selfie", "facetime"];
  const rearCamera = devices.find((device) => {
    const label = device.label.toLowerCase();
    return rearTerms.some((term) => label.includes(term));
  });
  if (rearCamera) return rearCamera.deviceId;

  const nonFrontCamera = devices.find((device) => {
    const label = device.label.toLowerCase();
    return label && !frontTerms.some((term) => label.includes(term));
  });
  if (nonFrontCamera) return nonFrontCamera.deviceId;

  return devices[devices.length - 1]?.deviceId || devices[0]?.deviceId || "";
}

function renderCameraOptions() {
  const previousValue = cameraSelect.value;
  cameraSelect.innerHTML = "";

  if (!cameraDevices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = preferredFacingMode === "environment" ? "Camara trasera" : "Camara frontal";
    cameraSelect.appendChild(option);
    return;
  }

  for (const [index, device] of cameraDevices.entries()) {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camara ${index + 1}${index === cameraDevices.length - 1 ? " (probable trasera)" : ""}`;
    cameraSelect.appendChild(option);
  }

  cameraSelect.value =
    cameraDevices.some((device) => device.deviceId === previousValue)
      ? previousValue
      : preferredCameraId(cameraDevices);
}

function selectedCameraConstraints() {
  if (cameraSelect.value) {
    return { deviceId: { exact: cameraSelect.value } };
  }

  return { facingMode: { exact: preferredFacingMode } };
}

async function startCamera() {
  if (!cameraSelect.value) {
    await refreshCameras(false);
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: selectedCameraConstraints(),
      audio: false,
    });
  } catch (error) {
    if (cameraSelect.value) throw error;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: preferredFacingMode } },
      audio: false,
    });
  }
  cameraPreview.srcObject = cameraStream;
  showPreview("camera");
  await refreshCameras(false);
  updateActiveCameraMessage();
}

function stopCamera() {
  stopLiveCamera();
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraPreview.srcObject = null;
  showPreview("empty");
  setMessage("Camara detenida");
  restoreButtonState();
}

async function restartCameraWithFacingMode(facingMode) {
  preferredFacingMode = facingMode;
  cameraSelect.value = "";
  if (cameraStream) stopCamera();
  await startCamera();
}

function activeCameraIndex() {
  const activeDeviceId = cameraStream?.getVideoTracks()[0]?.getSettings?.().deviceId;
  if (!activeDeviceId) return -1;
  return cameraDevices.findIndex((device) => device.deviceId === activeDeviceId);
}

function updateActiveCameraMessage() {
  const track = cameraStream?.getVideoTracks()[0];
  const settings = track?.getSettings?.() || {};
  const activeDevice = cameraDevices.find((device) => device.deviceId === settings.deviceId);
  const label = activeDevice?.label || track?.label || settings.facingMode || "camara activa";
  setMessage(`Camara activa: ${label}`);
}

async function switchToNextCamera() {
  await refreshCameras(false);

  if (cameraDevices.length > 1) {
    const currentIndex = activeCameraIndex();
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameraDevices.length : 0;
    cameraSelect.value = cameraDevices[nextIndex].deviceId;
    if (cameraStream) stopCamera();
    await startCamera();
    return;
  }

  const nextFacingMode = preferredFacingMode === "environment" ? "user" : "environment";
  await restartCameraWithFacingMode(nextFacingMode);
}

function guessUrlType(url) {
  const cleanUrl = url.split("?")[0].toLowerCase();
  if (urlType.value !== "auto") return urlType.value;
  if (/\.(mp4|webm|ogg|mov|m4v)$/.test(cleanUrl)) return "video";
  return "image";
}

function updateUrlPreview() {
  const url = urlInput.value.trim();
  if (!url) {
    showPreview("empty");
    return;
  }

  const type = guessUrlType(url);
  if (type === "video") {
    videoPreview.crossOrigin = "anonymous";
    videoPreview.src = url;
    videoPreview.load();
    showPreview("video");
  } else {
    imagePreview.removeAttribute("crossorigin");
    imagePreview.src = url;
    showPreview("image");
  }
}

async function checkApi() {
  try {
    const response = await fetch(`${apiBase()}/health`);
    if (!response.ok) throw new Error("API no disponible");
    const status = await response.json();
    apiStatus.className = "status-dot ok";
    updateThresholdInputs(status.thresholds);
  } catch {
    apiStatus.className = "status-dot error";
  }
}

function updateThresholdInputs(thresholds) {
  if (!thresholds) return;
  minConfidenceInput.value = Number(thresholds.min_confidence).toFixed(2);
  minMarginInput.value = Number(thresholds.min_margin).toFixed(2);
}

async function checkIot() {
  if (!("serial" in navigator)) {
    iotStatus.className = "status-dot error";
    setIotMessage("Web Serial no esta disponible. Usa Chrome o Edge con HTTPS.", true);
    connectIotButton.disabled = true;
    disconnectIotButton.disabled = true;
    setSg90SpeedButton.disabled = true;
    return;
  }

  iotStatus.className = serialPort?.readable || serialPort?.writable ? "status-dot ok" : "status-dot";
  setIotMessage(serialPort ? "Arduino conectado por USB local" : "Selecciona el Arduino conectado a este equipo");
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function renderProbabilities(probabilities) {
  probabilitiesBox.innerHTML = "";
  const entries = Object.entries(probabilities || {}).sort((a, b) => b[1] - a[1]);

  for (const [label, value] of entries) {
    const row = document.createElement("div");
    row.className = "prob-row";
    row.innerHTML = `
      <div class="prob-top">
        <span>${label}</span>
        <span>${percent(value)}</span>
      </div>
      <div class="prob-track">
        <div class="prob-fill" style="width: ${Math.max(0, Math.min(100, value * 100))}%"></div>
      </div>
    `;
    probabilitiesBox.appendChild(row);
  }
}

function renderHistory() {
  historyList.innerHTML = "";
  for (const item of history) {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <strong>${item.prediction}</strong>
      <span>${percent(item.confidence)}</span>
      <span>${item.filename}</span>
      <span>${item.status}</span>
    `;
    historyList.appendChild(row);
  }
}

function ensureTrackingClasses(probabilities = {}) {
  for (const label of Object.keys(probabilities)) {
    if (!(label in trackingCounts)) trackingCounts[label] = 0;
  }
}

function renderTracking() {
  const entries = Object.entries(trackingCounts);
  trackingCountsBox.innerHTML = entries.length
    ? ""
    : '<div class="tracking-empty">Sin semillas registradas</div>';

  for (const [label, count] of entries) {
    const item = document.createElement("div");
    item.className = "tracking-count";
    item.innerHTML = `<span>${label}</span><strong>${count}</strong>`;
    trackingCountsBox.appendChild(item);
  }

  trackingEventsBox.innerHTML = "";
  for (const event of trackingEvents) {
    const row = document.createElement("div");
    row.className = "tracking-event";
    row.innerHTML = `
      <strong>#${event.id} ${event.prediction}</strong>
      <span>${percent(event.confidence)} · ${event.time}</span>
    `;
    trackingEventsBox.appendChild(row);
  }
}

function registerTrackedSeed(result) {
  ensureTrackingClasses(result.probabilities);

  const now = Date.now();
  const isConfident = result.status === "confiable" && result.confidence >= TRACKING_MIN_CONFIDENCE;
  const canRegister =
    isConfident &&
    (result.prediction !== lastTrackedClass || now - lastTrackedAt >= TRACKING_COOLDOWN_MS);

  if (!canRegister) {
    renderTracking();
    return false;
  }

  trackedSequence += 1;
  trackingCounts[result.prediction] = (trackingCounts[result.prediction] || 0) + 1;
  lastTrackedClass = result.prediction;
  lastTrackedAt = now;
  trackingEvents = [
    {
      id: trackedSequence,
      prediction: result.prediction,
      confidence: result.confidence,
      time: new Date(now).toLocaleTimeString(),
    },
    ...trackingEvents,
  ].slice(0, 12);
  renderTracking();
  return true;
}

function renderResult(result) {
  predictionLabel.textContent = result.prediction || "Sin prediccion";
  statusBadge.textContent = result.status || "pendiente";
  statusBadge.className = `badge ${result.status || ""}`;
  confidenceValue.textContent = percent(result.confidence);
  marginValue.textContent = percent(result.margin);
  updateThresholdInputs(result.thresholds);
  renderProbabilities(result.probabilities);
  ensureTrackingClasses(result.probabilities);
  renderTracking();

  history = [result, ...history].slice(0, 20);
  renderHistory();
  notifyPredictionAutomation(result).catch((error) => {
    console.warn("No se pudo enviar evento a n8n", error);
  });
}

function sourceTypeForResult(result) {
  if (result.source_type) return result.source_type;
  const filename = String(result.filename || "").toLowerCase();
  if (filename.includes("camera-live")) return "camera_live";
  if (filename.includes("camera")) return "camera";
  if (filename.includes("video")) return "video_frame";
  if (filename.startsWith("http://") || filename.startsWith("https://")) return "url";
  return "image_upload";
}

async function notifyPredictionAutomation(result) {
  const response = await fetch(`${apiBase()}/automation/prediction-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: result.filename || null,
      prediction: result.prediction,
      confidence: result.confidence,
      margin: result.margin,
      status: result.status,
      probabilities: result.probabilities || null,
      thresholds: result.thresholds || null,
      source_type: sourceTypeForResult(result),
      client_timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo enviar el evento a n8n.");
  }

  return response.json();
}

async function sendImageBlob(blob, filename = "frame.jpg") {
  const formData = new FormData();
  formData.append("file", blob, filename);

  const response = await fetch(`${apiBase()}/predict`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo predecir la imagen.");
  }

  return response.json();
}

async function sendUrl() {
  const url = urlInput.value.trim();
  if (!url) throw new Error("Ingresa una URL.");

  const response = await fetch(`${apiBase()}/predict-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      media_type: urlType.value,
      use_tta: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo predecir la URL.");
  }

  return response.json();
}

async function connectIot() {
  if (!("serial" in navigator)) {
    throw new Error("Web Serial no esta disponible. Usa Chrome o Edge con HTTPS.");
  }

  serialPort = await navigator.serial.requestPort();
  await serialPort.open({ baudRate: ARDUINO_BAUD_RATE });
  await new Promise((resolve) => window.setTimeout(resolve, 2000));
  await writeArduinoCommand(`SG90_SPEED ${sg90SpeedInput.value}`);
  return { connected: true, port: "USB local" };
}

async function disconnectIot() {
  if (serialPort) {
    await serialPort.close();
    serialPort = null;
  }
  return { connected: false };
}

async function writeArduinoCommand(command) {
  if (!serialPort?.writable) {
    throw new Error("Conecta primero el Arduino USB desde esta pagina.");
  }

  const writer = serialPort.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`));
  } finally {
    writer.releaseLock();
  }
  return { sent: true, command, port: "USB local" };
}

async function setSg90Speed() {
  const speed = Number.parseInt(sg90SpeedInput.value, 10);
  if (!Number.isFinite(speed)) throw new Error("Ingresa una velocidad valida para el SG90.");

  await writeArduinoCommand(`SG90_SPEED ${speed}`);
  return { speed_ms: speed };
}

async function setPredictionThresholds() {
  const minConfidence = Number.parseFloat(minConfidenceInput.value);
  const minMargin = Number.parseFloat(minMarginInput.value);
  if (!Number.isFinite(minConfidence) || !Number.isFinite(minMargin)) {
    throw new Error("Ingresa valores validos entre 0 y 1.");
  }

  const response = await fetch(`${apiBase()}/prediction-thresholds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      min_confidence: minConfidence,
      min_margin: minMargin,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudieron actualizar los umbrales.");
  }

  return response.json();
}

async function sendIotClassification(result) {
  if (result.status !== "confiable") {
    return { sent: false, skipped_reason: "La prediccion no es confiable." };
  }
  if (result.confidence < TRACKING_MIN_CONFIDENCE) {
    return { sent: false, skipped_reason: `La confianza es menor a ${TRACKING_MIN_CONFIDENCE}.` };
  }

  const command = commandForPrediction(result.prediction);
  return writeArduinoCommand(command);
}

function captureFrame(videoElement) {
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;
  if (!width || !height) throw new Error("El video aun no tiene un frame disponible.");

  frameCanvas.width = width;
  frameCanvas.height = height;
  const context = frameCanvas.getContext("2d");
  context.drawImage(videoElement, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    frameCanvas.toBlob((blob) => {
      if (!blob) reject(new Error("No se pudo capturar el frame."));
      else resolve(blob);
    }, "image/jpeg", 0.92);
  });
}

async function runPrediction(task, loadingText) {
  setMessage(loadingText);
  setBusy(true);
  try {
    const result = await task();
    renderResult(result);
    let nextMessage = `Prediccion lista: ${result.prediction} (${percent(result.confidence)})`;
    if (result.status === "confiable") {
      try {
        const iotResult = await sendIotClassification(result);
        if (iotResult.sent) {
          nextMessage += ` - Arduino: ${iotResult.command}`;
          setIotMessage(`Clasificacion enviada a ${iotResult.port}: ${iotResult.command}`);
        } else {
          setIotMessage(iotResult.skipped_reason || "Arduino omitio la clasificacion");
        }
      } catch (error) {
        setIotMessage(error.message, true);
      }
    }
    setMessage(nextMessage);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setBusy(false);
    restoreButtonState();
    checkApi();
    checkIot();
  }
}

async function predictCameraFrame(isLive = false) {
  const blob = await captureFrame(cameraPreview);
  const result = await sendImageBlob(blob, isLive ? "camera-live-frame.jpg" : "camera-frame.jpg");
  renderResult(result);
  return result;
}

async function liveCameraTick() {
  if (!liveCameraRunning || livePredictionBusy || !cameraStream) return;
  livePredictionBusy = true;
  try {
    const result = await predictCameraFrame(true);
    const tracked = registerTrackedSeed(result);
    let suffix = tracked ? " - semilla registrada" : "";
    if (tracked) {
      try {
        const iotResult = await sendIotClassification(result);
        if (iotResult.sent) {
          suffix += ` - Arduino: ${iotResult.command}`;
          setIotMessage(`Clasificacion enviada a ${iotResult.port}: ${iotResult.command}`);
        } else {
          setIotMessage(iotResult.skipped_reason || "Arduino omitio la clasificacion");
        }
      } catch (error) {
        setIotMessage(error.message, true);
      }
    }
    setMessage(`Tiempo real: ${result.prediction} (${percent(result.confidence)})${suffix}`);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    livePredictionBusy = false;
    restoreButtonState();
    checkIot();
  }
}

function startLiveCamera() {
  if (!cameraStream) return;
  liveCameraRunning = true;
  liveCameraTick();
  liveCameraTimer = window.setInterval(liveCameraTick, 2500);
  setMessage("Prediccion en tiempo real activa");
  restoreButtonState();
}

function stopLiveCamera() {
  liveCameraRunning = false;
  if (liveCameraTimer) {
    window.clearInterval(liveCameraTimer);
    liveCameraTimer = null;
  }
  livePredictionBusy = false;
  setMessage("Prediccion en tiempo real detenida");
  restoreButtonState();
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});

imageInput.addEventListener("change", () => {
  selectedImageFile = imageInput.files?.[0] || null;
  predictImageButton.disabled = !selectedImageFile;
  if (!selectedImageFile) return;

  imagePreview.src = URL.createObjectURL(selectedImageFile);
  showPreview("image");
  setMessage(selectedImageFile.name);
});

videoInput.addEventListener("change", () => {
  selectedVideoFile = videoInput.files?.[0] || null;
  captureVideoButton.disabled = !selectedVideoFile;
  if (!selectedVideoFile) return;

  videoPreview.src = URL.createObjectURL(selectedVideoFile);
  videoPreview.load();
  showPreview("video");
  setMessage(selectedVideoFile.name);
});

predictImageButton.addEventListener("click", () => {
  if (!selectedImageFile) return;
  runPrediction(() => sendImageBlob(selectedImageFile, selectedImageFile.name), "Procesando imagen...");
});

startCameraButton.addEventListener("click", async () => {
  try {
    await startCamera();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    restoreButtonState();
  }
});

stopCameraButton.addEventListener("click", () => {
  stopCamera();
});

refreshCamerasButton.addEventListener("click", async () => {
  try {
    await refreshCameras(true);
  } finally {
    restoreButtonState();
  }
});

switchCameraButton.addEventListener("click", async () => {
  try {
    await switchToNextCamera();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    restoreButtonState();
  }
});

cameraSelect.addEventListener("change", async () => {
  if (!cameraStream) return;
  try {
    stopCamera();
    await startCamera();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    restoreButtonState();
  }
});

captureCameraButton.addEventListener("click", () => {
  runPrediction(() => predictCameraFrame(false), "Procesando frame de camara...");
});

liveCameraButton.addEventListener("click", () => {
  if (liveCameraRunning) stopLiveCamera();
  else startLiveCamera();
});

captureVideoButton.addEventListener("click", () => {
  runPrediction(async () => {
    const blob = await captureFrame(videoPreview);
    return sendImageBlob(blob, "video-frame.jpg");
  }, "Procesando frame de video...");
});

predictUrlButton.addEventListener("click", () => {
  updateUrlPreview();
  runPrediction(sendUrl, "Procesando URL...");
});

connectIotButton.addEventListener("click", async () => {
  setIotMessage("Seleccionando Arduino USB...");
  setBusy(true);
  try {
    const result = await connectIot();
    setIotMessage(`Conectado en ${result.port}`);
  } catch (error) {
    setIotMessage(error.message, true);
  } finally {
    setBusy(false);
    restoreButtonState();
    checkIot();
  }
});

disconnectIotButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await disconnectIot();
    setIotMessage("Arduino desconectado");
  } catch (error) {
    setIotMessage(error.message, true);
  } finally {
    setBusy(false);
    restoreButtonState();
    checkIot();
  }
});

setSg90SpeedButton.addEventListener("click", async () => {
  setIotMessage("Ajustando velocidad SG90...");
  setBusy(true);
  try {
    const result = await setSg90Speed();
    sg90SpeedInput.value = result.speed_ms;
    setIotMessage(`SG90 ajustado a ${result.speed_ms} ms/grado`);
  } catch (error) {
    setIotMessage(error.message, true);
  } finally {
    setBusy(false);
    restoreButtonState();
    checkIot();
  }
});

setThresholdsButton.addEventListener("click", async () => {
  setMessage("Actualizando criterio confiable...");
  setBusy(true);
  try {
    const thresholds = await setPredictionThresholds();
    updateThresholdInputs(thresholds);
    setMessage(`Criterio actualizado: confianza ${percent(thresholds.min_confidence)}, margen ${percent(thresholds.min_margin)}`);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setBusy(false);
    restoreButtonState();
    checkApi();
  }
});

urlInput.addEventListener("input", updateUrlPreview);
urlInput.addEventListener("change", updateUrlPreview);
urlType.addEventListener("change", updateUrlPreview);

clearHistoryButton.addEventListener("click", () => {
  history = [];
  renderHistory();
});

resetTrackingButton.addEventListener("click", () => {
  trackingCounts = {};
  trackingEvents = [];
  lastTrackedClass = null;
  lastTrackedAt = 0;
  trackedSequence = 0;
  renderTracking();
  setMessage("Conteo de seguimiento reiniciado");
});

apiBaseInput.addEventListener("change", checkApi);
apiBaseInput.addEventListener("change", checkIot);

restoreButtonState();
showPreview("empty");
renderTracking();
refreshCameras(false);
checkApi();
checkIot();
setInterval(checkApi, 15000);
setInterval(checkIot, 15000);
