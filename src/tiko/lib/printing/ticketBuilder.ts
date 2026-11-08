// COPY of the Tiko panel's src/lib/printing/ticketBuilder.ts — keep identical (see README).
import type { Account, Branch, Order, TicketSettings } from '@/lib/data/types';

/**
 * A ticket is built ONCE as a neutral list of lines, then rendered by one
 * of three back ends — ESC/POS raster (ticketCanvas + escposRaster, the
 * default for a real thermal printer), ESC/POS text (escpos.ts, the older
 * path kept as a fallback), or an 80mm HTML page (ticketHtml.ts, for the
 * browser print dialog / "save as PDF"). Every decision about WHAT a
 * ticket says lives here, exactly once, so the output paths can never
 * drift into showing different content for the same order.
 */
export type TicketLine =
  | { type: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 'small' | 'medium' | 'heading' | 'normal' | 'large' }
  | { type: 'italic'; text: string }
  | { type: 'divider' }
  | { type: 'space' }
  /**
   * A two-column line: label on the left, figure on the right, on the SAME
   * line. Every money row on a receipt is this shape ("Subtotal … ₡17.000")
   * and it can't be faked with two separate lines or with padding — a
   * proportional font has no fixed column to pad to. The raster renderer
   * measures the right-hand text and right-aligns it; the text and HTML
   * renderers approximate it.
   */
  | { type: 'row'; left: string; right: string; bold?: boolean; size?: 'small' | 'medium' | 'heading' | 'normal' | 'large' }
  /**
   * A logo or QR code. Only the RASTER back end can draw this — ESC/POS
   * text mode has no concept of an image, and that limitation is exactly
   * why raster is now the default. The other two back ends skip these
   * lines rather than failing, so a ticket carrying an image still prints
   * (without it) on the text and HTML paths.
   *
   * `src` must be something an <img> can load: a data: URL, or a URL the
   * page is allowed to fetch WITH CORS (a canvas tainted by a cross-origin
   * image can't be read back, and reading pixels back is the whole point).
   * `width` is in printer dots, capped to the paper width by the renderer.
   */
  | { type: 'image'; src: string; width?: number; align?: 'left' | 'center' | 'right' };

const CHANNEL_LABEL: Record<Order['channel'], string> = {
  delivery: 'Domicilio',
  pickup: 'Para llevar',
  dine_in: 'En el local',
  table: 'Mesa',
};

const SOURCE_LABEL: Record<Order['source'], string> = {
  pos: 'PDV',
  web: 'WEB',
  app: 'APP',
  integration: 'APP DELIVERY',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Just the clock time, for a kitchen ticket's own batch headers — the
 *  full date already sits in the ticket's own header line above, so
 *  repeating it per batch would be noise. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
}

/** A line counts as a NEW batch — and gets its own "HH:MM" header — once
 *  it landed 5 minutes or more after the item before it. Below that gap,
 *  it reads as "came in with the rest of the order," which is the common
 *  case (everything added in one sitting) and shouldn't be cluttered with
 *  a timestamp on every single line. */
