import { NOTE_NAMES } from "./music-codec.js";

const NOTE_COLORS = ["#ef476f", "#f78c35", "#f5c542", "#68b684", "#2a9dba", "#4776d0", "#7359b8", "#c24f9d"];

export function renderScore(composition) {
  const count = composition.events.length;
  const width = Math.max(680, 120 + count * 72);
  const lineStart = 54;
  const lineEnd = width - 34;
  const staffLines = [52, 76, 100, 124, 148];
  const notes = composition.events.map((event, index) => {
    const x = 92 + index * ((width - 150) / Math.max(1, count - 1));
    const y = 172 - event.note * 12;
    const ledger = event.note === 0
      ? `<line x1="${x - 17}" y1="172" x2="${x + 17}" y2="172" class="ledger" />`
      : "";
    return `
      <g class="score-note" style="--note-delay:${index * 45}ms">
        ${ledger}
        <ellipse cx="${x}" cy="${y}" rx="11" ry="8" transform="rotate(-18 ${x} ${y})" fill="${NOTE_COLORS[event.note]}" />
        <line x1="${x + 9}" y1="${y - 2}" x2="${x + 9}" y2="${y - 43}" class="stem" />
        <text x="${x}" y="214" text-anchor="middle" class="note-label">${NOTE_NAMES[event.note]}</text>
      </g>`;
  }).join("");

  return `
    <svg class="music-score" viewBox="0 0 ${width} 235" role="img" aria-label="${count}개의 음으로 구성된 간단 악보">
      <g class="staff">
        ${staffLines.map((y) => `<line x1="${lineStart}" y1="${y}" x2="${lineEnd}" y2="${y}" />`).join("")}
        <text x="18" y="134" class="clef" aria-hidden="true">𝄞</text>
      </g>
      ${notes}
    </svg>`;
}
