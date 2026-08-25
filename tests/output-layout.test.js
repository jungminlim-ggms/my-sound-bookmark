import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experienceHtml = readFileSync(new URL("../experience.html", import.meta.url), "utf8");
const experienceScript = readFileSync(new URL("../src/experience.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("XS-20L 결과 이미지는 1:1 정사각형이다", () => {
  assert.match(experienceHtml, /id="resultCanvas" width="1200" height="1200"/);
  assert.match(styles, /size:\s*72mm 85mm/);
  assert.match(styles, /#printArea canvas\s*\{[\s\S]*?width:\s*72mm;[\s\S]*?height:\s*72mm;/);
});

test("인화 이미지에는 사진과 두 개의 QR만 배치한다", () => {
  assert.match(experienceScript, /drawImageCover\(context, photoCanvas, 0, 0/);
  assert.match(experienceScript, /x:\s*qrInset, y:\s*qrInset, qr:\s*playerQr/);
  assert.match(experienceScript, /x:\s*resultCanvas\.width - qrSize - qrInset/);
  assert.doesNotMatch(experienceScript, /drawText|INSTRUMENT_NAMES|workTitle/);
});
