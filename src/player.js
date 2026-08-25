import jsQR from "jsqr";
import "./styles.css";
import { playComposition, stopPlayback } from "./audio-engine.js";
import { loadImageFile, setStatus } from "./common.js";
import {
  INSTRUMENT_NAMES,
  MUSIC_CODE_PREFIX,
  decodeComposition,
  getCompositionDuration
} from "./music-codec.js";
import { renderScore } from "./score.js";

const scannerStage = document.querySelector("#scannerStage");
const scannerVideo = document.querySelector("#scannerVideo");
const scannerPlaceholder = document.querySelector("#scannerPlaceholder");
const scanButton = document.querySelector("#scanButton");
const stopScanButton = document.querySelector("#stopScanButton");
const qrUpload = document.querySelector("#qrUpload");
const manualCode = document.querySelector("#manualCode");
const loadCodeButton = document.querySelector("#loadCodeButton");
const scanStatus = document.querySelector("#scanStatus");
const scoreCard = document.querySelector("#scoreCard");
const scoreEmpty = document.querySelector("#scoreEmpty");
const scoreView = document.querySelector("#scoreView");
const scoreMeta = document.querySelector("#scoreMeta");
const scoreInstrument = document.querySelector("#scoreInstrument");
const scoreNoteCount = document.querySelector("#scoreNoteCount");
const scoreDuration = document.querySelector("#scoreDuration");
const playButton = document.querySelector("#playButton");

const scanCanvas = document.createElement("canvas");
const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
let scannerStream;
let scanAnimationFrame;
let activeComposition;
let lastWrongCodeTime = 0;

function normalizeManualCode(value) {
  const compact = value.trim().replaceAll(/\s+/gu, "");
  if (compact.startsWith(MUSIC_CODE_PREFIX)) return compact;
  const withoutHyphens = compact.replaceAll("-", "");
  return `${MUSIC_CODE_PREFIX}${withoutHyphens}`;
}

function stopScanner() {
  window.cancelAnimationFrame(scanAnimationFrame);
  if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop());
  scannerStream = undefined;
  scannerVideo.srcObject = null;
  scannerStage.classList.remove("is-scanning");
  scannerPlaceholder.hidden = false;
  scanButton.hidden = false;
  stopScanButton.hidden = true;
}

function loadComposition(code) {
  try {
    const decoded = decodeComposition(code);
    activeComposition = decoded;
    scoreView.innerHTML = renderScore(decoded);
    scoreView.hidden = false;
    scoreEmpty.hidden = true;
    scoreMeta.hidden = false;
    scoreCard.classList.remove("is-empty");
    scoreInstrument.textContent = INSTRUMENT_NAMES[decoded.instrument];
    scoreNoteCount.textContent = `${decoded.events.length}개 음`;
    scoreDuration.textContent = `${(getCompositionDuration(decoded) / 1000).toFixed(1)}초`;
    playButton.disabled = false;
    manualCode.value = code;
    stopScanner();
    setStatus(scanStatus, "작품 QR을 읽었습니다. 악보 아래의 재생 버튼을 눌러 주세요.", "success");
    scoreCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  } catch (error) {
    setStatus(scanStatus, error.message, "error");
    return false;
  }
}

function inspectFrame() {
  if (!scannerStream || scannerVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scanAnimationFrame = window.requestAnimationFrame(inspectFrame);
    return;
  }

  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / scannerVideo.videoWidth);
  scanCanvas.width = Math.round(scannerVideo.videoWidth * scale);
  scanCanvas.height = Math.round(scannerVideo.videoHeight * scale);
  scanContext.drawImage(scannerVideo, 0, 0, scanCanvas.width, scanCanvas.height);
  const imageData = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });

  if (result?.data) {
    if (result.data.startsWith(MUSIC_CODE_PREFIX)) {
      if (loadComposition(result.data)) return;
    } else if (Date.now() - lastWrongCodeTime > 1800) {
      lastWrongCodeTime = Date.now();
      setStatus(scanStatus, "① 플레이어 QR이 아니라 ② 작품 QR을 보여주세요.", "error");
    }
  }
  scanAnimationFrame = window.requestAnimationFrame(inspectFrame);
}

async function startScanner() {
  stopScanner();
  scanButton.disabled = true;
  setStatus(scanStatus, "카메라 사용 권한을 확인하고 있어요.");
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    scannerVideo.srcObject = scannerStream;
    await scannerVideo.play();
    scannerStage.classList.add("is-scanning");
    scannerPlaceholder.hidden = true;
    scanButton.hidden = true;
    stopScanButton.hidden = false;
    setStatus(scanStatus, "포토 북마크의 ② 작품 QR을 네모 안에 맞춰 주세요.");
    inspectFrame();
  } catch (error) {
    console.error(error);
    stopScanner();
    setStatus(scanStatus, "카메라를 사용할 수 없습니다. 권한을 허용하거나 QR 사진을 불러와 주세요.", "error");
  } finally {
    scanButton.disabled = false;
  }
}

async function decodeImageFile(file) {
  const image = await loadImageFile(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  scanCanvas.width = Math.round(image.naturalWidth * scale);
  scanCanvas.height = Math.round(image.naturalHeight * scale);
  scanContext.drawImage(image, 0, 0, scanCanvas.width, scanCanvas.height);
  const imageData = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
}

scanButton.addEventListener("click", startScanner);
stopScanButton.addEventListener("click", () => {
  stopScanner();
  setStatus(scanStatus, "카메라를 껐습니다.");
});
qrUpload.addEventListener("change", async () => {
  const [file] = qrUpload.files;
  if (!file) return;
  try {
    setStatus(scanStatus, "QR 이미지를 확인하고 있어요.");
    const result = await decodeImageFile(file);
    if (!result) throw new Error("사진에서 QR을 찾지 못했습니다. QR이 크게 보이는 사진을 선택해 주세요.");
    loadComposition(result.data);
  } catch (error) {
    setStatus(scanStatus, error.message, "error");
  } finally {
    qrUpload.value = "";
  }
});
loadCodeButton.addEventListener("click", () => loadComposition(normalizeManualCode(manualCode.value)));
manualCode.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    loadComposition(normalizeManualCode(manualCode.value));
  }
});

playButton.addEventListener("click", async () => {
  if (!activeComposition) return;
  playButton.disabled = true;
  playButton.classList.add("is-playing");
  playButton.innerHTML = '<span aria-hidden="true">♪</span> 재생 중…';
  await playComposition(activeComposition);
  playButton.disabled = false;
  playButton.classList.remove("is-playing");
  playButton.innerHTML = '<span aria-hidden="true">▶</span> 다시 재생';
});

window.addEventListener("beforeunload", () => {
  stopScanner();
  stopPlayback();
});
