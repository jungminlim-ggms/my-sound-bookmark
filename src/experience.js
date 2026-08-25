import QRCode from "qrcode";
import jsQR from "jsqr";
import "./styles.css";
import { playComposition, previewNote, stopPlayback } from "./audio-engine.js";
import { clamp, drawImageCover, getPlayerUrl, loadImageFile, roundedRect, setStatus } from "./common.js";
import {
  INSTRUMENT_NAMES,
  MAX_DURATION_MS,
  MAX_NOTES,
  MIN_NOTES,
  decodeComposition,
  encodeComposition
} from "./music-codec.js";

const panels = [...document.querySelectorAll("[data-step-panel]")];
const stepDots = [...document.querySelectorAll("[data-step-dot]")];
const cameraStage = document.querySelector("#cameraStage");
const cameraVideo = document.querySelector("#cameraVideo");
const photoCanvas = document.querySelector("#photoCanvas");
const photoContext = photoCanvas.getContext("2d");
const cameraPlaceholder = document.querySelector("#cameraPlaceholder");
const startCameraButton = document.querySelector("#startCameraButton");
const captureButton = document.querySelector("#captureButton");
const retakeButton = document.querySelector("#retakeButton");
const photoUpload = document.querySelector("#photoUpload");
const photoStatus = document.querySelector("#photoStatus");
const toMusicButton = document.querySelector("#toMusicButton");

const recordButton = document.querySelector("#recordButton");
const stopButton = document.querySelector("#stopButton");
const listenButton = document.querySelector("#listenButton");
const redoMusicButton = document.querySelector("#redoMusicButton");
const musicKeys = [...document.querySelectorAll(".music-key")];
const noteCount = document.querySelector("#noteCount");
const timeCount = document.querySelector("#timeCount");
const timeProgress = document.querySelector("#timeProgress");
const recordDot = document.querySelector("#recordDot");
const recordState = document.querySelector("#recordState");
const musicStatus = document.querySelector("#musicStatus");
const countdown = document.querySelector("#countdown");
const toResultButton = document.querySelector("#toResultButton");

const resultCanvas = document.querySelector("#resultCanvas");
const resultStatus = document.querySelector("#resultStatus");
const workTitle = document.querySelector("#workTitle");
const applyTitleButton = document.querySelector("#applyTitleButton");
const downloadButton = document.querySelector("#downloadButton");
const printButton = document.querySelector("#printButton");
const verifyButton = document.querySelector("#verifyButton");

let cameraStream;
let photoReady = false;
let composition;
let isRecording = false;
let isCountingDown = false;
let recordingStart = 0;
let recordingEvents = [];
let timerId;
let timeoutId;
let musicQrCanvas;
let currentMusicCode = "";

function selectedInstrument() {
  return Number(document.querySelector('input[name="instrument"]:checked')?.value ?? 0);
}

