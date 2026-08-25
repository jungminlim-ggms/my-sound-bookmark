import test from "node:test";
import assert from "node:assert/strict";
import {
  MUSIC_CODE_PREFIX,
  decodeComposition,
  encodeComposition,
  getCompositionDuration
} from "../src/music-codec.js";

const sample = {
  instrument: 1,
  events: [
    { note: 0, start: 0, duration: 320 },
    { note: 2, start: 360, duration: 320 },
    { note: 4, start: 720, duration: 480 },
    { note: 7, start: 1280, duration: 320 },
    { note: 4, start: 1680, duration: 320 },
    { note: 2, start: 2080, duration: 320 },
    { note: 0, start: 2480, duration: 640 }
  ]
};

test("음악 데이터를 QR용 문자열로 왕복 변환한다", () => {
  const code = encodeComposition(sample);
  assert.ok(code.startsWith(MUSIC_CODE_PREFIX));
  const decoded = decodeComposition(code);
  assert.equal(decoded.instrument, sample.instrument);
  assert.equal(decoded.events.length, sample.events.length);
  assert.deepEqual(decoded.events.map((event) => event.note), sample.events.map((event) => event.note));
  assert.equal(getCompositionDuration(decoded), 3120);
});

test("손상된 체크섬을 거부한다", () => {
  const code = encodeComposition(sample);
  const changed = `${code.slice(0, -1)}${code.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => decodeComposition(changed), /손상/);
});

test("음이 7개보다 적은 음악을 거부한다", () => {
  assert.throws(
    () => encodeComposition({ ...sample, events: sample.events.slice(0, 6) }),
    /7~14/
  );
});
