export const MUSIC_CODE_PREFIX = "MSB1:";
export const MAX_DURATION_MS = 5000;
export const MIN_NOTES = 7;
export const MAX_NOTES = 14;
export const TICK_MS = 40;

export const NOTE_NAMES = ["도", "레", "미", "파", "솔", "라", "시", "높은 도"];
export const NOTE_FREQUENCIES = [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25];
export const INSTRUMENT_NAMES = ["맑은 벨", "통통 마림바", "반짝 신시"];

const DATA_VERSION = 1;

function crc16Ccitt(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function bytesToBase64Url(bytes) {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  }
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("음악 코드에 사용할 수 없는 문자가 있습니다.");
  if (typeof atob === "function") {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

function assertComposition(composition) {
  if (!composition || !Array.isArray(composition.events)) throw new Error("음악 데이터가 없습니다.");
  if (composition.events.length < MIN_NOTES || composition.events.length > MAX_NOTES) {
    throw new Error(`음악은 ${MIN_NOTES}~${MAX_NOTES}개의 음으로 만들어야 합니다.`);
  }
  if (!Number.isInteger(composition.instrument) || composition.instrument < 0 || composition.instrument >= INSTRUMENT_NAMES.length) {
    throw new Error("지원하지 않는 악기입니다.");
  }

  for (const event of composition.events) {
    if (!Number.isInteger(event.note) || event.note < 0 || event.note >= NOTE_NAMES.length) {
      throw new Error("지원하지 않는 음이 포함되어 있습니다.");
    }
    if (!Number.isFinite(event.start) || !Number.isFinite(event.duration) || event.start < 0 || event.duration <= 0) {
      throw new Error("음의 시간 정보가 올바르지 않습니다.");
    }
    if (event.start + event.duration > MAX_DURATION_MS + TICK_MS) {
      throw new Error("음악 길이가 5초를 넘습니다.");
    }
  }
}

export function encodeComposition(composition) {
  assertComposition(composition);
  const body = new Uint8Array(3 + composition.events.length * 3);
  body[0] = DATA_VERSION;
  body[1] = composition.instrument;
  body[2] = composition.events.length;

  composition.events.forEach((event, index) => {
    const offset = 3 + index * 3;
    body[offset] = event.note;
    body[offset + 1] = Math.max(0, Math.min(125, Math.round(event.start / TICK_MS)));
    body[offset + 2] = Math.max(1, Math.min(125, Math.round(event.duration / TICK_MS)));
  });

  const checksum = crc16Ccitt(body);
  const packed = new Uint8Array(body.length + 2);
  packed.set(body);
  packed[packed.length - 2] = checksum >> 8;
  packed[packed.length - 1] = checksum & 0xff;
  return `${MUSIC_CODE_PREFIX}${bytesToBase64Url(packed)}`;
}

export function decodeComposition(code) {
  const normalized = String(code ?? "").trim();
  if (!normalized.startsWith(MUSIC_CODE_PREFIX)) {
    throw new Error("마이 사운드 북마크의 작품 QR이 아닙니다.");
  }

  const packed = base64UrlToBytes(normalized.slice(MUSIC_CODE_PREFIX.length));
  if (packed.length < 8) throw new Error("음악 코드가 너무 짧습니다.");

  const body = packed.slice(0, -2);
  const expectedChecksum = (packed[packed.length - 2] << 8) | packed[packed.length - 1];
  if (crc16Ccitt(body) !== expectedChecksum) throw new Error("음악 코드가 손상되었습니다.");
  if (body[0] !== DATA_VERSION) throw new Error("지원하지 않는 음악 코드 버전입니다.");

  const noteCount = body[2];
  if (body.length !== 3 + noteCount * 3) throw new Error("음악 코드의 길이가 올바르지 않습니다.");

  const composition = { instrument: body[1], events: [] };
  for (let index = 0; index < noteCount; index += 1) {
    const offset = 3 + index * 3;
    composition.events.push({
      note: body[offset],
      start: body[offset + 1] * TICK_MS,
      duration: body[offset + 2] * TICK_MS
    });
  }

  assertComposition(composition);
  return composition;
}

export function getCompositionDuration(composition) {
  return Math.min(
    MAX_DURATION_MS,
    Math.max(...composition.events.map((event) => event.start + event.duration), 0)
  );
}

export function formatRecoveryCode(code) {
  const compact = String(code).replace(MUSIC_CODE_PREFIX, "");
  return compact.match(/.{1,4}/gu)?.join("-") ?? compact;
}
