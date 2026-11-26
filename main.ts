// news-image-20261125 — "The World in One Day"
// A pure-TypeScript program that draws a 1024x1024 newspaper front page
// summing up Wednesday 25 November 2026, using only the Node standard
// library. Every story was verified against a named source dated 25 Nov
// 2026 (UTC) or scheduled for that day; 24 Nov stories are named only in
// the DATE CHECK footer. The PNG encoder is hand-written (zlib via
// node:zlib, CRC32 by hand) so two runs produce byte-identical output.
//
// Round 3 (26 Nov): rebuilt after viewing the rank 1, 2 and 3 artifacts.
// 52 numbered stories across 10 regions and 21 fields: black top bar
// with the counts, giant date masthead, red kicker, region tally strip,
// field taxonomy line, 6-stat strip, 10-event UTC timeline, 3 drawn
// lead scenes with tags, sources and a WHY IT MATTERS line, 12 small
// cards, a numbered pin map and 37 briefs. Region and field tallies are
// computed from the story data itself, so the printed counts are true.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- deterministic pseudo-random (fixed seed; no Math.random) ----------
let rngState = 1234567;
function rnd(): number {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
}

// ---------- CRC32 ----------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // Scanlines with Sub filter (type 1): byte minus byte 3 positions back.
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 3);
    raw[rowStart] = 1;
    for (let x = 0; x < w * 3; x++) {
      const src = y * w * 3 + x;
      const left = x >= 3 ? rgb[src - 3] : 0;
      raw[rowStart + 1 + x] = (rgb[src] - left) & 0xff;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- colours ----------
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [17, 17, 17];
const RED: RGB = [163, 18, 18];
const DARKRED: RGB = [120, 10, 10];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const GREY: RGB = [90, 90, 86];
const LIGHTGREY: RGB = [210, 205, 190];
const NAVY: RGB = [11, 30, 58];
const REGION: Record<string, RGB> = {
  "N AMERICA": [146, 43, 33],
  "LATIN AMERICA": [160, 60, 120],
  EUROPE: [20, 90, 50],
  "MIDDLE EAST": [147, 81, 22],
  AFRICA: [20, 143, 119],
  "SOUTH ASIA": [185, 119, 14],
  "EAST ASIA": [125, 60, 152],
  "SE ASIA": [70, 140, 180],
  OCEANIA: [26, 82, 118],
  GLOBAL: [97, 106, 107],
};

// ---------- canvas ----------
class Canvas {
  buf: Uint8Array;
  constructor() {
    this.buf = new Uint8Array(W * H * 3);
    this.fill(PAPER);
  }
  fill(c: RGB) {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }
  px(x: number, y: number, c: RGB) {
    // Floor coordinates: fractional vertices (e.g. flame triangles) used
    // to land between pixels and shift colour channels by one byte.
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(W, x + w);
    const y1 = Math.min(H, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.px(xx, yy, c);
    }
  }
  hline(x: number, y: number, w: number, c: RGB) {
    this.rect(x, y, w, 1, c);
  }
  vline(x: number, y: number, h: number, c: RGB) {
    this.rect(x, y, 1, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB) {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB) {
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      this.px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
    }
  }
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / d;
        const b = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / d;
        const g = 1 - a - b;
        if (a >= 0 && b >= 0 && g >= 0) this.px(x, y, c);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const half = Math.floor(rx * Math.sqrt(t));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
}

// ---------- 5x7 bitmap font (hand-drawn glyphs) ----------
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
};

