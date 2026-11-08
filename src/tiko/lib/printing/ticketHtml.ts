// COPY of the Tiko panel's src/lib/printing/ticketHtml.ts — keep identical (see README).
import type { TicketLine } from './ticketBuilder';

/**
 * Renders the same TicketLine[] the ESC/POS encoder consumes into an 80mm
 * HTML page for the browser print dialog — the fallback path for machines
 * where WebUSB can't reach the printer directly (see the Windows-vs-Mac
 * driver finding: a printer with a Windows driver installed takes it over
 * exclusively, so the OS print pipeline is the only way in on those
 * machines).
 *
 * Deliberately plain HTML/CSS, no React: this gets written into a hidden
 * iframe's own document, which needs a self-contained page, not a
 * component tree.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderLine(line: TicketLine): string {
  switch (line.type) {
    case 'text': {
      const align = line.align ?? 'left';
      const classes = ['ln', `ln--${align}`];
      if (line.bold) classes.push('ln--bold');
      if (line.size === 'large') classes.push('ln--large');
      if (line.size === 'small') classes.push('ln--small');
      if (line.size === 'medium') classes.push('ln--medium');
      if (line.size === 'heading') classes.push('ln--heading');
      return `<div class="${classes.join(' ')}">${escapeHtml(line.text)}</div>`;
    }
    case 'italic':
      return `<div class="ln ln--italic">${escapeHtml(line.text)}</div>`;
    case 'divider':
      return '<hr />';
    case 'space':
      return '<div class="ln-space"></div>';
    case 'row': {
      const cls = ['ln', 'ln--row'];
      if (line.bold) cls.push('ln--bold');
      if (line.size === 'large') cls.push('ln--large');
      if (line.size === 'small') cls.push('ln--small');
      if (line.size === 'medium') cls.push('ln--medium');
      if (line.size === 'heading') cls.push('ln--heading');
      return `<div class="${cls.join(' ')}"><span>${escapeHtml(line.left)}</span><span>${escapeHtml(line.right)}</span></div>`;
    }
    case 'image': {
      // Unlike ESC/POS text mode, HTML can show the image directly.
      const align = line.align ?? 'center';
      // Sized in mm from printer dots (8 dots/mm), so a pre-thermalized image
      // (thermalImage.ts) lands one pixel per dot; pixelated keeps its edges
      // hard if the driver still has to scale.
      const mm = ((line.width ?? 288) / 8).toFixed(2);
      return `<div class="ln ln--${align}"><img class="ln-img" src="${escapeHtml(line.src)}" style="width:${mm}mm" /></div>`;
    }
  }
}

/**
 * Blank paper after the last line, so the end of the ticket clears the
 * cutter before the printer cuts.
 *
 * On a thermal printer the cutter sits ~15–20mm above the print head: the
 * last line printed is still inside the printer when the cut happens. The
 * USB path handles that with ESC/POS line feeds before the cut command; via
 * the Windows driver there's no such command, and plain bottom padding
 * doesn't help either — most POS drivers trim trailing blank rows to save
 * paper. So the gap ends in a tiny 1-dot mark the driver can't trim, which
 * forces it to feed all the blank rows before it.
 */
export const FEED_TAIL_MM = 44;
const feedTailHtml = (mm: number) =>
  `<div style="height:${mm}mm"></div><div style="height:0.3mm;width:0.6mm;background:#000;margin:0 auto"></div>`;

export function renderTicketHtml(lines: TicketLine[], feedMm: number = FEED_TAIL_MM): string {
  const body = lines.map(renderLine).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  /* Orientation forced, paper size left to the driver (80mm roll).
     - No mm size: a ticket shorter than it is wide makes Chrome treat the
       page as landscape and shrink it.
     - "portrait" is required, not optional: with no orientation in the
       page, Chrome uses the one remembered from the last print (and
       --kiosk-printing reuses it silently), so a single landscape print
       left every later ticket landscape. */
  @page { size: portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 0 0;
    font-family: 'Courier New', Courier, monospace; font-size: 16px; line-height: 1.4;
    font-weight: 400; color: #000;
    /* Courier New only comes in regular (very thin on a thermal head) and
       bold — nothing in between, so a "600" body was simply all bold and
       product names stopped standing out. A thin outline thickens regular
       text just enough to print clearly while staying visibly lighter than
       the bold lines (product names, titles, totals). */
    -webkit-text-stroke: 0.35px #000;
    /* No grey edges: a thermal head can't print grey, the driver dithers it
       into a fuzzy halo around every letter. */
    -webkit-font-smoothing: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ln { white-space: pre-wrap; word-break: break-word; }
  .ln--center { text-align: center; }
  .ln--right { text-align: right; }
  .ln--bold { font-weight: 700; }
  .ln--large { font-size: 23px; font-weight: 700; }
  .ln--small { font-size: 12.5px; }
  .ln--medium { font-size: 13.5px; }
  .ln--heading { font-size: 15px; }
  .ln--row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .ln--row > span:last-child { white-space: nowrap; }
  .ln--italic { font-style: italic; padding-left: 4mm; color: #000; }
  .ln-space { height: 3mm; }
  .ln-img { image-rendering: pixelated; image-rendering: crisp-edges; }
  hr { border: 0; border-top: 2px dashed #000; margin: 2mm 0; }
</style>
</head>
<body>
${body}
${feedTailHtml(feedMm)}
</body>
</html>`;
}