function showStep(step) {
  panels.forEach((panel) => {
    const active = Number(panel.dataset.stepPanel) === step;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  stepDots.forEach((dot) => {
    const value = Number(dot.dataset.stepDot);
    dot.classList.toggle("is-active", value === step);
    dot.classList.toggle("is-complete", value < step);
    if (value === step) dot.setAttribute("aria-current", "step");
    else dot.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
  }
  cameraVideo.srcObject = null;
  cameraStage.classList.remove("is-live");
  captureButton.hidden = true;
}

async function startCamera() {
  stopCamera();
  setStatus(photoStatus, "카메라 사용 권한을 확인하고 있어요.");
  startCameraButton.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraStage.classList.add("is-live");
    cameraStage.classList.remove("has-photo");
    cameraPlaceholder.hidden = true;
    startCameraButton.hidden = true;
    captureButton.hidden = false;
    retakeButton.hidden = true;
    setStatus(photoStatus, "얼굴을 안내선 안에 맞추고 사진 촬영을 눌러 주세요.", "success");
  } catch (error) {
    console.error(error);
    cameraPlaceholder.hidden = false;
    startCameraButton.hidden = false;
    setStatus(photoStatus, "카메라를 사용할 수 없습니다. 권한을 허용하거나 ‘사진 불러오기’를 이용해 주세요.", "error");
  } finally {
    startCameraButton.disabled = false;
  }
}

function commitPhoto(source, mirror = false) {
  photoContext.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
  drawImageCover(photoContext, source, 0, 0, photoCanvas.width, photoCanvas.height, mirror);
  photoReady = true;
  cameraStage.classList.remove("is-live");
  cameraStage.classList.add("has-photo");
  cameraPlaceholder.hidden = true;
  startCameraButton.hidden = true;
  captureButton.hidden = true;
  retakeButton.hidden = false;
  toMusicButton.disabled = false;
  stopCamera();
  setStatus(photoStatus, "사진이 준비되었습니다. 다음 단계로 이동하세요.", "success");
}

startCameraButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", () => commitPhoto(cameraVideo, true));
retakeButton.addEventListener("click", () => {
  photoReady = false;
  toMusicButton.disabled = true;
  startCamera();
});
photoUpload.addEventListener("change", async () => {
  const [file] = photoUpload.files;
  if (!file) return;
  try {
    const image = await loadImageFile(file);
    commitPhoto(image);
  } catch (error) {
    setStatus(photoStatus, error.message, "error");
  } finally {
    photoUpload.value = "";
  }
});

function updateRecorder(elapsed = 0) {
  noteCount.textContent = String(recordingEvents.length);
  timeCount.textContent = (clamp(elapsed, 0, MAX_DURATION_MS) / 1000).toFixed(1);
  timeProgress.style.width = `${clamp(elapsed / MAX_DURATION_MS, 0, 1) * 100}%`;
}

function resetRecorder() {
  window.clearInterval(timerId);
  window.clearTimeout(timeoutId);
  stopPlayback();
  isRecording = false;
  isCountingDown = false;
  recordingEvents = [];
  composition = undefined;
  updateRecorder(0);
  recordDot.classList.remove("is-recording");
  recordState.textContent = "연습해 보세요";
  recordButton.hidden = false;
  recordButton.disabled = false;
  recordButton.textContent = "3초 후 녹음 시작";
  stopButton.hidden = true;
  listenButton.disabled = true;
  redoMusicButton.disabled = true;
  toResultButton.disabled = true;
  setStatus(musicStatus, "녹음 전에는 건반 소리를 자유롭게 연습할 수 있어요.");
}

function finishRecording(reason = "manual") {
  if (!isRecording) return;
  isRecording = false;
  window.clearInterval(timerId);
  window.clearTimeout(timeoutId);
  const elapsed = clamp(performance.now() - recordingStart, 0, MAX_DURATION_MS);
  updateRecorder(elapsed);
  recordDot.classList.remove("is-recording");
  stopButton.hidden = true;
  recordButton.hidden = false;
  recordButton.disabled = false;
  recordButton.textContent = "다시 녹음";
  redoMusicButton.disabled = false;

  if (recordingEvents.length < MIN_NOTES) {
    composition = undefined;
    recordState.textContent = "조금 더 연주해 주세요";
    setStatus(musicStatus, `음이 ${recordingEvents.length}개입니다. 최소 ${MIN_NOTES}개의 음을 연주해 주세요.`, "error");
    listenButton.disabled = true;
    toResultButton.disabled = true;
    return;
  }

  composition = { instrument: selectedInstrument(), events: recordingEvents.map((event) => ({ ...event })) };
  recordState.textContent = reason === "limit" ? "14개의 음 완성!" : "녹음 완료!";
  listenButton.disabled = false;
  toResultButton.disabled = false;
  setStatus(musicStatus, `${recordingEvents.length}개의 음으로 만든 음악이 준비되었습니다. 들어보고 결과를 확인하세요.`, "success");
}

async function beginRecording() {
  if (isRecording || isCountingDown) return;
  resetRecorder();
  isCountingDown = true;
  recordButton.disabled = true;
  countdown.hidden = false;
  for (const value of [3, 2, 1]) {
    countdown.textContent = String(value);
    await new Promise((resolve) => window.setTimeout(resolve, 650));
  }
  countdown.textContent = "시작!";
  await new Promise((resolve) => window.setTimeout(resolve, 350));
  countdown.hidden = true;
  isCountingDown = false;
  isRecording = true;
  recordingEvents = [];
  recordingStart = performance.now();
  recordButton.hidden = true;
  stopButton.hidden = false;
  recordDot.classList.add("is-recording");
  recordState.textContent = "녹음 중";
  setStatus(musicStatus, "색깔 건반을 7~14번 눌러 나만의 음악을 만들어 보세요.");
  updateRecorder(0);

  timerId = window.setInterval(() => updateRecorder(performance.now() - recordingStart), 50);
  timeoutId = window.setTimeout(() => finishRecording("time"), MAX_DURATION_MS);
}

async function triggerNote(note, button) {
  button.classList.remove("is-pressed");
  requestAnimationFrame(() => button.classList.add("is-pressed"));
  window.setTimeout(() => button.classList.remove("is-pressed"), 180);
  await previewNote(note, selectedInstrument());

  if (!isRecording || recordingEvents.length >= MAX_NOTES) return;
  const start = clamp(Math.round(performance.now() - recordingStart), 0, MAX_DURATION_MS - 80);
  recordingEvents.push({ note, start, duration: Math.min(320, MAX_DURATION_MS - start) });
  updateRecorder(start);
  if (recordingEvents.length >= MAX_NOTES) finishRecording("limit");
}

musicKeys.forEach((button) => {
  button.addEventListener("click", () => triggerNote(Number(button.dataset.note), button));
});

const keyboardMap = new Map(["a", "s", "d", "f", "g", "h", "j", "k"].map((key, index) => [key, index]));
document.addEventListener("keydown", (event) => {
  if (event.repeat || event.target.matches("input, textarea, select")) return;
  const note = keyboardMap.get(event.key.toLowerCase());
  if (note === undefined || panels[1].hidden) return;
  event.preventDefault();
  musicKeys[note].click();
});

recordButton.addEventListener("click", beginRecording);
stopButton.addEventListener("click", () => finishRecording("manual"));
redoMusicButton.addEventListener("click", resetRecorder);
listenButton.addEventListener("click", async () => {
  if (!composition) return;
  listenButton.disabled = true;
  listenButton.textContent = "재생 중…";
  await playComposition(composition);
  listenButton.disabled = false;
  listenButton.textContent = "내 음악 들어보기";
});

function makeQrCanvas(value, level = "Q") {
  const canvas = document.createElement("canvas");
  return QRCode.toCanvas(canvas, value, {
    width: 500,
    margin: 4,
    errorCorrectionLevel: level,
    color: { dark: "#102f55", light: "#ffffff" }
  }).then(() => canvas);
}

function drawText(context, text, x, y, options = {}) {
  const { color = "#102f55", font = '700 48px "Malgun Gothic", sans-serif', align = "left" } = options;
  context.save();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(text, x, y);
  context.restore();
}

async function renderResultCard() {
  if (!photoReady || !composition) return;
  setStatus(resultStatus, "두 개의 QR과 인화 이미지를 만들고 있어요.");
  currentMusicCode = encodeComposition(composition);
  const [playerQr, personalQr] = await Promise.all([
    makeQrCanvas(getPlayerUrl(), "M"),
    makeQrCanvas(currentMusicCode, "Q")
  ]);
  musicQrCanvas = personalQr;

  const context = resultCanvas.getContext("2d");
  context.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
  context.fillStyle = "#f8f5ed";
  context.fillRect(0, 0, resultCanvas.width, resultCanvas.height);

  context.save();
  roundedRect(context, 54, 54, 1092, 724, 38);
  context.clip();
  drawImageCover(context, photoCanvas, 54, 54, 1092, 724);
  const photoShade = context.createLinearGradient(0, 520, 0, 778);
  photoShade.addColorStop(0, "rgba(16,47,85,0)");
  photoShade.addColorStop(1, "rgba(16,47,85,0.52)");
  context.fillStyle = photoShade;
  context.fillRect(54, 480, 1092, 298);
  context.restore();

  context.fillStyle = "#102f55";
  context.fillRect(0, 790, 1200, 230);
  drawText(context, "MY SOUND BOOKMARK", 600, 858, {
    color: "#f4c552",
    font: '700 30px "Malgun Gothic", sans-serif',
    align: "center"
  });
  drawText(context, workTitle.value.trim() || "나의 5초 음악", 600, 948, {
    color: "#ffffff",
    font: '800 58px "Malgun Gothic", sans-serif',
    align: "center"
  });
  drawText(context, `♪ ${INSTRUMENT_NAMES[composition.instrument]} · ${composition.events.length}개의 음`, 600, 998, {
    color: "#d9e9f7",
    font: '500 26px "Malgun Gothic", sans-serif',
    align: "center"
  });

  const qrCards = [
    { x: 35, label: "① 플레이어 열기", qr: playerQr, accent: "#2a9dba" },
    { x: 615, label: "② 내 음악 불러오기", qr: personalQr, accent: "#ef6a62" }
  ];
  for (const item of qrCards) {
    context.fillStyle = "#ffffff";
    roundedRect(context, item.x, 1044, 550, 622, 30);
    context.fill();
    context.fillStyle = item.accent;
    roundedRect(context, item.x + 22, 1064, 506, 58, 18);
    context.fill();
    drawText(context, item.label, item.x + 275, 1106, {
      color: "#ffffff",
      font: '700 27px "Malgun Gothic", sans-serif',
      align: "center"
    });
    context.imageSmoothingEnabled = false;
    context.drawImage(item.qr, item.x + 25, 1138, 500, 500);
    context.imageSmoothingEnabled = true;
  }

  drawText(context, "경구중학교", 58, 1742, {
    color: "#102f55",
    font: '800 34px "Malgun Gothic", sans-serif'
  });
  drawText(context, "코딩으로 보는 세상", 1142, 1742, {
    color: "#536a82",
    font: '600 27px "Malgun Gothic", sans-serif',
    align: "right"
  });

  setStatus(resultStatus, "완성되었습니다. QR 자체 점검 후 저장하거나 출력하세요.", "success");
}

applyTitleButton.addEventListener("click", renderResultCard);
workTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") renderResultCard();
});