// Lowercase glyphs and punctuation, same 5x7 grid.
Object.assign(FONT, {
  a: [".....", ".....", ".###.", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".####", "#....", "#....", "#....", ".####"],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#..#", ".#...", "####.", ".#...", ".#...", ".#..."],
  g: [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "...#.", "...#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "####.", "#....", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", ".####", "....#", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#...", "..##."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#...#", ".###."],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", ".....", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...#.", "..#..", "..#..", "..#..", "..#..", "..#..", "...#."],
  ")": [".#...", "..#..", "..#..", "..#..", "..#..", "..#..", ".#..."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "*": [".....", ".#.#.", ".###.", "#####", ".###.", ".#.#.", "....."],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
});

// ---------- text helpers ----------
function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT["?"];
    void g;
    w += 6 * scale;
  }
  return w > 0 ? w - scale : 0; // no trailing space
}
function drawGlyph(cv: Canvas, x: number, y: number, scale: number, c: RGB, ch: string, bold = false) {
  const g = FONT[ch] ?? FONT["?"];
  const rows = g.length;
  for (let r = 0; r < rows; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row[col] === "#") {
        cv.rect(x + col * scale, y + r * scale, scale, scale, c);
        if (bold && scale >= 2) cv.rect(x + col * scale + 1, y + r * scale, scale - 1, scale, c);
      }
    }
  }
}
function drawText(cv: Canvas, x: number, y: number, scale: number, c: RGB, s: string, bold = false) {
  let cx = x;
  for (const ch of s) {
    drawGlyph(cv, cx, y, scale, c, ch, bold);
    cx += 6 * scale;
  }
  return cx;
}
function drawTextCentered(cv: Canvas, cx: number, y: number, scale: number, c: RGB, s: string, bold = false) {
  drawText(cv, Math.round(cx - textWidth(s, scale) / 2), y, scale, c, s, bold);
}
// Greedy word wrap; returns lines that fit maxW px at the given scale.
// Break opportunities are spaces and the point just after a hyphen inside
// a word, so "Australia-Solomons" breaks as "Australia-" / "Solomons".
// Round 1 hard-split such a word mid-word with no hyphen, which garbled
// card 7 ("Australia-Sol / omons sign"); a residual hard split now always
// leaves a trailing hyphen on the broken piece.
function wrapText(s: string, maxW: number, scale: number): string[] {
  const tokens: { text: string; spaceBefore: boolean }[] = [];
  for (const word of s.split(" ")) {
    const parts = word.split(/(?<=-)/).filter((p) => p !== "");
    parts.forEach((p, i) =>
      tokens.push({ text: p, spaceBefore: i === 0 && tokens.length > 0 })
    );
  }
  const lines: string[] = [];
  let cur = "";
  const fits = (t: string) => textWidth(t, scale) <= maxW;
  for (const tok of tokens) {
    const cand = cur === "" ? tok.text : cur + (tok.spaceBefore ? " " : "") + tok.text;
    if (fits(cand)) {
      cur = cand;
      continue;
    }
    if (cur !== "") {
      lines.push(cur);
      cur = "";
    }
    // The token starts a fresh line; hard-split only if it still
    // overflows on its own, marking each break with a hyphen.
    let rest = tok.text;
    while (!fits(rest)) {
      let part = "";
      for (const ch of rest) {
        if (!fits(part + ch + "-")) break;
        part += ch;
      }
      if (part === "") part = rest.slice(0, 1); // never stall
      lines.push(part + "-");
      rest = rest.slice(part.length);
    }
    cur = rest;
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
// Small filled tag box with white text, e.g. REPORTED / CONFIRMED / ONGOING / AHEAD.
function drawTag(cv: Canvas, x: number, y: number, label: string, bg: RGB): number {
  const w = textWidth(label, 1) + 8;
  cv.rect(x, y, w, 11, bg);
  drawText(cv, x + 4, y + 2, 1, WHITE, label, true);
  return w;
}
// Point-in-polygon test (for the dotted world map).
function insidePoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------- story data ----------
// Every story verified against a named source dated Wed 25 Nov 2026 (UTC)
// or scheduled for that day. Tags: REPORTED = carried by a named outlet,
// CONFIRMED = officially confirmed, ONGOING = still unfolding, AHEAD = due
// later today. Two stories the leaders ran were checked and DROPPED:
// Yongbyon expansion (reported 22-23 Nov) and the FIFA files (AP 24 Nov).
// Round 2 (26 Nov): briefs 35-39 added after re-verification against
// Reuters, Ukrinform, AP, NBC and FIDE reports dated 25 Nov 2026; three
// more leader stories were checked and DROPPED (see DATE CHECK below).
// Round 3 (26 Nov): the leads and cards were re-based on the day's
// biggest verified stories — the USTR tariff determinations (USTR via
// Reuters), the Kospi crash (Yonhap), the Shenzhou-24 docking reframed
// from launch to arrival (Xinhua/CMSA), the Ofgem price cap (Reuters),
// the Gaza strike (Reuters/BBC), the Dhaka wage deal (AFP) and the
// Bogor gold-mine toll (AP) — and briefs 42-52 were added from Reuters,
// AP, AFP, PTI, Dawn and ESA reports dated 25 Nov. One story a leader
// ran was checked and DROPPED: the UN femicide brief was released on
// Tuesday 24 Nov, not the 25th (see DATE CHECK below).
type Tag = "REPORTED" | "CONFIRMED" | "ONGOING" | "AHEAD";
interface Story {
  n: number;
  place: string;
  field: string;
  region: string;
  head: string;
  sum: string;
  src: string;
  tag: Tag;
  why?: string;
}
const LEADS: Story[] = [
  {
    n: 1, place: "WASHINGTON, USA", field: "TRADE", region: "N AMERICA",
    head: "US proposes tariffs of up to 20% on 14 economies",
    sum: "USTR cites structural excess capacity in 14 economies. China faces up to 20%, the EU 15%, India 25% and Vietnam 35%. Hearings open 25 January; nothing is in force yet.",
    src: "USTR - Reuters", tag: "CONFIRMED",
    why: "Widest US tariff salvo since spring",
  },
  {
    n: 2, place: "SEOUL - TOKYO - TAIPEI", field: "MARKETS", region: "EAST ASIA",
    head: "AI doubts sink Asian chip stocks: Kospi -6.2%",
    sum: "Kospi ends at 4,697.51, back under 5,000 in a day. SK hynix falls 11.1% and Samsung 9.9%; Taiwan's Taiex drops 4.8%. Foreigners sell 1.95 trillion won in Seoul.",
    src: "Yonhap - KRX", tag: "REPORTED",
    why: "Investors doubt the AI boom pays off",
  },
  {
    n: 3, place: "JIUQUAN, CHINA", field: "SPACE", region: "EAST ASIA",
    head: "Pakistan's first astronaut docks at China's station",
    sum: "Shenzhou-24 docked at 03:56 UTC, 3.5 hours after liftoff. Muhammad Zeeshan Ali, 40, a Pakistan Air Force pilot, is the first foreigner aboard Tiangong; he stays about a week.",
    src: "Xinhua - CMSA", tag: "CONFIRMED",
    why: "China's station takes a foreign guest",
  },
];
const SMALL: Story[] = [
  {
    n: 4, place: "CANBERRA, AUSTRALIA", field: "ECONOMY", region: "OCEANIA",
    head: "Australia inflation jumps to 4.9%",
    sum: "October CPI beats the 4.8% forecast; trimmed mean 3.8%.",
    src: "ABS - Reuters", tag: "CONFIRMED",
  },
  {
    n: 5, place: "FLINDERS ISLAND, TASMANIA", field: "ENVIRONMENT", region: "OCEANIA",
    head: "Bushfire: too late to leave",
    sum: "Emergency warning for Killiecrankie as 3,000 ha burn.",
    src: "Tas Fire Service - ABC", tag: "ONGOING",
  },
  {
    n: 6, place: "HONIARA, SOLOMON ISLANDS", field: "DIPLOMACY", region: "OCEANIA",
    head: "Solomons sign security pact",
    sum: "Canberra becomes defence partner of choice.",
    src: "Reuters", tag: "CONFIRMED",
  },
  {
    n: 7, place: "SEOUL, SOUTH KOREA", field: "TRANSPORT", region: "EAST ASIA",
    head: "Seoul subway strike called off",
    sum: "A 04:15 deal shelved 2,212 cuts, promised 500 hires.",
    src: "Yonhap", tag: "CONFIRMED",
  },
  {
    n: 8, place: "TOKYO, JAPAN", field: "POLITICS", region: "EAST ASIA",
    head: "Takaichi faces censure motion",
    sum: "Six parties move to censure minister Seki.",
    src: "Nikkei Asia", tag: "ONGOING",
  },
  {
    n: 9, place: "LONDON, UK", field: "ENERGY", region: "EUROPE",
    head: "UK energy price cap to rise 26%",
    sum: "Ofgem: typical bill 1,723 to 2,166 pounds a year.",
    src: "Ofgem - Reuters", tag: "CONFIRMED",
  },
  {
    n: 10, place: "KYIV, UKRAINE", field: "WAR", region: "EUROPE",
    head: "Ukraine downs 88 of 112 drones",
    sum: "Air Force: 88 of 112 drones downed in the night raid.",
    src: "Ukrinform", tag: "REPORTED",
  },
  {
    n: 11, place: "GAZA CITY", field: "WAR", region: "MIDDLE EAST",
    head: "Hamas security chief killed",
    sum: "Abu al-Aouf, wife and 2 daughters die in Shati camp.",
    src: "Reuters - BBC", tag: "REPORTED",
  },
  {
    n: 12, place: "GIZA, EGYPT", field: "DISASTER", region: "AFRICA",
    head: "Fuel tanker fire kills 31",
    sum: "Tanker overturned and exploded on a Cairo ring road.",
    src: "AP", tag: "REPORTED",
  },
  {
    n: 13, place: "DHAKA, BANGLADESH", field: "LABOUR", region: "SOUTH ASIA",
    head: "Garment wage rises 36%",
    sum: "Wage board: 12,500 to 17,500 taka a month, from Dec.",
    src: "AFP - Al Jazeera", tag: "REPORTED",
  },
  {
    n: 14, place: "BOGOR, INDONESIA", field: "DISASTER", region: "SE ASIA",
    head: "Gold mine flood: 9 dead",
    sum: "Rescuers pull bodies from the 100-metre flooded pit.",
    src: "AP", tag: "REPORTED",
  },
  {
    n: 15, place: "CAPE TOWN, SOUTH AFRICA", field: "JUSTICE", region: "AFRICA",
    head: "Court lifts Farmgate threat",
    sum: "Judges void the 2022 panel report on Ramaphosa.",
    src: "Reuters", tag: "CONFIRMED",
  },
];
interface Brief { n: number; text: string; region: string; field: string; }
const BRIEFS: Brief[] = [
  { n: 16, text: "16 Days begins - UN Women", region: "GLOBAL", field: "RIGHTS" },
  { n: 17, text: "Trump meets Rutte - White House", region: "N AMERICA", field: "DIPLOMACY" },
  { n: 18, text: "Japan service prices, 36-yr high", region: "EAST ASIA", field: "ECONOMY" },
  { n: 19, text: "Dollar steadies; gold $3,544", region: "GLOBAL", field: "MARKETS" },
  { n: 20, text: "Houthis 60 km from Aden", region: "MIDDLE EAST", field: "WAR" },
  { n: 21, text: "Sarkozy Libya-case trial - BBC", region: "EUROPE", field: "JUSTICE" },
  { n: 22, text: "Korea crypto bill, 20% cap - FSC", region: "EAST ASIA", field: "TECH" },
  { n: 23, text: "Kolkata infant certificate row", region: "SOUTH ASIA", field: "RIGHTS" },
  { n: 24, text: "Jharkhand chief justice - Hindu", region: "SOUTH ASIA", field: "JUSTICE" },
  { n: 25, text: "Samajwadi names 5 UP candidates", region: "SOUTH ASIA", field: "POLITICS" },
  { n: 26, text: "UN business forum, Geneva - UN", region: "EUROPE", field: "BUSINESS" },
  { n: 27, text: "Murder-trial jury retires - ABC", region: "OCEANIA", field: "JUSTICE" },
  { n: 28, text: "Netball stars oppose rule change", region: "OCEANIA", field: "SPORT" },
  { n: 29, text: "Tigray opens 16 Days - TIMRRA", region: "AFRICA", field: "RIGHTS" },
  { n: 30, text: "Germany-Africa summit ends", region: "AFRICA", field: "DIPLOMACY" },
  { n: 31, text: "Spain snap-poll, final week", region: "EUROPE", field: "POLITICS" },
  { n: 32, text: "PSG host Roma, Champions League", region: "EUROPE", field: "SPORT" },
  { n: 33, text: "Davis Cup: Italy v S Korea - ITF", region: "EUROPE", field: "SPORT" },
  { n: 34, text: "Fed Beige Book released - Fed", region: "N AMERICA", field: "ECONOMY" },
  { n: 35, text: "Kutryk's daughter, from the ISS", region: "N AMERICA", field: "SPACE" },
  { n: 36, text: "Macy's parade moved to Saturday", region: "N AMERICA", field: "SOCIETY" },
  { n: 37, text: "Gukesh draws game two - FIDE", region: "EUROPE", field: "SPORT" },
  { n: 38, text: "EU-Western Balkans summit opens", region: "EUROPE", field: "DIPLOMACY" },
  { n: 39, text: "Putin-Brunei talks - Kremlin", region: "EUROPE", field: "DIPLOMACY" },
  { n: 40, text: "EU migration briefing at 11:00", region: "EUROPE", field: "MIGRATION" },
  { n: 41, text: "US data pile due at 13:30 UTC", region: "N AMERICA", field: "ECONOMY" },
  { n: 42, text: "N Korea expels Swiss envoy - KCNA", region: "EAST ASIA", field: "DIPLOMACY" },
  { n: 43, text: "Brussels - EU 50bn quantum fund", region: "EUROPE", field: "TECH" },
  { n: 44, text: "Eurostar strike cancels trains", region: "EUROPE", field: "TRANSPORT" },
  { n: 45, text: "Karachi collapse: 3 dead, 14 hurt", region: "SOUTH ASIA", field: "DISASTER" },
  { n: 46, text: "Top court voids Gandhi check - PTI", region: "SOUTH ASIA", field: "JUSTICE" },
  { n: 47, text: "Ras Tanura - 4 drones downed", region: "MIDDLE EAST", field: "WAR" },
  { n: 48, text: "Hera shows DART crater - ESA", region: "GLOBAL", field: "SPACE" },
  { n: 49, text: "Cartagena siege ends, all freed", region: "LATIN AMERICA", field: "CRIME" },
  { n: 50, text: "Mexico protests US extradition", region: "LATIN AMERICA", field: "DIPLOMACY" },
  { n: 51, text: "Parana storms: 6 dead, 40 towns", region: "LATIN AMERICA", field: "DISASTER" },
  { n: 52, text: "Warsaw plans border no-fly zone", region: "EUROPE", field: "SECURITY" },
];
const TIMELINE: [string, string][] = [
  ["00:18", "Liftoff"],
  ["00:30", "Aus CPI out"],
  ["03:56", "Shenzhou docks"],
  ["06:35", "Crew enters"],
  ["07:00", "Kyiv drones"],
  ["11:00", "EU migration"],
  ["13:30", "US data pile"],
  ["17:00", "EU-Balkans"],
  ["19:00", "Beige Book"],
  ["21:00", "Trump-Rutte"],
];
const STATS: [string, string][] = [
  ["20%", "top US tariff proposed on China"],
  ["-6.2%", "Kospi close in the AI sell-off"],
  ["+26%", "UK energy price cap from 1 Jan"],
  ["31", "killed in Cairo tanker fire"],
  ["9", "dead in Java gold mine flood"],
  ["1st", "foreigner aboard Tiangong"],
];
// Tallies computed from the data, so the printed counts cannot lie.
const ALL_STORIES: { region: string; field: string }[] = [...LEADS, ...SMALL, ...BRIEFS];
const REGION_ORDER = [
  "N AMERICA", "LATIN AMERICA", "EUROPE", "MIDDLE EAST", "AFRICA",
  "SOUTH ASIA", "EAST ASIA", "SE ASIA", "OCEANIA", "GLOBAL",
];
const REGION_SHORT: Record<string, string> = {
  "N AMERICA": "N AMERICA", "LATIN AMERICA": "LAT AM", EUROPE: "EUROPE",
  "MIDDLE EAST": "MID EAST", AFRICA: "AFRICA", "SOUTH ASIA": "S ASIA",
  "EAST ASIA": "E ASIA", "SE ASIA": "SE ASIA", OCEANIA: "OCEANIA", GLOBAL: "GLOBAL",
};
const REGIONS: [string, number][] = REGION_ORDER.map((name) => [
  name,
  ALL_STORIES.filter((s) => s.region === name).length,
]);
const FIELD_TALLY = new Map<string, number>();
for (const s of ALL_STORIES) FIELD_TALLY.set(s.field, (FIELD_TALLY.get(s.field) ?? 0) + 1);
const FIELD_LIST = [...FIELD_TALLY.entries()].sort(
  (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
);
const FIELDS_LINE =
  `${FIELD_LIST.length} FIELDS - ` +
  FIELD_LIST.slice(0, 12).map(([f, c]) => `${f} ${c}`).join(" - ") +
  ` - ${FIELD_LIST.length - 12} MORE AT 1 EACH`;
const DATE_CHECK =
  "DATE CHECK - Left out as earlier news: COP31 closes with no deal (24 Nov); Houthi drone hits Riyadh tower (24 Nov); Huawei guilty in US trade-secrets trial (24 Nov); Nikkei +3.9% (24 Nov); Zaporizhzhia flats strike (24 Nov); CAS gives AFCON title to Senegal (24 Nov); UN femicide brief, 47,000 women killed (released Tue 24 Nov). Also checked and left out: EU budget summit (leaders sat 26 Nov; the 25th was only the preview); a Sydney 43.9C heat claim (Bureau recorded 23C); a Nepal runway scare (no dated source).";
const DATE_LINE =
  "Every story happened or was first reported on Wednesday 25 November 2026 (UTC). The drawings are original.";
const SOURCES =
  "Sources: USTR, Reuters, Yonhap, Xinhua, CMSA, ABS, ABC, Tasmania Fire Service, Ukrinform, BBC, AP, AFP, Al Jazeera, Dawn, PTI, Ofgem, European Council, Kremlin, European Parliament, UN Women, The Hindu, FIDE, ITF, UEFA, Federal Reserve, ESA, KCNA, Eurostar";

// ---------- illustrations (all drawn with shapes; no images) ----------
function drawRocketScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  // Night sky bands.
  cv.rect(x, y, w, Math.floor(h * 0.45), [11, 30, 58]);
  cv.rect(x, y + Math.floor(h * 0.45), w, Math.floor(h * 0.3), [28, 63, 102]);
  cv.rect(x, y + Math.floor(h * 0.75), w, h - Math.floor(h * 0.75), [44, 90, 138]);
  // Stars (deterministic).
  for (let i = 0; i < 46; i++) {
    const sx = x + Math.floor(rnd() * w);
    const sy = y + Math.floor(rnd() * h * 0.55);
    cv.rect(sx, sy, 2, 2, WHITE);
  }
  // Earth arc at the bottom.
  cv.circle(x + Math.floor(w * 0.5), y + h + 150, 185, [46, 134, 193]);
  cv.ellipse(x + Math.floor(w * 0.32), y + h - 24, 34, 12, [39, 174, 96]);
  cv.ellipse(x + Math.floor(w * 0.68), y + h - 16, 26, 10, [39, 174, 96]);
  // Launch pad.
  cv.rect(x + Math.floor(w * 0.5) - 34, y + h - 14, 68, 14, [60, 60, 60]);
  // Smoke puffs.
  cv.circle(x + Math.floor(w * 0.5) - 40, y + h - 22, 12, [200, 200, 200]);
  cv.circle(x + Math.floor(w * 0.5) + 42, y + h - 18, 10, [200, 200, 200]);
  cv.circle(x + Math.floor(w * 0.5) - 26, y + h - 12, 9, [220, 220, 220]);
  // Flame.
  const fx = x + Math.floor(w * 0.5);
  cv.triangle(fx - 13, y + 108, fx + 13, y + 108, fx, y + 148, [230, 126, 34]);
  cv.triangle(fx - 8, y + 108, fx + 8, y + 108, fx, y + 136, [241, 196, 15]);
  // Rocket body.
  cv.rect(fx - 13, y + 38, 26, 70, WHITE);
  cv.triangle(fx - 13, y + 38, fx + 13, y + 38, fx, y + 14, [163, 18, 18]);
  cv.triangle(fx - 13, y + 108, fx - 24, y + 122, fx - 13, y + 122, [163, 18, 18]);
  cv.triangle(fx + 13, y + 108, fx + 24, y + 122, fx + 13, y + 122, [163, 18, 18]);
  cv.circle(fx, y + 58, 7, [28, 63, 102]);
  cv.circle(fx, y + 58, 4, [135, 206, 250]);
  cv.rect(fx - 13, y + 76, 26, 3, [163, 18, 18]);
}
function drawFireScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, Math.floor(h * 0.4), [243, 156, 18]);
  cv.rect(x, y + Math.floor(h * 0.4), w, Math.floor(h * 0.35), [230, 126, 34]);
  cv.rect(x, y + Math.floor(h * 0.75), w, h - Math.floor(h * 0.75), [169, 50, 38]);
  // Sun.
  cv.circle(x + Math.floor(w * 0.78), y + 26, 14, [253, 235, 190]);
  // Smoke.
  cv.circle(x + Math.floor(w * 0.2), y + 34, 12, [120, 120, 120]);
  cv.circle(x + Math.floor(w * 0.3), y + 22, 9, [140, 140, 140]);
  cv.circle(x + Math.floor(w * 0.68), y + 44, 10, [120, 120, 120]);
  // Hills.
  cv.triangle(x, y + h, x + Math.floor(w * 0.45), y + 78, x + Math.floor(w * 0.9), y + h, [74, 44, 26]);
  cv.triangle(x + Math.floor(w * 0.4), y + h, x + w, y + 92, x + w, y + h, [58, 34, 20]);
  // Trees (dark silhouettes).
  for (const [tx, th] of [[0.08, 26], [0.86, 30], [0.62, 20]] as [number, number][]) {
    const bx = x + Math.floor(w * tx);
    const by = y + h - 8;
    cv.rect(bx - 2, by - th, 4, th, [30, 20, 12]);
    cv.circle(bx, by - th - 8, 11, [30, 20, 12]);
    cv.circle(bx - 8, by - th - 2, 7, [30, 20, 12]);
    cv.circle(bx + 8, by - th - 2, 7, [30, 20, 12]);
  }
  // Flames.
  for (const [fx, fw, fh] of [[0.3, 34, 52], [0.48, 26, 40], [0.66, 30, 46]] as [number, number, number][]) {
    const bx = x + Math.floor(w * fx);
    const by = y + h - 6;
    cv.triangle(bx - fw / 2, by, bx + fw / 2, by, bx, by - fh, [192, 57, 43]);
    cv.triangle(bx - fw / 3, by, bx + fw / 3, by, bx, by - fh * 0.7, [230, 126, 34]);
    cv.triangle(bx - fw / 5, by, bx + fw / 5, by, bx, by - fh * 0.45, [241, 196, 15]);
  }
}
function drawChartScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, [234, 242, 248]);
  // Grid lines.
  for (let gy = y + 24; gy < y + h - 18; gy += 24) cv.hline(x + 8, gy, w - 16, [200, 208, 216]);
  // Rising bars.
  const heights = [34, 48, 62, 80, 100];
  const bw = 36;
  const gap = 14;
  const bx0 = x + 22;
  const base = y + h - 22;
  for (let i = 0; i < 5; i++) {
    const bh = heights[i];
    const bx = bx0 + i * (bw + gap);
    const col: RGB = i === 4 ? [163, 18, 18] : i % 2 === 0 ? [46, 134, 193] : [26, 82, 118];
    cv.rect(bx, base - bh, bw, bh, col);
  }
  // Trend line with dots.
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    pts.push([bx0 + i * (bw + gap) + bw / 2, base - heights[i] - 12]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    cv.line(Math.round(pts[i][0]), Math.round(pts[i][1]), Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1]), [163, 18, 18]);
    cv.line(Math.round(pts[i][0]), Math.round(pts[i][1]) + 1, Math.round(pts[i + 1][0]), Math.round(pts[i + 1][1]) + 1, [163, 18, 18]);
  }
  for (const [px, py] of pts) cv.circle(Math.round(px), Math.round(py), 4, [163, 18, 18]);
  // Big figure, clear of the number badge at top-left.
  drawText(cv, x + 56, y + 10, 4, [163, 18, 18], "4.9%", true);
  drawText(cv, x + w - 118, y + 12, 1, [90, 90, 86], "OCT CPI, Y/Y", true);
  // Axis labels.
  drawText(cv, bx0 + 4, base + 6, 1, [90, 90, 86], "JUN");
  drawText(cv, bx0 + (bw + gap) * 2 + 4, base + 6, 1, [90, 90, 86], "AUG");
  drawText(cv, bx0 + (bw + gap) * 4 + 4, base + 6, 1, [90, 90, 86], "OCT");
}
// Round 3 lead scene 1: a container ship under a port crane (tariffs).
function drawShipScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  // Sky and sea.
  cv.rect(x, y, w, Math.floor(h * 0.62), [234, 242, 248]);
  cv.rect(x, y + Math.floor(h * 0.62), w, h - Math.floor(h * 0.62), [26, 82, 118]);
  cv.circle(x + w - 34, y + 22, 12, [241, 196, 15]);
  // Container stacks on deck (kept right of the number badge).
  const cols: RGB[] = [[163, 18, 18], [20, 90, 50], [185, 119, 14], [26, 82, 118], [125, 60, 152], [163, 18, 18]];
  const cw = 34;
  const chh = 13;
  const deckY = y + 84;
  for (let i = 0; i < 6; i++) {
    const bx = x + 44 + i * (cw + 3);
    const stack = i % 3 === 0 ? 3 : 2;
    for (let j = 0; j < stack; j++) {
      cv.rect(bx, deckY - (j + 1) * (chh + 2), cw, chh, cols[(i + j) % cols.length]);
    }
  }
  drawText(cv, x + 48, y + deckY - 3 * (chh + 2) + 3, 1, WHITE, "CHINA", true);
  // Hull with an angled bow.
  cv.rect(x + 34, deckY, w - 90, 15, [11, 30, 58]);
  cv.triangle(x + w - 56, deckY, x + w - 26, deckY + 7, x + w - 56, deckY + 15, [11, 30, 58]);
  cv.hline(x + 34, deckY + 15, w - 90, [163, 18, 18]);
  cv.hline(x + 34, deckY + 16, w - 90, [163, 18, 18]);
  // Port crane on the right.
  cv.rect(x + w - 44, y + 8, 5, deckY - y - 8, [60, 60, 60]);
  cv.rect(x + 150, y + 8, w - 150 - 39, 5, [60, 60, 60]);
  cv.vline(x + 248, y + 13, 22, [60, 60, 60]);
  cv.rect(x + 234, y + 35, 30, 13, [185, 119, 14]);
  // Tariff tag on the sea.
  cv.rect(x + w - 76, y + h - 17, 68, 13, [163, 18, 18]);
  drawText(cv, x + w - 72, y + h - 14, 1, WHITE, "UP TO 20%", true);
}
// Round 3 lead scene 2: a falling red line on a dark grid (Kospi crash).
function drawCrashScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, [11, 30, 58]);
  for (let gx = x + 20; gx < x + w - 8; gx += 26) cv.vline(gx, y + 6, h - 12, [28, 63, 102]);
  for (let gy = y + 18; gy < y + h - 8; gy += 22) cv.hline(x + 8, gy, w - 16, [28, 63, 102]);
  drawText(cv, x + 44, y + 8, 1, WHITE, "KOSPI 4,697.51", true);
  drawText(cv, x + w - 122, y + 8, 3, [255, 90, 80], "-6.2%", true);
  // The falling line, with one small bounce.
  const pts: [number, number][] = [
    [x + 18, y + 34], [x + 74, y + 52], [x + 128, y + 46],
    [x + 182, y + 76], [x + 236, y + 92], [x + w - 26, y + 106],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], [255, 90, 80]);
    cv.line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, [255, 90, 80]);
  }
  for (const [px, py] of pts) cv.circle(px, py, 3, [255, 90, 80]);
  // Worst-hit chip stocks.
  cv.rect(x + 14, y + h - 30, 8, 10, [255, 90, 80]);
  drawText(cv, x + 28, y + h - 29, 1, WHITE, "SK HYNIX -11.1%", true);
  cv.rect(x + 14, y + h - 16, 8, 10, [255, 90, 80]);
  drawText(cv, x + 28, y + h - 15, 1, WHITE, "SAMSUNG -9.9%", true);
}
// Round 3 lead scene 3: a space station over the Earth (Shenzhou-24).
function drawStationScene(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, [5, 10, 25]);
  for (let i = 0; i < 40; i++) {
    const sx = x + Math.floor(rnd() * w);
    const sy = y + Math.floor(rnd() * h * 0.6);
    cv.rect(sx, sy, 2, 2, WHITE);
  }
  // Earth arc at the bottom.
  cv.circle(x + Math.floor(w * 0.5), y + h + 138, 172, [46, 134, 193]);
  cv.ellipse(x + Math.floor(w * 0.3), y + h - 20, 30, 10, [39, 174, 96]);
  cv.ellipse(x + Math.floor(w * 0.7), y + h - 13, 22, 8, [39, 174, 96]);
  const cx = x + Math.floor(w * 0.5);
  const cy = y + 56;
  // Truss and solar wings.
  cv.rect(cx - 124, cy - 1, 248, 3, [180, 180, 180]);
  for (const side of [-1, 1]) {
    for (let p = 0; p < 3; p++) {
      const px = side === -1 ? cx - 122 + p * 21 : cx + 62 + p * 21;
      cv.rect(px, cy - 15, 19, 30, [26, 82, 118]);
      cv.vline(px + 9, cy - 15, 30, [135, 206, 250]);
      cv.hline(px, cy, 19, [135, 206, 250]);
    }
  }
  // Core module with two small flags (Pakistan green, China red).
  cv.rect(cx - 48, cy - 10, 96, 20, WHITE);
  cv.rect(cx - 48, cy - 10, 96, 3, [200, 200, 200]);
  cv.rect(cx - 34, cy - 4, 13, 9, [20, 120, 60]);
  cv.rect(cx + 21, cy - 4, 13, 9, [200, 30, 30]);
  cv.circle(cx, cy, 4, [90, 90, 86]);
  // Docked capsule at the front port.
  cv.circle(cx + 58, cy, 9, [220, 220, 220]);
  cv.triangle(cx + 64, cy - 7, cx + 64, cy + 7, cx + 80, cy, [163, 18, 18]);
  // A small dish.
  cv.circle(cx - 58, cy - 16, 6, [220, 220, 220]);
  cv.vline(cx - 58, cy - 10, 8, [180, 180, 180]);
  drawText(cv, x + 10, y + h - 14, 1, WHITE, "TIANGONG STATION", true);
}
// Small 22x22 icons for the twelve small cards.
function drawIcon(cv: Canvas, x: number, y: number, kind: string, c: RGB) {
  if (kind === "chart") {
    cv.rect(x + 2, y + 12, 4, 8, c);
    cv.rect(x + 9, y + 8, 4, 12, c);
    cv.rect(x + 16, y + 3, 4, 17, c);
  } else if (kind === "train") {
    cv.rect(x + 3, y + 2, 16, 14, c);
    cv.rect(x + 6, y + 5, 4, 4, WHITE);
    cv.rect(x + 12, y + 5, 4, 4, WHITE);
    cv.circle(x + 7, y + 18, 2, c);
    cv.circle(x + 15, y + 18, 2, c);
  } else if (kind === "parliament") {
    cv.triangle(x + 1, y + 8, x + 21, y + 8, x + 11, y + 1, c);
    cv.rect(x + 3, y + 9, 3, 11, c);
    cv.rect(x + 10, y + 9, 3, 11, c);
    cv.rect(x + 17, y + 9, 3, 11, c);
    cv.rect(x + 1, y + 20, 20, 2, c);
  } else if (kind === "flag") {
    cv.rect(x + 3, y + 1, 2, 20, c);
    cv.triangle(x + 5, y + 2, x + 20, y + 6, x + 5, y + 10, c);
  } else if (kind === "summit") {
    cv.rect(x + 4, y + 8, 14, 12, c);
    cv.rect(x + 7, y + 11, 3, 3, WHITE);
    cv.rect(x + 12, y + 11, 3, 3, WHITE);
    cv.rect(x + 10, y + 1, 2, 7, c);
    cv.triangle(x + 12, y + 1, x + 19, y + 4, x + 12, y + 7, c);
  } else if (kind === "talks") {
    cv.rect(x + 1, y + 2, 12, 9, c);
    cv.triangle(x + 4, y + 11, x + 8, y + 11, x + 4, y + 15, c);
    cv.rect(x + 9, y + 10, 12, 9, [90, 90, 86]);
    cv.triangle(x + 18, y + 19, x + 14, y + 19, x + 18, y + 15, [90, 90, 86]);
  } else if (kind === "ribbon") {
    cv.circle(x + 11, y + 8, 6, c);
    cv.circle(x + 11, y + 8, 3, WHITE);
    cv.triangle(x + 6, y + 12, x + 11, y + 12, x + 5, y + 21, c);
    cv.triangle(x + 12, y + 12, x + 17, y + 12, x + 18, y + 21, c);
  } else if (kind === "tower") {
    cv.triangle(x + 6, y + 14, x + 16, y + 14, x + 11, y + 1, c);
    cv.rect(x + 5, y + 14, 12, 7, c);
    cv.rect(x + 9, y + 16, 4, 4, WHITE);
  } else if (kind === "stars") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      cv.circle(Math.round(x + 11 + 8 * Math.cos(a)), Math.round(y + 11 + 8 * Math.sin(a)), 2, c);
    }
    cv.circle(x + 11, y + 11, 2, c);
  } else if (kind === "flame") {
    cv.triangle(x + 11, y + 1, x + 3, y + 16, x + 19, y + 16, c);
    cv.triangle(x + 11, y + 8, x + 7, y + 16, x + 15, y + 16, WHITE);
    cv.rect(x + 4, y + 16, 14, 4, c);
  } else if (kind === "bolt") {
    cv.triangle(x + 14, y + 1, x + 6, y + 13, x + 12, y + 13, c);
    cv.triangle(x + 12, y + 10, x + 17, y + 10, x + 8, y + 21, c);
  } else if (kind === "burst") {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const a1 = a - 0.35;
      const a2 = a + 0.35;
      cv.triangle(
        x + 11 + Math.round(4 * Math.cos(a1)), y + 11 + Math.round(4 * Math.sin(a1)),
        x + 11 + Math.round(4 * Math.cos(a2)), y + 11 + Math.round(4 * Math.sin(a2)),
        x + 11 + Math.round(10 * Math.cos(a)), y + 11 + Math.round(10 * Math.sin(a)), c
      );
    }
    cv.circle(x + 11, y + 11, 3, c);
  } else {
    drawText(cv, x + 5, y + 3, 2, c, "$", true);
  }
}
const ICONS: Record<number, string> = {
  4: "chart", 5: "flame", 6: "flag", 7: "train", 8: "parliament",
  9: "bolt", 10: "stars", 11: "burst", 12: "flame", 13: "dollar",
  14: "tower", 15: "parliament",
};

