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

test("인화 이미지에는 사진과 오른쪽 아래의 둥근 음악 QR만 배치한다", () => {
  assert.match(experienceScript, /drawImageCover\(context, photoCanvas, 0, 0/);
  assert.match(experienceScript, /const qrX = resultCanvas\.width - qrSize - qrInset/);
  assert.match(experienceScript, /roundedRect\(context, qrX, qrY, qrSize, qrSize, qrRadius\)/);
  assert.match(experienceScript, /context\.clip\(\)/);
  assert.doesNotMatch(experienceScript, /playerQr|getPlayerUrl|drawText|INSTRUMENT_NAMES|workTitle/);
});
