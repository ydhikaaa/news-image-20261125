// news-image-20261125 — "The World in One Day"
// A pure-TypeScript program that draws a 1024x1024 newspaper front page
// summing up Wednesday 25 November 2026, using only the Node standard
// library. Every story was verified against a named source dated 25 Nov
// 2026 (UTC) or scheduled for that day; 24 Nov stories are named only in
// the DATE CHECK footer. The PNG encoder is hand-written (zlib via
// node:zlib, CRC32 by hand) so two runs produce byte-identical output.
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
  "EAST ASIA": [125, 60, 152],
  OCEANIA: [26, 82, 118],
  "SOUTH ASIA": [185, 119, 14],
  EUROPE: [20, 90, 50],
  AMERICAS: [146, 43, 33],
  "MIDDLE EAST": [147, 81, 22],
  AFRICA: [20, 143, 119],
  WORLD: [97, 106, 107],
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
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxW) {
      cur = test;
    } else {
      if (cur !== "") lines.push(cur);
      // A single over-long word: hard-split it.
      if (textWidth(w, scale) > maxW) {
        let part = "";
        for (const ch of w) {
          if (textWidth(part + ch, scale) > maxW) {
            lines.push(part);
            part = ch;
          } else part += ch;
        }
        cur = part;
      } else cur = w;
    }
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
}
const LEADS: Story[] = [
  {
    n: 1, place: "JIUQUAN, CHINA", field: "SPACE", region: "EAST ASIA",
    head: "Shenzhou-24 lifts off with China's first foreign astronaut",
    sum: "A Long March-2F rocket rose from Jiuquan at 00:18 UTC carrying Pakistan's Muhammad Zeeshan Ali beside Tang Hongbo and Wu Yi. Ali is the first Pakistani in orbit and the first foreign visitor to Tiangong station.",
    src: "Reuters - Xinhua", tag: "CONFIRMED",
  },
  {
    n: 2, place: "FLINDERS ISLAND, TASMANIA", field: "BUSHFIRE", region: "OCEANIA",
    head: "Bushfire emergency: too late to leave on Flinders Island",
    sum: "Tasmania Fire Service raised the warning to Emergency for Killiecrankie, Leeka and Mount Tanner as a lightning fire burning about 3,000 hectares threatened homes. Residents were told to shelter.",
    src: "Tas Fire Service - ABC", tag: "ONGOING",
  },
  {
    n: 3, place: "CANBERRA, AUSTRALIA", field: "ECONOMY", region: "OCEANIA",
    head: "Australia inflation jumps to 4.9%, a three-year high",
    sum: "October CPI came in hotter than the 4.8% forecast, with the trimmed mean at 3.8% and Perth at 5.5%. The Reserve Bank meets on 8 December with another rate rise now in view.",
    src: "ABS - Reuters", tag: "CONFIRMED",
  },
];
const SMALL: Story[] = [
  {
    n: 4, place: "SEOUL, SOUTH KOREA", field: "MARKETS", region: "EAST ASIA",
    head: "AI stocks slide as Asia opens lower",
    sum: "Seoul's Kospi fell sharply after Wall Street's AI rout.",
    src: "Yonhap", tag: "REPORTED",
  },
  {
    n: 5, place: "SEOUL, SOUTH KOREA", field: "TRANSPORT", region: "EAST ASIA",
    head: "Seoul subway strike called off",
    sum: "A 04:15 deal shelved 2,212 cuts and promised 500 hires.",
    src: "Yonhap", tag: "CONFIRMED",
  },
  {
    n: 6, place: "TOKYO, JAPAN", field: "POLITICS", region: "EAST ASIA",
    head: "Takaichi faces censure motion",
    sum: "Six parties moved to censure minister Seki over fundraising.",
    src: "Nikkei Asia", tag: "ONGOING",
  },
  {
    n: 7, place: "HONIARA, SOLOMON ISLANDS", field: "DIPLOMACY", region: "OCEANIA",
    head: "Australia-Solomons sign security pact",
    sum: "Canberra becomes defence partner of choice.",
    src: "Reuters", tag: "CONFIRMED",
  },
  {
    n: 8, place: "BRUSSELS, BELGIUM", field: "SUMMIT", region: "EUROPE",
    head: "EU-Western Balkans summit opens",
    sum: "Costa and von der Leyen host six partners in Brussels.",
    src: "European Council", tag: "AHEAD",
  },
  {
    n: 9, place: "MOSCOW, RUSSIA", field: "DIPLOMACY", region: "EUROPE",
    head: "Putin to hold talks with Brunei Sultan",
    sum: "Talks focus on dialogue and economic ties.",
    src: "Kremlin", tag: "AHEAD",
  },
  {
    n: 10, place: "CANBERRA, AUSTRALIA", field: "RIGHTS", region: "OCEANIA",
    head: "Australia apologises to veterans",
    sum: "Formal apology to LGBTQ veterans for decades of bias.",
    src: "Reuters", tag: "CONFIRMED",
  },
  {
    n: 11, place: "SHANGHAI, CHINA", field: "POLITICS", region: "EAST ASIA",
    head: "Shanghai pledges loyalty",
    sum: "City vows to see the Chen Jining inquiry through.",
    src: "Reuters", tag: "REPORTED",
  },
  {
    n: 12, place: "STRASBOURG, FRANCE", field: "MIGRATION", region: "EUROPE",
    head: "EU briefs on migration and border funds",
    sum: "MEPs brief press at 11:00 CET on migration and border funds.",
    src: "European Parliament", tag: "AHEAD",
  },
  {
    n: 13, place: "WASHINGTON, USA", field: "ECONOMY", region: "AMERICAS",
    head: "US data pile due at 13:30 UTC",
    sum: "Last big data before the Fed's December meeting.",
    src: "BEA - Labor Dept", tag: "AHEAD",
  },
];
interface Brief { n: number; text: string; }
const BRIEFS: Brief[] = [
  { n: 14, text: "16 Days begins - UN Women" },
  { n: 15, text: "Trump meets Rutte - White House" },
  { n: 16, text: "Japan service prices, 36-yr high" },
  { n: 17, text: "Dollar steadies; gold $3,544" },
  { n: 18, text: "Houthis 60 km from Aden" },
  { n: 19, text: "Sarkozy trial in Libya case - BBC" },
  { n: 20, text: "Korea crypto bill, 20% cap - FSC" },
  { n: 21, text: "Kolkata infant refused certificate" },
  { n: 22, text: "Jharkhand chief justice - Hindu" },
  { n: 23, text: "Samajwadi names 5 UP candidates" },
  { n: 24, text: "UN business forum, Geneva - UN" },
  { n: 25, text: "Jury retires in murder trial - ABC" },
  { n: 26, text: "Netball stars oppose rule change" },
  { n: 27, text: "Cekaj v Siniakov, game two - ABC" },
  { n: 28, text: "Tigray opens 16 Days - TIMRRA" },
  { n: 29, text: "Germany-Africa summit ends" },
  { n: 30, text: "Spain snap-poll, final week" },
  { n: 31, text: "PSG host Roma in Champions League" },
  { n: 32, text: "Davis Cup: Italy v S Korea - ITF" },
  { n: 33, text: "Fed Beige Book released - Fed" },
  { n: 34, text: "Kutryk's daughter, from the ISS" },
];
const TIMELINE: [string, string][] = [
  ["00:18", "Shenzhou-24"],
  ["00:30", "Aus CPI out"],
  ["11:00", "EU migration"],
  ["13:30", "US data pile"],
  ["17:00", "EU-Balkans"],
  ["19:00", "Beige Book"],
  ["21:00", "Trump-Rutte"],
];
const NUMBERS: [string, string, string][] = [
  ["4.9%", "Australia Oct CPI,", "a three-year high"],
  ["3,000 ha", "Flinders Island", "fire area"],
  ["2,212", "Seoul Metro jobs", "saved from cuts"],
  ["16", "days of activism", "starting today"],
];
const REGIONS: [string, number][] = [
  ["EAST ASIA", 7], ["OCEANIA", 6], ["SOUTH ASIA", 3], ["EUROPE", 8],
  ["AMERICAS", 3], ["MIDDLE EAST", 1], ["AFRICA", 2], ["WORLD", 4],
];
const DATE_CHECK =
  "DATE CHECK - Left out because they happened on 24 November: COP31 closes with no deal; Houthi drone hits Riyadh tower, 11 hurt; Huawei guilty in US trade-secrets trial; Israel's Democrats halt coalition talks; White House turkey pardon; Nikkei +3.9% to 58,644; Zaporizhzhia flats strike, 2 dead; Cartagena supermarket hostages; CAS gives AFCON title to Senegal; Bank of Korea rate call.";
