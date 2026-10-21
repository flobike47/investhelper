#!/usr/bin/env node
/**
 * Génère les icônes PNG de la PWA à partir du motif du favicon (courbe
 * montante verte sur fond sombre), sans dépendance : rendu vectoriel
 * anticrénelé (suréchantillonnage 4×4) + encodeur PNG minimal (zlib natif).
 *
 *   node scripts/generate-icons.mjs
 *
 * Sorties dans public/icons/ :
 *  - apple-touch-icon.png (180)  : iOS arrondit lui-même les coins → carré plein, opaque
 *  - icon-192.png / icon-512.png : purpose "any"
 *  - icon-maskable-512.png       : purpose "maskable", motif dans la zone sûre (80 %)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x0b, 0x0d, 0x12];
const FG = [0x22, 0xc5, 0x5e];

// Motif du favicon, repère 32×32 (cf. public/favicon.svg)
const POINTS = [
  [5, 22],
  [12, 14],
  [17, 18],
  [27, 7],
];
const STROKE = 2.5;
const DOT = { x: 27, y: 7, r: 2 };

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Couverture du motif au point (x, y) du repère 32×32 : 0 ou 1. */
function inGlyph(x, y) {
  if (Math.hypot(x - DOT.x, y - DOT.y) <= DOT.r) return true;
  for (let i = 0; i < POINTS.length - 1; i++) {
    // Extrémités arrondies : distance au segment ≤ demi-épaisseur
    if (distToSegment(x, y, POINTS[i], POINTS[i + 1]) <= STROKE / 2) return true;
  }
  return false;
}

/**
 * @param size  côté en px
 * @param scale part du côté occupée par le repère 32×32 du motif (1 = pleine taille)
 */
function render(size, scale) {
  const SS = 4; // suréchantillonnage par axe
  const px = new Uint8Array(size * size * 3);
  const unit = (size * scale) / 32; // px par unité du repère
  const offset = (size - 32 * unit) / 2;
  // Le motif du favicon n'est pas centré dans son repère (x 3.75→29, y 5→23.25) :
  // on recentre sa boîte englobante.
  const cx = (3.75 + 29) / 2;
  const cy = (5 + 23.25) / 2;
  const shiftX = (16 - cx) * unit;
  const shiftY = (16 - cy) * unit;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS - offset - shiftX) / unit;
          const gy = (y + (sy + 0.5) / SS - offset - shiftY) / unit;
          if (inGlyph(gx, gy)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
  }
  return px;
}

// ---- Encodeur PNG minimal (RGB 8 bits, sans entrelacement) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtre « none »
    Buffer.from(rgb.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, scale: 0.78 },
  { file: 'icon-192.png', size: 192, scale: 0.78 },
  { file: 'icon-512.png', size: 512, scale: 0.78 },
  // Zone sûre maskable = cercle de 80 % : motif plus petit
  { file: 'icon-maskable-512.png', size: 512, scale: 0.6 },
];

mkdirSync(OUT, { recursive: true });
for (const { file, size, scale } of ICONS) {
  writeFileSync(join(OUT, file), encodePng(size, render(size, scale)));
  console.log(`✓ ${file} (${size}×${size})`);
}
