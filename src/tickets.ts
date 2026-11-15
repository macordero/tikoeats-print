// Turns a job into the printable page — with the Tiko panel's OWN ticket
// code (src/tiko/lib/printing is a copy of the panel's src/lib/printing), so
// a comanda printed here is identical to one printed from the panel.

import { buildTicket } from '@/lib/printing/ticketBuilder';
import { FEED_TAIL_MM, renderTicketHtml } from '@/lib/printing/ticketHtml';
import { thermalizeImages } from '@/lib/printing/thermalImage';
import { toBranch, toOrder } from '@/lib/data/mappers';
import type { Job, Poll } from './api';

/** The "guardá este código" QR on the customer receipt, as in the panel. */
async function storeQr(slug: string): Promise<string | undefined> {
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(`https://${slug}.tikoeats.com`, { margin: 1, width: 512 });
  } catch {
    return undefined;
  }
}

export async function jobHtml(job: Job, bundle: NonNullable<Poll['bundle']>): Promise<string> {
  if (job.kind === 'test') return testPageHtml(bundle, job.requested_by);

  const order = toOrder(job.order);
  const branch = toBranch(bundle.branch);
  const qr = job.kind === 'customer' ? await storeQr(bundle.account.slug) : undefined;
  const lines = buildTicket(job.kind, order, branch, qr);
  // Exactly the panel's driver path (printerService → printViaBrowser):
  // logo/QR turned black-and-white at print size so the driver doesn't blur
  // them, and the receipt's extra 3cm of paper before the cut.
  return renderTicketHtml(
    await thermalizeImages(lines),
    job.kind === 'customer' ? FEED_TAIL_MM + 30 : FEED_TAIL_MM,
  );
}

export function testPageHtml(bundle: Pick<NonNullable<Poll['bundle']>, 'account'> | null, by?: string | null, printerName?: string): string {
  const now = new Date().toLocaleString('es-CR');
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 72mm 120mm; margin: 0; }
    html, body { margin: 0; }
    body { width: 72mm; margin: 0 auto; padding: 4mm 0 30mm; font: 13px/1.4 monospace; color: #000; }
    h1 { font-size: 18px; text-align: center; margin: 0 0 6px; }
    p { margin: 2px 0; text-align: center; }
    hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
  </style></head><body>
    <h1>PRUEBA DE IMPRESIÓN</h1>
    <p>Tiko Impresión</p>
    ${bundle ? `<p>${esc(bundle.account.name)}</p>` : ''}
    ${printerName ? `<p>Impresora: ${esc(printerName)}</p>` : ''}
    <hr>
    <p>Si leés esto, la impresora</p>
    <p>está lista. ✓</p>
    <hr>
    <p>${esc(now)}</p>
    ${by ? `<p>Enviada por ${esc(by)}</p>` : ''}
  </body></html>`;
}