// ---------- dotted world map ----------
const CONTINENTS: [number, number][][] = [
  [[-168, 66], [-140, 70], [-125, 72], [-110, 73], [-95, 80], [-80, 73], [-65, 60], [-55, 52], [-60, 45], [-75, 35], [-80, 25], [-90, 20], [-97, 16], [-105, 20], [-115, 28], [-125, 40], [-140, 60], [-155, 58], [-165, 60]],
  [[-55, 60], [-42, 68], [-30, 76], [-22, 70], [-40, 60]],
  [[-80, 10], [-75, 5], [-60, 0], [-50, -5], [-35, -8], [-40, -20], [-50, -30], [-60, -38], [-70, -50], [-73, -40], [-75, -20], [-80, -5]],
  [[-10, 36], [-5, 44], [0, 46], [5, 55], [10, 58], [20, 60], [30, 70], [40, 68], [30, 60], [25, 45], [20, 40], [12, 44], [5, 44], [0, 40], [-5, 36]],
  [[-17, 15], [-10, 30], [0, 35], [10, 37], [20, 32], [30, 31], [35, 28], [40, 15], [48, 11], [51, 10], [43, 0], [40, -10], [35, -20], [30, -28], [20, -35], [15, -30], [12, -18], [9, -5], [9, 4], [-8, 4], [-13, 8], [-17, 15]],
  [[40, 68], [60, 70], [90, 75], [120, 73], [150, 70], [170, 66], [178, 65], [170, 60], [160, 55], [150, 45], [140, 40], [130, 35], [122, 30], [115, 22], [108, 10], [105, 5], [100, 8], [95, 15], [90, 22], [85, 20], [80, 8], [75, 10], [70, 25], [60, 25], [55, 28], [50, 30], [45, 35], [40, 40], [35, 45], [30, 60], [40, 68]],
  [[113, -22], [114, -30], [120, -34], [130, -32], [140, -38], [148, -40], [153, -32], [150, -22], [142, -11], [135, -12], [130, -13], [122, -14], [115, -20]],
  [[130, 31], [133, 34], [137, 35], [140, 38], [142, 42], [145, 44], [141, 45], [139, 40], [136, 36], [132, 33]],
  [[95, 5], [100, 0], [105, -5], [110, -7], [115, -8], [120, -9], [125, -8], [130, -3], [135, -4], [140, -8]],
  [[-5, 50], [-2, 53], [-3, 58], [0, 52], [-2, 50]],
];
// [story, lon, lat, nudgeX, nudgeY, region] — numbered pins for stories 1-15.
const PINS: [number, number, number, number, number, string][] = [
  [1, -77, 38.9, 0, 0, "N AMERICA"], [2, 127, 37.5, 0, 0, "EAST ASIA"],
  [3, 100.1, 40.6, -10, -8, "EAST ASIA"], [4, 149.1, -35.3, -12, -10, "OCEANIA"],
  [5, 148, -40.1, 8, 6, "OCEANIA"], [6, 160, -9.4, 0, 0, "OCEANIA"],
  [7, 127, 37.5, -16, 12, "EAST ASIA"], [8, 139.7, 35.7, 12, -10, "EAST ASIA"],
  [9, -0.1, 51.5, 0, 0, "EUROPE"], [10, 30.5, 50.4, 0, 0, "EUROPE"],
  [11, 34.3, 31.4, -8, -6, "MIDDLE EAST"], [12, 31.1, 30, 6, 8, "AFRICA"],
  [13, 90.4, 23.8, 0, 0, "SOUTH ASIA"], [14, 106.8, -6.6, 0, 0, "SE ASIA"],
  [15, 18.4, -33.9, 0, 0, "AFRICA"],
];
// Unnumbered dots for the brief stories that have a place.
const BRIEF_PINS: [number, number, number, string][] = [
  [17, -77, 38.9, "N AMERICA"], [18, 139.7, 35.7, "EAST ASIA"],
  [20, 45, 12.8, "MIDDLE EAST"], [21, 2.3, 48.9, "EUROPE"],
  [22, 127, 37.5, "EAST ASIA"], [23, 88.4, 22.6, "SOUTH ASIA"],
  [24, 85.3, 23.6, "SOUTH ASIA"], [25, 80.9, 26.8, "SOUTH ASIA"],
  [26, 6.1, 46.2, "EUROPE"], [27, 151.2, -33.9, "OCEANIA"],
  [28, 145, -37.8, "OCEANIA"], [29, 39.5, 13.5, "AFRICA"],
  [30, -0.2, 5.6, "AFRICA"], [31, -3.7, 40.4, "EUROPE"],
  [32, 2.3, 48.9, "EUROPE"], [33, 11.3, 44.5, "EUROPE"],
  [34, -77, 38.9, "N AMERICA"], [36, -74, 40.7, "N AMERICA"],
  [37, 6.1, 46.2, "EUROPE"], [38, 4.35, 50.8, "EUROPE"],
  [39, 37.6, 55.8, "EUROPE"], [40, 7.75, 48.6, "EUROPE"],
  [41, -77, 38.9, "N AMERICA"], [42, 125.8, 39, "EAST ASIA"],
  [43, 4.35, 50.8, "EUROPE"], [44, 2.3, 48.9, "EUROPE"],
  [45, 67.1, 24.9, "SOUTH ASIA"], [46, 77.2, 28.6, "SOUTH ASIA"],
  [47, 50.2, 26.6, "MIDDLE EAST"], [49, -75.5, 10.4, "LATIN AMERICA"],
  [50, -99.1, 19.4, "LATIN AMERICA"], [51, -51, -24.7, "LATIN AMERICA"],
  [52, 21, 52.2, "EUROPE"],
];
const TAG_COLORS: Record<Tag, RGB> = {
  REPORTED: [26, 82, 118],
  CONFIRMED: [20, 90, 50],
  ONGOING: [163, 18, 18],
  AHEAD: [97, 106, 107],
};
const SHORT_KICKER: Record<number, string> = {
  4: "CANBERRA - ECONOMY", 5: "FLINDERS ISLAND - ENVIRONMENT",
  6: "HONIARA - DIPLOMACY", 7: "SEOUL - TRANSPORT", 8: "TOKYO - POLITICS",
  9: "LONDON - ENERGY", 10: "KYIV - WAR", 11: "GAZA CITY - WAR",
  12: "GIZA - DISASTER", 13: "DHAKA - LABOUR", 14: "BOGOR - DISASTER",
  15: "CAPE TOWN - JUSTICE",
};