const SOURCES =
  "Sources: Reuters - Yonhap - ABC News - Nikkei Asia - The Hindu - European Council - Kremlin - European Parliament - ABS - UN Women - BBC - France 24 - Federal Reserve - UEFA - ITF - SpaceQ";
const FOOTNOTE =
  "Every story dated Wednesday 25 November 2026 (UTC). Illustrations are drawings, not photographs.";

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
// Small 22x22 icons for the ten small cards.
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
  } else {
    drawText(cv, x + 5, y + 3, 2, c, "$", true);
  }
}
const ICONS: Record<number, string> = {
  4: "chart", 5: "train", 6: "parliament", 7: "flag", 8: "summit",
  9: "talks", 10: "ribbon", 11: "tower", 12: "stars", 13: "dollar",
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
// [story, lon, lat, nudgeX, nudgeY, region] — numbered pins for stories 1-13.
const PINS: [number, number, number, number, number, string][] = [
  [1, 100, 40, -8, -12, "EAST ASIA"], [2, 148, -40, 0, 0, "OCEANIA"],
  [3, 149, -35, 0, 0, "OCEANIA"], [4, 127, 37, 0, 0, "EAST ASIA"],
  [5, 127, 37, -16, -12, "EAST ASIA"], [6, 139, 36, 14, -12, "EAST ASIA"],
  [7, 160, -9, 0, 0, "OCEANIA"], [8, 4, 51, 0, 0, "EUROPE"],
  [9, 37, 56, 0, 0, "EUROPE"], [10, 149, -35, 14, 10, "OCEANIA"],
  [11, 121, 31, -16, 10, "EAST ASIA"], [12, 7.7, 48.6, 0, 0, "EUROPE"],
  [13, -77, 39, 0, 0, "AMERICAS"],
];
// Unnumbered dots for the brief stories that have a place.
const BRIEF_PINS: [number, number, number, string][] = [
  [15, -80, 27, "AMERICAS"], [16, 139, 36, "EAST ASIA"], [18, 45, 13, "MIDDLE EAST"],
  [19, 2.3, 48.9, "EUROPE"], [20, 127, 37, "EAST ASIA"], [21, 88, 22.5, "SOUTH ASIA"],
  [22, 85, 23, "SOUTH ASIA"], [23, 81, 27, "SOUTH ASIA"], [24, 6, 46, "EUROPE"],
  [25, 151, -34, "OCEANIA"], [26, 145, -38, "OCEANIA"], [28, 39.5, 13.5, "AFRICA"],
  [29, -0.2, 5.6, "AFRICA"], [30, -3.7, 40.4, "EUROPE"], [31, 2.3, 48.9, "EUROPE"],
  [32, 11.3, 44.5, "EUROPE"], [33, -77, 39, "AMERICAS"],
];
const TAG_COLORS: Record<Tag, RGB> = {
  REPORTED: [26, 82, 118],
  CONFIRMED: [20, 90, 50],
  ONGOING: [163, 18, 18],
  AHEAD: [97, 106, 107],
};
const SHORT_KICKER: Record<number, string> = {
  4: "SEOUL - MARKETS", 5: "SEOUL - TRANSPORT", 6: "TOKYO - POLITICS",
  7: "HONIARA - DIPLOMACY", 8: "BRUSSELS - SUMMIT", 9: "MOSCOW - DIPLOMACY",
  10: "CANBERRA - RIGHTS", 11: "SHANGHAI - POLITICS", 12: "STRASBOURG - MIGRATION",
  13: "WASHINGTON - ECONOMY",
};

// ---------- page composition ----------
function drawLeadCard(cv: Canvas, x: number, y: number, s: Story, scene: (cv: Canvas, x: number, y: number, w: number, h: number) => void) {
  const W2 = 328;
  const H2 = 330;
  cv.rect(x, y, W2, H2, WHITE);
  cv.rect(x, y, W2, 4, REGION[s.region]);
  scene(cv, x + 1, y + 5, W2 - 2, 181);
  // Scenes must not spill below the illustration: repaint the text zone
  // white (the rocket scene's Earth arc used to flood the whole card).
  cv.rect(x + 1, y + 186, W2 - 2, H2 - 187, WHITE);
  cv.rect(x, y, W2, 1, [180, 175, 160]);
  cv.rect(x, y + H2 - 1, W2, 1, [180, 175, 160]);
  cv.rect(x, y, 1, H2, [180, 175, 160]);
  cv.rect(x + W2 - 1, y, 1, H2, [180, 175, 160]);
  // Number badge on the illustration.
  cv.circle(x + 20, y + 24, 12, REGION[s.region]);
  cv.ring(x + 20, y + 24, 12, WHITE);
  drawTextCentered(cv, x + 20, y + 18, 1, WHITE, String(s.n), true);
  // "Drawn scene" label, bottom-right of the illustration.
  cv.rect(x + W2 - 79, y + 170, 74, 12, [17, 17, 17]);
  drawText(cv, x + W2 - 75, y + 172, 1, WHITE, "DRAWN SCENE");
  // Kicker.
  drawText(cv, x + 6, y + 192, 1, REGION[s.region], `${s.place} - ${s.field}`, true);
  // Headline, up to 3 lines at scale 2.
  const headLines = wrapText(s.head, W2 - 12, 2).slice(0, 3);
  headLines.forEach((ln, i) => drawText(cv, x + 6, y + 208 + i * 16, 2, INK, ln, true));
  // Summary, up to 5 lines at scale 1.
  const sumLines = wrapText(s.sum, W2 - 12, 1).slice(0, 5);
  sumLines.forEach((ln, i) => drawText(cv, x + 6, y + 260 + i * 11, 1, INK, ln));
  // Footer: status tag + source.
  const tw = drawTag(cv, x + 6, y + 318, s.tag, TAG_COLORS[s.tag]);
  drawText(cv, x + 6 + tw + 6, y + 320, 1, GREY, s.src);
}
function drawSmallCard(cv: Canvas, x: number, y: number, s: Story) {
  const W2 = 196;
  const H2 = 114;
  cv.rect(x, y, W2, H2, WHITE);
  cv.rect(x, y, W2, 1, [180, 175, 160]);
  cv.rect(x, y + H2 - 1, W2, 1, [180, 175, 160]);
  cv.rect(x, y, 1, H2, [180, 175, 160]);
  cv.rect(x + W2 - 1, y, 1, H2, [180, 175, 160]);
  cv.rect(x, y, W2, 4, REGION[s.region]);
  drawIcon(cv, x + W2 - 26, y + 8, ICONS[s.n], REGION[s.region]);
  drawText(cv, x + 6, y + 8, 1, REGION[s.region], `${s.n} ${SHORT_KICKER[s.n]}`, true);
  // Headline wraps in the width left of the icon, at most 3 lines.
  const headLines = wrapText(s.head, W2 - 12 - 28, 2).slice(0, 3);
  headLines.forEach((ln, i) => drawText(cv, x + 6, y + 22 + i * 15, 2, INK, ln, true));
  const sumLines = wrapText(s.sum, W2 - 12, 1).slice(0, 2);
  sumLines.forEach((ln, i) => drawText(cv, x + 6, y + 70 + i * 9, 1, INK, ln));
  const tw = drawTag(cv, x + 6, y + 94, s.tag, TAG_COLORS[s.tag]);
  drawText(cv, x + 6 + tw + 6, y + 96, 1, GREY, s.src);
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
  // Top strip.
  drawText(cv, 12, 4, 2, INK, "THE WORLD IN ONE DAY", true);
  drawTextCentered(cv, 512, 4, 2, RED, "34 STORIES - 8 REGIONS - ONE DAY", true);
  drawText(cv, 1024 - 12 - textWidth("ALL TIMES UTC", 2), 4, 2, INK, "ALL TIMES UTC", true);
  cv.hline(12, 24, 1000, INK);
  // Giant date headline.
  drawTextCentered(cv, 512, 30, 5, INK, "WEDNESDAY 25 NOVEMBER 2026", true);
  // Red sub-headline.
  drawTextCentered(cv, 512, 72, 2, RED, "Shenzhou-24 lifts off | Australia CPI 4.9% | Flinders fire: too late to leave", true);
  // Region bar: 8 chips.
  REGIONS.forEach(([name, count], i) => {
    const cx = 2 + i * 128;
    const label = name === "MIDDLE EAST" ? "MID EAST" : name;
    cv.rect(cx, 92, 124, 44, REGION[name]);
    drawTextCentered(cv, cx + 62, 97, 2, WHITE, label, true);
    drawTextCentered(cv, cx + 62, 116, 3, WHITE, String(count), true);
  });
  // UTC timeline strip (ticks evenly spaced, in order, not to scale).
  // No title text: the top strip already says ALL TIMES UTC, and a title
  // here collided with the first time label.
  cv.hline(12, 156, 1000, INK);
  TIMELINE.forEach(([t, label], i) => {
    const tx = Math.round(12 + (i * 1000) / (TIMELINE.length - 1));
    cv.vline(tx, 152, 9, INK);
    cv.circle(tx, 156, 3, RED);
    const tw1 = textWidth(t, 1);
    drawText(cv, Math.max(12, Math.min(1012 - tw1, tx - Math.round(tw1 / 2))), 142, 1, RED, t, true);
    const tw2 = textWidth(label, 1);
    drawText(cv, Math.max(12, Math.min(1012 - tw2, tx - Math.round(tw2 / 2))), 164, 1, INK, label);
  });
  // Three lead cards.
  const scenes = [drawRocketScene, drawFireScene, drawChartScene];
  LEADS.forEach((s, i) => drawLeadCard(cv, 12 + i * 336, 176, s, scenes[i]));
  // Ten small cards: 5 columns x 2 rows.
  SMALL.forEach((s, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    drawSmallCard(cv, 12 + col * 201, 514 + row * 122, s);
  });
  // Bottom section.
  // Map (left).
  drawText(cv, 12, 762, 1, INK, "WHERE IT HAPPENED - PINS ARE STORY NUMBERS", true);
  drawMap(cv, 12, 780, 296, 136);
  drawText(cv, 12, 922, 1, GREY, "REPORTED: carried by a named outlet");
  drawText(cv, 12, 932, 1, GREY, "ONGOING: still unfolding");
  drawText(cv, 12, 942, 1, GREY, "AHEAD: due later today");
  // Also-on list (middle, two columns).
  drawText(cv, 316, 762, 1, INK, "ALSO ON WEDNESDAY 25 NOVEMBER 2026 - 21 MORE STORIES", true);
  BRIEFS.forEach((b, i) => {
    const col = i < 11 ? 0 : 1;
    const row = i < 11 ? i : i - 11;
    const bx = 316 + col * 220;
    const by = 780 + row * 13;
    drawText(cv, bx, by, 1, RED, String(b.n), true);
    drawText(cv, bx + 16, by, 1, INK, b.text);
  });
  // The day in numbers (right).
  drawText(cv, 756, 762, 1, INK, "THE DAY IN NUMBERS", true);
  NUMBERS.forEach(([big, l1, l2], i) => {
    const ny = 782 + i * 42;
    drawText(cv, 756, ny, 3, RED, big, true);
    drawText(cv, 756, ny + 24, 1, INK, l1);
    drawText(cv, 756, ny + 33, 1, INK, l2);
  });
  // Date check + sources + footnote, wrapped and stacked dynamically.
  let fy = 954;
  for (const ln of wrapText(DATE_CHECK, 1000, 1)) {
    drawText(cv, 12, fy, 1, INK, ln);
    fy += 10;
  }
  fy += 4;
  for (const ln of wrapText(SOURCES, 1000, 1)) {
    drawText(cv, 12, fy, 1, GREY, ln);
    fy += 10;
  }
  fy += 4;
  drawText(cv, 12, fy, 1, GREY, FOOTNOTE);
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
