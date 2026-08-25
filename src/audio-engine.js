import { NOTE_FREQUENCIES, getCompositionDuration } from "./music-codec.js";

let audioContext;
let activeSources = new Set();

function getAudioContext() {
  if (!audioContext) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("이 브라우저는 음악 재생을 지원하지 않습니다.");
    audioContext = new Context();
  }
  return audioContext;
}

async function resumeAudio() {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();
  return context;
}

function scheduleVoice(context, destination, note, start, duration, instrument) {
  const frequency = NOTE_FREQUENCIES[note];
  const safeDuration = Math.max(0.08, duration);
  const gain = context.createGain();
  gain.connect(destination);
  gain.gain.setValueAtTime(0.0001, start);

  const sources = [];
  const addOscillator = (type, frequencyMultiplier, level, detune = 0) => {
    const oscillator = context.createOscillator();
    const harmonicGain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency * frequencyMultiplier, start);
    oscillator.detune.setValueAtTime(detune, start);
    harmonicGain.gain.setValueAtTime(level, start);
    oscillator.connect(harmonicGain).connect(gain);
    oscillator.start(start);
    oscillator.stop(start + safeDuration + 0.5);
    activeSources.add(oscillator);
    oscillator.addEventListener("ended", () => activeSources.delete(oscillator), { once: true });
    sources.push(oscillator);
  };

  if (instrument === 1) {
    addOscillator("sine", 1, 1);
    addOscillator("sine", 3, 0.22);
    gain.gain.exponentialRampToValueAtTime(0.42, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.min(0.55, safeDuration + 0.15));
  } else if (instrument === 2) {
    addOscillator("triangle", 1, 0.8, -3);
    addOscillator("sine", 2, 0.24, 4);
    gain.gain.exponentialRampToValueAtTime(0.32, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + safeDuration + 0.28);
  } else {
    addOscillator("sine", 1, 0.85);
    addOscillator("sine", 2, 0.32);
    addOscillator("sine", 4, 0.1);
    gain.gain.exponentialRampToValueAtTime(0.36, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + safeDuration + 0.4);
  }

  return sources;
}

export async function previewNote(note, instrument = 0) {
  const context = await resumeAudio();
  const master = context.createGain();
  master.gain.value = 0.55;
  master.connect(context.destination);
  scheduleVoice(context, master, note, context.currentTime + 0.01, 0.28, instrument);
}

export function stopPlayback() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // 이미 종료된 소스는 무시한다.
    }
  }
  activeSources.clear();
}

export async function playComposition(composition) {
  const context = await resumeAudio();
  stopPlayback();

  const master = context.createGain();
  master.gain.value = 0.62;
  master.connect(context.destination);
  const baseTime = context.currentTime + 0.08;

  for (const event of composition.events) {
    scheduleVoice(
      context,
      master,
      event.note,
      baseTime + event.start / 1000,
      Math.min(0.65, event.duration / 1000),
      composition.instrument
    );
  }

  const duration = getCompositionDuration(composition) + 650;
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}
