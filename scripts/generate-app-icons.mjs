#!/usr/bin/env node
/**
 * Gera os ícones da app a partir de duas fontes em `scripts/assets/`:
 *
 * - `blueberries-emoji.png` — o emoji dos mirtilos (a marca), sobre o
 *   gradiente azul da app com uma luz por trás (os mirtilos são azuis: sem a
 *   luz perdiam-se no fundo) e uma sombra leve.
 * - `blueberries-glyph.svg` — a silhueta para o ícone pequeno das
 *   notificações no Android (barra de estado). O Android só usa o recorte
 *   (alfa) e pinta-o de branco — o emoji a cores ficava uma mancha branca.
 *
 * Uso: `node scripts/generate-app-icons.mjs` — reescreve os ficheiros em
 * `public/`. Tamanhos:
 *   android-chrome-*  (manifest, "any")     emoji a 64%
 *   icon-maskable-*   (manifest, "maskable") emoji a 52% — cabe na zona
 *                      segura (círculo de 80%) que o Android recorta
 *   apple-touch-icon* (iPhone/iPad)          emoji a 62%, quadrado cheio (o
 *                      iOS arredonda os cantos e não aceita transparência)
 *   favicon-*, .ico   (separador do browser) emoji a 78%, cantos arredondados
 *   notification-badge.png                   silhueta branca, 96×96
 */

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const EMOJI = 'scripts/assets/blueberries-emoji.png';
const GLYPH = 'scripts/assets/blueberries-glyph.svg';
const OUT = 'public';

/** Fundo: gradiente da marca (primary-500 → 700 → 900) + luz atrás do emoji. */
function background(size, radius = 0) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b82f6"/>
        <stop offset="0.6" stop-color="#1d4ed8"/>
        <stop offset="1" stop-color="#1e3a8a"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.5" r="0.4">
        <stop offset="0" stop-color="#dbeafe" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#dbeafe" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100" height="100" rx="${radius}" fill="url(#g)"/>
    <rect width="100" height="100" rx="${radius}" fill="url(#glow)"/>
  </svg>`);
}

async function appIcon(size, scale, { radius = 0 } = {}) {
  const e = Math.round(size * scale);
  const off = Math.round((size - e) / 2);
  const emoji = await sharp(EMOJI).resize(e, e).png().toBuffer();
  const shadow = await sharp(EMOJI)
    .resize(e, e)
    .ensureAlpha()
    .linear([0, 0, 0, 0.45], [0, 0, 0, 0]) // preto, alfa a 45%
    .blur(Math.max(0.6, size / 60))
    .png()
    .toBuffer();
  return sharp(background(size, radius))
    .composite([
      { input: shadow, left: off, top: off + Math.max(1, Math.round(size * 0.02)) },
      { input: emoji, left: off, top: off },
    ])
    .png()
    .toBuffer();
}

/** `.ico` com PNGs lá dentro (formato aceite por todos os browsers atuais). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  const write = async (name, data) => {
    await writeFile(`${OUT}/${name}`, data);
    console.log('✓', name);
  };

  for (const size of [192, 512]) {
    await write(`android-chrome-${size}x${size}.png`, await appIcon(size, 0.64));
    await write(`icon-maskable-${size}x${size}.png`, await appIcon(size, 0.52));
  }
  for (const size of [180, 167, 152]) {
    await write(`apple-touch-icon-${size}x${size}.png`, await appIcon(size, 0.62));
  }
  await write('apple-touch-icon.png', await appIcon(180, 0.62));

  const favicons = [];
  for (const size of [16, 32, 48]) {
    const data = await appIcon(size, 0.78, { radius: 22 });
    favicons.push({ size, data });
    await write(`favicon-${size}x${size}.png`, data);
  }
  await write('favicon.ico', ico(favicons));

  // Silhueta branca sobre transparente — o Android só lê o alfa.
  const glyph = (await readFile(GLYPH, 'utf8')).replace('fill="#000000"', 'fill="#ffffff"');
  await write('notification-badge.png', await sharp(Buffer.from(glyph)).resize(96, 96).png().toBuffer());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