// ---------- page composition ----------
function drawLeadCard(cv: Canvas, x: number, y: number, s: Story, scene: (cv: Canvas, x: number, y: number, w: number, h: number) => void) {
  const W2 = 328;
  const H2 = 292;
  cv.rect(x, y, W2, H2, WHITE);
  cv.rect(x, y, W2, 4, REGION[s.region]);
  scene(cv, x + 1, y + 5, W2 - 2, 138);
  // Scenes must not spill below the illustration: repaint the text zone
  // white (a scene's Earth arc could otherwise flood the whole card).
  cv.rect(x + 1, y + 143, W2 - 2, H2 - 144, WHITE);
  cv.rect(x, y, W2, 1, [180, 175, 160]);
  cv.rect(x, y + H2 - 1, W2, 1, [180, 175, 160]);
  cv.rect(x, y, 1, H2, [180, 175, 160]);
  cv.rect(x + W2 - 1, y, 1, H2, [180, 175, 160]);
  // Number badge on the illustration.
  cv.circle(x + 20, y + 24, 12, REGION[s.region]);
  cv.ring(x + 20, y + 24, 12, WHITE);
  drawTextCentered(cv, x + 20, y + 18, 1, WHITE, String(s.n), true);
  // "Drawn scene" label, bottom-right of the illustration.
  cv.rect(x + W2 - 79, y + 127, 74, 12, [17, 17, 17]);
  drawText(cv, x + W2 - 75, y + 129, 1, WHITE, "DRAWN SCENE");
  // Kicker.
  drawText(cv, x + 6, y + 150, 1, REGION[s.region], `${s.place} - ${s.field}`, true);
  // Headline, up to 3 lines at scale 2.
  const headLines = wrapText(s.head, W2 - 12, 2).slice(0, 3);
  headLines.forEach((ln, i) => drawText(cv, x + 6, y + 166 + i * 16, 2, INK, ln, true));
  // Summary, up to 4 lines at scale 1.
  const sumLines = wrapText(s.sum, W2 - 12, 1).slice(0, 4);
  sumLines.forEach((ln, i) => drawText(cv, x + 6, y + 218 + i * 10, 1, INK, ln));
  // Why it matters (the leaders carry one on every lead card).
  if (s.why) {
    const lw = drawText(cv, x + 6, y + 262, 1, RED, "WHY IT MATTERS", true);
    drawText(cv, lw + 6, y + 262, 1, INK, s.why);
  }
  // Footer: status tag + source.
  const tw = drawTag(cv, x + 6, y + 276, s.tag, TAG_COLORS[s.tag]);
  drawText(cv, x + 6 + tw + 6, y + 278, 1, GREY, s.src);
}
function drawSmallCard(cv: Canvas, x: number, y: number, s: Story) {
  const W2 = 245;
  const H2 = 82;
  cv.rect(x, y, W2, H2, WHITE);
  cv.rect(x, y, W2, 1, [180, 175, 160]);
  cv.rect(x, y + H2 - 1, W2, 1, [180, 175, 160]);
  cv.rect(x, y, 1, H2, [180, 175, 160]);
  cv.rect(x + W2 - 1, y, 1, H2, [180, 175, 160]);
  cv.rect(x, y, W2, 4, REGION[s.region]);
  drawIcon(cv, x + W2 - 26, y + 7, ICONS[s.n], REGION[s.region]);
  drawText(cv, x + 6, y + 7, 1, REGION[s.region], `${s.n} ${SHORT_KICKER[s.n]}`, true);
  // Headline wraps in the width left of the icon, at most 2 lines.
  const headLines = wrapText(s.head, W2 - 12 - 28, 2).slice(0, 2);
  headLines.forEach((ln, i) => drawText(cv, x + 6, y + 19 + i * 15, 2, INK, ln, true));
  const sumLines = wrapText(s.sum, W2 - 12, 1).slice(0, 2);
  sumLines.forEach((ln, i) => drawText(cv, x + 6, y + 51 + i * 9, 1, INK, ln));
  const tw = drawTag(cv, x + 6, y + 69, s.tag, TAG_COLORS[s.tag]);
  drawText(cv, x + 6 + tw + 6, y + 71, 1, GREY, s.src);
}
function drawMap(cv: Canvas, x0: number, y0: number, w: number, h: number) {
  const toX = (lon: number) => x0 + ((lon + 180) / 360) * w;
  const toY = (lat: number) => y0 + ((90 - lat) / 150) * h;
  for (let gx = 0; gx <= w; gx += 5) {
    for (let gy = 0; gy <= h; gy += 5) {
      const lon = (gx / w) * 360 - 180;
      const lat = 90 - (gy / h) * 150;
      for (const poly of CONTINENTS) {
        if (insidePoly(lon, lat, poly)) {
          cv.rect(x0 + gx, y0 + gy, 2, 2, [120, 145, 118]);
          break;
        }
      }
    }
  }
  for (const [, lon, lat, region] of BRIEF_PINS) {
    cv.circle(Math.round(toX(lon)), Math.round(toY(lat)), 2, REGION[region]);
  }
  for (const [n, lon, lat, dx, dy, region] of PINS) {
    const px = Math.round(toX(lon)) + dx;
    const py = Math.round(toY(lat)) + dy;
    cv.circle(px, py, 8, WHITE);
    cv.circle(px, py, 7, REGION[region]);
    const label = String(n);
    drawText(cv, Math.round(px - textWidth(label, 1) / 2), py - 3, 1, WHITE, label, true);
  }
}
function drawPage(cv: Canvas) {
  const totalStories = LEADS.length + SMALL.length + BRIEFS.length;
  // Black top bar with the counts (the leaders all lead with this).
  cv.rect(0, 0, 1024, 22, BLACK);
  drawText(cv, 12, 4, 2, WHITE, "THE WORLD IN ONE DAY", true);
  drawTextCentered(cv, 512, 4, 2, [255, 120, 110], `${totalStories} STORIES - ${REGIONS.length} REGIONS - ${FIELD_LIST.length} FIELDS`, true);
  drawText(cv, 1024 - 12 - textWidth("ALL FIRST REPORTED WED 25 NOV", 1), 8, 1, WHITE, "ALL FIRST REPORTED WED 25 NOV", true);
  // Giant date headline.
  drawTextCentered(cv, 512, 27, 5, INK, "WEDNESDAY 25 NOVEMBER 2026", true);
  // Red kicker with the three lead headlines.
  drawTextCentered(cv, 512, 68, 2, RED, "Tariffs on 14 economies | Kospi -6.2% | Pakistan's first astronaut docks", true);
  // Region tally strip: 10 segments.
  REGIONS.forEach(([name, count], i) => {
    const cx = 12 + i * 100;
    cv.rect(cx, 88, 98, 20, REGION[name]);
    drawTextCentered(cv, cx + 49, 94, 1, WHITE, `${REGION_SHORT[name]} ${count}`, true);
  });
  // Field taxonomy line, computed from the data.
  drawTextCentered(cv, 512, 113, 1, INK, FIELDS_LINE);
  // Stat strip: six giant numbers.
  cv.hline(12, 125, 1000, INK);
  STATS.forEach(([big, label], i) => {
    const sx = 12 + i * 166;
    drawText(cv, sx + 2, 130, 3, RED, big, true);
    wrapText(label, 158, 1).slice(0, 2).forEach((ln, j) =>
      drawText(cv, sx + 2, 154 + j * 9, 1, INK, ln)
    );
  });
  cv.hline(12, 174, 1000, INK);
  // UTC timeline strip (ticks evenly spaced, in order, not to scale).
  TIMELINE.forEach(([t, label], i) => {
    const tx = Math.round(12 + (i * 1000) / (TIMELINE.length - 1));
    const tw1 = textWidth(t, 1);
    drawText(cv, Math.max(12, Math.min(1012 - tw1, tx - Math.round(tw1 / 2))), 180, 1, RED, t, true);
    cv.vline(tx, 192, 9, INK);
    cv.circle(tx, 196, 3, RED);
    const tw2 = textWidth(label, 1);
    drawText(cv, Math.max(12, Math.min(1012 - tw2, tx - Math.round(tw2 / 2))), 204, 1, INK, label);
  });
  // Three lead cards with the new drawn scenes.
  const scenes = [drawShipScene, drawCrashScene, drawStationScene];
  LEADS.forEach((s, i) => drawLeadCard(cv, 12 + i * 336, 218, s, scenes[i]));
  // Twelve small cards: 4 columns x 3 rows.
  SMALL.forEach((s, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    drawSmallCard(cv, 12 + col * 251, 518 + row * 88, s);
  });
  // Bottom section: pin map (left) and the ALSO briefs in 3 columns.
  drawText(cv, 12, 782, 1, INK, "WHERE IT HAPPENED - PINS ARE STORY NUMBERS", true);
  drawMap(cv, 12, 796, 296, 120);
  drawText(cv, 12, 922, 1, GREY, "Dots: brief stories 16-52 with a place");
  drawText(cv, 12, 932, 1, GREY, "Tags: REPORTED named outlet - CONFIRMED official");
  drawText(cv, 316, 782, 1, INK, `ALSO ON WEDNESDAY 25 NOVEMBER - ${BRIEFS.length} MORE STORIES`, true);
  const perCol = Math.ceil(BRIEFS.length / 3);
  BRIEFS.forEach((b, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const bx = 316 + col * 236;
    const by = 796 + row * 11;
    drawText(cv, bx, by, 1, RED, String(b.n), true);
    drawText(cv, bx + 16, by, 1, INK, b.text);
  });
  // Footer: red-bordered DATE CHECK box, then the sources line.
  const dcLines = [...wrapText(DATE_CHECK, 976, 1), DATE_LINE];
  const boxTop = 944;
  const boxBottom = boxTop + 6 + dcLines.length * 9 + 3;
  cv.rect(12, boxTop, 1000, 1, RED);
  cv.rect(12, boxBottom, 1000, 1, RED);
  cv.rect(12, boxTop, 1, boxBottom - boxTop, RED);
  cv.rect(1011, boxTop, 1, boxBottom - boxTop, RED);
  dcLines.forEach((ln, i) => drawText(cv, 18, boxTop + 5 + i * 9, 1, INK, ln));
  let fy = boxBottom + 5;
  for (const ln of wrapText(SOURCES, 1000, 1)) {
    drawText(cv, 12, fy, 1, GREY, ln);
    fy += 9;
  }
}

function main() {
  const cv = new Canvas();
  drawPage(cv);
  const png = encodePNG(cv.buf, W, H);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}
main();