const BATCH_GAP_MS = 5 * 60 * 1000;

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Header shared by both ticket kinds — matches the reference receipt's
 *  own layout: date, "#N · Canal · Origen", the order code, the order's
 *  own title when the cashier typed one (right under the code — see the
 *  reference's own "PYA: 531" line, a delivery-app order number typed
 *  into "Añadir título"), and (when there's someone to name) who it's
 *  for. No brand line here — see footer() for where that lives instead. */
function header(
  order: Order,
  ticketSettings: TicketSettings,
  /** The comanda's header is reference data the cook glances past, so it
   *  stays 'small'. The customer's copy is the whole point of the piece of
   *  paper they keep, so it runs one tier up. */
  size: 'small' | 'medium' = 'small',
): TicketLine[] {
  // All 'small': the header is reference data (when, which order, who
  // for), not what the cook reads across the pass. Keeping it a tier below
  // the product lines is what makes the products themselves stand out —
  // previously every line was the same size and the ticket read flat.
  const lines: TicketLine[] = [];
  lines.push({ type: 'text', text: formatDateTime(order.createdAt), align: 'center', size });
  lines.push({
    type: 'text',
    text: `#${order.number} - ${CHANNEL_LABEL[order.channel]} - ${SOURCE_LABEL[order.source]}`,
    align: 'center',
    bold: true,
    size,
  });
  lines.push({ type: 'text', text: order.code, align: 'center', size });
  if (order.title && order.title.trim()) {
    lines.push({ type: 'text', text: order.title.trim(), align: 'center', size });
  }
  if (order.tableName) {
    lines.push({ type: 'text', text: order.tableName.toUpperCase(), align: 'center', size });
  }
  if (ticketSettings.showCustomer && order.customerName) {
    lines.push({ type: 'text', text: order.customerName.toUpperCase(), align: 'center', size });
  }
  if (order.address && order.channel === 'delivery') {
    lines.push({ type: 'text', text: order.address, align: 'center', size });
  }
  return lines;
}

/** "Mostrar logo" (ticketSettings.showLogo) has no effect here — there's no
 *  image-logo rendering on either print path (ESC/POS or the HTML page),
 *  and the old placeholder that stood in for one (a plain "TIKO" text
 *  line) has been removed per the brand's own request. The toggle stays
 *  in Settings for a future real logo rather than being ripped out along
 *  with the placeholder text it used to gate. */
function footer(ticketSettings: TicketSettings): TicketLine[] {
  const lines: TicketLine[] = [{ type: 'space' }];
  if (ticketSettings.footerText) {
    lines.push({ type: 'text', text: ticketSettings.footerText, align: 'center', size: 'small' });
  }
  lines.push({ type: 'text', text: 'Tiko - Software gastronómico', align: 'center', size: 'small' });
  lines.push({ type: 'text', text: 'App Version: 1.0.0', align: 'center', size: 'small' });
  return lines;
}

/**
 * The comanda — what the kitchen actually needs: what to make, in what
 * quantity, with which modifiers and notes. No prices, no payment status;
 * a cook pricing out the order isn't the point of this piece of paper.
 */
export function buildKitchenTicket(order: Order, ticketSettings: TicketSettings): TicketLine[] {
  const lines: TicketLine[] = [...header(order, ticketSettings)];
  lines.push({ type: 'divider' });

  // Batch headers use each item's OWN createdAt, not print time — printing
  // (or reprinting) a ticket later doesn't change when something was
  // actually added, and reprinting the full ticket should show the exact
  // same batches every time.
  let previousCreatedAt: number | null = null;

  order.items.forEach((item, i) => {
    if (i > 0) lines.push({ type: 'divider' });

    const createdAtMs = new Date(item.createdAt).getTime();
    // Always shown before the very first item (previousCreatedAt is still
    // null then), and again any time the gap from the item before this
    // one is 5 minutes or more — seeing "15:48" only in front of a line
    // that's genuinely late is the whole point; stamping every line would
    // bury that signal in noise.
    if (previousCreatedAt === null || createdAtMs - previousCreatedAt >= BATCH_GAP_MS) {
      lines.push({ type: 'text', text: formatTime(item.createdAt), align: 'center' });
    }
    previousCreatedAt = createdAtMs;

    lines.push({ type: 'text', text: `X${item.quantity} ${item.name.toUpperCase()}`, bold: true });
    if (item.variantName) {
      lines.push({ type: 'text', text: item.variantName.toUpperCase() });
    }
    for (const mod of item.modifiers) {
      lines.push({ type: 'text', text: `+1 ${mod.optionName.toUpperCase()}` });
    }
    if (ticketSettings.showOrderNotes && item.notes) {
      lines.push({ type: 'italic', text: item.notes.toUpperCase() });
    }
  });

  if (ticketSettings.showOrderNotes && order.notes) {
    lines.push({ type: 'divider' });
    lines.push({ type: 'text', text: 'COMENTARIO DEL PEDIDO:', bold: true });
    lines.push({ type: 'italic', text: order.notes });
  }

  lines.push(...footer(ticketSettings));
  return lines;
}

/**
 * The customer's receipt — the same items, but priced, plus the totals
 * and payment breakdown a customer actually wants to see.
 */
export function buildCustomerTicket(
  order: Order,
  ticketSettings: TicketSettings,
  branch: Branch,
  /** A data: URL for the "guarda este código" QR. Optional because it's
   *  generated asynchronously by the caller and a failure there must not
   *  stop the receipt from printing. */
  qrDataUrl?: string,
): TicketLine[] {
  const lines: TicketLine[] = [];

  // --- Business identity ---------------------------------------------------
  // The kitchen comanda has none of this: the cook knows where they work.
  // A customer's copy is the one that leaves the building, so it leads with
  // who issued it.
  if (ticketSettings.showLogo && branch.settings.logoUrl) {
    lines.push({ type: 'image', src: branch.settings.logoUrl, width: 180, align: 'center' });
  }
  // Its own tier: the business name is the largest thing on the receipt
  // after the logo, and sizing it with the rest of the header block would
  // mean the two can't be tuned independently.
  lines.push({ type: 'text', text: branch.name, align: 'center', bold: true, size: 'heading' });
  if (branch.settings.address && !branch.settings.hideAddress) {
    lines.push({ type: 'text', text: branch.settings.address, align: 'center', size: 'medium' });
  }
  lines.push({ type: 'divider' });

  lines.push(...header(order, ticketSettings, 'medium'));
  lines.push({ type: 'divider' });

  // --- Items ---------------------------------------------------------------
  for (const item of order.items) {
    lines.push({
      type: 'row',
      left: `X${item.quantity} ${item.name}${item.variantName ? ` - ${item.variantName}` : ''}`,
      right: money(item.lineTotal, order.currency),
      bold: true,
    });
    // Deliberately no modifier breakdown here, unlike the comanda: the
    // kitchen needs to know it's a bowl with rice and fried fish, the
    // customer is looking at what they were charged. Modifier prices are
    // already folded into the line total.
    if (ticketSettings.showOrderNotes && item.notes) {
      lines.push({ type: 'italic', text: item.notes });
    }
  }

  // --- Money ---------------------------------------------------------------
  lines.push({ type: 'divider' });
  lines.push({ type: 'row', left: 'Subtotal', right: money(order.subtotal, order.currency) });
  if (order.discountTotal > 0) {
    lines.push({ type: 'row', left: 'Descuento', right: `-${money(order.discountTotal, order.currency)}` });
  }
  if (order.serviceTotal > 0) {
    lines.push({ type: 'row', left: 'Precio de servicio', right: money(order.serviceTotal, order.currency) });
  }
  if (order.packagingTotal > 0) {
    lines.push({ type: 'row', left: 'Embalaje', right: money(order.packagingTotal, order.currency) });
  }
  if (order.channel === 'delivery') {
    // Shown even at zero, unlike the rows above: on a delivery order "₡0"
    // is itself the information — it tells the customer they weren't
    // charged for it, where an absent row just looks like an omission.
    lines.push({ type: 'row', left: 'Precio de entrega', right: money(order.deliveryTotal, order.currency) });
  }
  lines.push({ type: 'row', left: 'Total', right: money(order.total, order.currency), bold: true });

  lines.push({ type: 'italic', text: 'Este documento no tiene valor fiscal.' });

  // --- Payment -------------------------------------------------------------
  lines.push({ type: 'divider' });
  const paidLabel =
    order.paymentStatus === 'paid' ? 'Pagado' : order.paymentStatus === 'partial' ? 'Pago parcial' : 'No pagado';
  lines.push({ type: 'text', text: `Estado de pago: ${paidLabel}`, size: 'small' });
  if (order.paidTotal > 0) {
    lines.push({
      type: 'text',
      text: `Total pagado: ${money(order.paidTotal, order.currency)}`,
      bold: true,
      size: 'small',
    });
  }
  if (order.paymentStatus !== 'paid' && order.total > order.paidTotal) {
    lines.push({
      type: 'text',
      text: `Pendiente: ${money(order.total - order.paidTotal, order.currency)}`,
      size: 'small',
    });
  }

  // The customer copy's own footer: the QR replaces the Tiko/App Version
  // lines entirely (those are for the kitchen copy, where nobody is being
  // invited to scan anything). Only rendered when a code was actually
  // generated — see buildTicket's qrDataUrl, which is optional precisely
  // because generating it is async and can fail.
  lines.push({ type: 'divider' });
  if (qrDataUrl) {
    lines.push({
      type: 'text',
      text: 'Guarda este código para tu próximo pedido.',
      align: 'center',
      bold: true,
      size: 'medium',
    });
    lines.push({ type: 'image', src: qrDataUrl, width: 176, align: 'center' });
  }
  if (ticketSettings.footerText) {
    lines.push({ type: 'text', text: ticketSettings.footerText, align: 'center', size: 'small' });
  }
  return lines;
}

export function ticketSettingsFor(kind: 'kitchen' | 'customer', branch: Branch): TicketSettings {
  return kind === 'kitchen' ? branch.settings.kitchenTicket : branch.settings.customerTicket;
}

export function buildTicket(
  kind: 'kitchen' | 'customer',
  order: Order,
  branch: Branch,
  qrDataUrl?: string,
): TicketLine[] {
  const settings = ticketSettingsFor(kind, branch);
  return kind === 'kitchen'
    ? buildKitchenTicket(order, settings)
    : buildCustomerTicket(order, settings, branch, qrDataUrl);
}

// Re-exported only so callers building a filename/title don't have to
// duplicate the branch-name lookup.
export function ticketFileName(kind: 'kitchen' | 'customer', order: Order, account: Account): string {
  const slug = account.slug || 'tiko';
  return `${slug}-pedido-${order.number}-${kind}.pdf`;
}