downloadButton.addEventListener("click", () => {
  resultCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus(resultStatus, "이미지를 저장하지 못했습니다.", "error");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `마이-사운드-북마크-${Date.now()}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setStatus(resultStatus, "고해상도 PNG 이미지를 저장했습니다.", "success");
  }, "image/png");
});

printButton.addEventListener("click", () => {
  setStatus(resultStatus, "인쇄 창에서 용지 크기와 여백 없음 옵션을 확인해 주세요.");
  window.print();
});

verifyButton.addEventListener("click", () => {
  if (!musicQrCanvas) return;
  const context = musicQrCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, musicQrCanvas.width, musicQrCanvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  try {
    if (!result) throw new Error("QR을 읽지 못했습니다.");
    const verified = decodeComposition(result.data);
    if (verified.events.length !== composition.events.length) throw new Error("음의 개수가 일치하지 않습니다.");
    setStatus(resultStatus, `점검 완료: 작품 QR에서 ${verified.events.length}개의 음을 정상적으로 읽었습니다.`, "success");
  } catch (error) {
    setStatus(resultStatus, `점검 실패: ${error.message}`, "error");
  }
});

toMusicButton.addEventListener("click", () => {
  if (!photoReady) return;
  stopCamera();
  showStep(2);
});
document.querySelector("#backToPhotoButton").addEventListener("click", () => showStep(1));
toResultButton.addEventListener("click", async () => {
  if (!composition) return;
  showStep(3);
  await renderResultCard();
});
document.querySelector("#backToMusicButton").addEventListener("click", () => showStep(2));
document.querySelector("#newExperienceButton").addEventListener("click", () => window.location.reload());
window.addEventListener("beforeunload", stopCamera);

resetRecorder();
