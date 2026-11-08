// COPY of the Tiko panel's src/lib/printing/thermalImage.ts — keep identical (see README).
import type { TicketLine } from './ticketBuilder';

/** Printable width of an 80mm thermal roll, in dots (203 dpi ≈ 8 dots/mm). */
const CONTENT_DOTS = 576;
export const DOTS_PER_MM = 8;

/**
 * Turns every image line (logo, QR) into a pure black-and-white PNG at the
 * exact size, in printer dots, it will be printed at — for the browser
 * print path, where the Windows driver prints the page.
 *
 * Handed a colour or grey logo, the driver scales it and then dithers every
 * grey into a pattern of dots, which is what makes it come out fuzzy. Done
 * here instead, the image arrives already at one pixel per dot and with no
 * grey left, so there's nothing for the driver to resample or dither.
 *
 * The black/white cut uses Otsu's method (the threshold that best separates
 * the logo's dark and light tones), so a dark-red or blue logo stays solid
 * and a pale background drops out, without a fixed number tuned to one
 * logo. Transparent pixels count as paper.
 *
 * An image that can't be read back (CORS) is left as it was.
 */
export async function thermalizeImages(lines: TicketLine[]): Promise<TicketLine[]> {
  return Promise.all(
    lines.map(async (line) => {
      if (line.type !== 'image') return line;
      try {
        const widthDots = Math.min(line.width ?? CONTENT_DOTS / 2, CONTENT_DOTS);
        const src = await toThermalPng(line.src, widthDots);
        return { ...line, src, width: widthDots };
      } catch {
        return line;
      }
    }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

async function toThermalPng(src: string, widthDots: number): Promise<string> {
  const img = await loadImage(src);
  const w = Math.round(widthDots);
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff'; // transparent → paper
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h); // throws on a tainted canvas
  const px = data.data;
  const luma = new Uint8Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; p < luma.length; i += 4, p++) {
    const v = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    luma[p] = v;
    hist[v]++;
  }
  const t = otsu(hist, luma.length);
  for (let i = 0, p = 0; p < luma.length; i += 4, p++) {
    const v = luma[p] <= t ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Otsu threshold over a 256-bin histogram; clamped so an almost-blank or
 *  almost-solid image doesn't push the cut to an extreme. */
function otsu(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 160;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return Math.min(Math.max(threshold, 90), 200);
}
