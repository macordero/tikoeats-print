// COPY of the mappers in the Tiko panel's src/lib/data/supabaseDataProvider.ts
// (the functions with the same names), so the order and branch the server
// sends turn into exactly the objects the ticket builder expects.
// Keep in step with the panel: if a ticket field is added there, copy it here.

import {
  DEFAULT_DELIVERY_PRICING,
  type Branch,
  type BranchSettings,
  type DeliveryArea,
  type DeliveryNeighborhood,
  type DeliveryPricing,
  type DeliveryRange,
  type Order,
  type TicketSettings,
} from './types';

function n(v: unknown): number {
  return Number(v ?? 0);
}

function toTicketSettings(raw: unknown): TicketSettings {
  const j = (raw ?? {}) as Partial<Record<keyof TicketSettings, unknown>>;
  return {
    showLogo: typeof j.showLogo === 'boolean' ? j.showLogo : true,
    showOrderNotes: typeof j.showOrderNotes === 'boolean' ? j.showOrderNotes : true,
    showCustomer: typeof j.showCustomer === 'boolean' ? j.showCustomer : true,
    footerText: typeof j.footerText === 'string' ? j.footerText : null,
    // Automatic printing defaults to OFF across the board: a printer
    // firing on its own is the kind of thing an owner should opt into,
    // not discover by finding paper on the floor.
    autoWebPos: j.autoWebPos === true,
    autoWeb: j.autoWeb === true,
    autoPos: j.autoPos === true,
    autoDelivery: j.autoDelivery === true,
    autoWebTrigger: j.autoWebTrigger === 'arrival' ? 'arrival' : 'accept',
  };
}

function toDeliveryPricing(raw: unknown): DeliveryPricing {
  const j = (raw ?? {}) as Record<string, unknown>;
  const modes = ['none', 'fixed', 'neighborhood', 'distance', 'areas', 'ranges'];
  const numOrNull = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    ...DEFAULT_DELIVERY_PRICING,
    mode: (typeof j.mode === 'string' && modes.includes(j.mode)
      ? j.mode
      : 'none') as DeliveryPricing['mode'],
    googleValidation: j.googleValidation === true,
    acceptOutsideCoverage: j.acceptOutsideCoverage === true,
    fixedPrice: numOrNull(j.fixedPrice),
    basePrice: numOrNull(j.basePrice),
    pricePerKm: numOrNull(j.pricePerKm),
    maxKm: numOrNull(j.maxKm),
    neighborhoods: Array.isArray(j.neighborhoods) ? (j.neighborhoods as DeliveryNeighborhood[]) : [],
    ranges: Array.isArray(j.ranges) ? (j.ranges as DeliveryRange[]) : [],
    areas: Array.isArray(j.areas)
      ? (j.areas as DeliveryArea[]).map((a) => ({ ...a, enabled: a.enabled !== false }))
      : [],
  };
}

function toBranchSettings(r: any): BranchSettings {
  return {
    whatsappPhone: r.whatsapp_phone ?? null,
    address: r.address ?? null,
    latitude: r.latitude !== null && r.latitude !== undefined ? Number(r.latitude) : null,
    longitude: r.longitude !== null && r.longitude !== undefined ? Number(r.longitude) : null,
    country: r.country ?? null,
    province: r.province ?? null,
    canton: r.canton ?? null,
    district: r.district ?? null,
    hideAddress: r.hide_address ?? false,
    currency: r.currency ?? 'CRC',
    language: r.language ?? 'es',
    posSystem: r.pos_system ?? null,
    sellModes: r.sell_modes ?? [],
    acceptsOrders: r.accepts_orders ?? true,
    whatsappOrderingEnabled: r.whatsapp_ordering_enabled ?? true,
    defaultOrderStatus: r.default_order_status ?? 'pending',
    acceptsTips: r.accepts_tips ?? false,
    coverImageUrl: r.cover_image_url ?? null,
    coverMessage: r.cover_message ?? null,
    logoUrl: r.logo_url ?? null,
    pdvShowsHiddenProducts: r.pdv_shows_hidden_products ?? true,
    pdvSellsOutOfStock: r.pdv_sells_out_of_stock ?? true,
    cashOpenReminder: r.cash_open_reminder ?? true,
    printingMode: r.printing_mode ?? 'browser',
    kitchenTicket: toTicketSettings(r.kitchen_ticket_settings),
    customerTicket: toTicketSettings(r.customer_ticket_settings),
    tipsRestrictedChannels: r.tips_restricted_channels ?? null,
    tipPresets: Array.isArray(r.tip_presets) ? r.tip_presets : [],
    tipsDefaultChoice: r.tips_default_choice ?? null,
    tipsDefaultPresetIndex:
      r.tips_default_preset_index !== null && r.tips_default_preset_index !== undefined
        ? Number(r.tips_default_preset_index)
        : null,
    tipsDescriptionEnabled: r.tips_description_enabled ?? false,
    tipsDescription: r.tips_description ?? null,
    deliveryPricing: toDeliveryPricing(r.delivery_pricing),
    upsellCartEnabled: r.upsell_cart_enabled ?? true,
    reorderSuggestionEnabled: r.reorder_suggestion_enabled ?? true,
  };
}

export function toBranch(r: any): Branch {
  return {
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    isActive: r.is_active,
    settings: toBranchSettings(r.branch_settings ?? {}),
    businessTypeKeys: (r.branch_business_types ?? []).map(
      (t: any) => t.business_type?.key ?? t.key,
    ),
  };
}

export function toOrder(r: any): Order {
  return {
    id: r.id,
    branchId: r.branch_id,
    number: r.number,
    code: r.code,
    channel: r.channel,
    source: r.source,
    status: r.status,
    paymentStatus: r.payment_status,
    paidTotal: n(r.paid_total),
    paymentPending: r.payment_pending ?? false,
    title: r.title ?? null,
    customerName: r.customer_name ?? null,
    customerPhone: r.customer_phone ?? null,
    customerId: r.customer_id ?? null,
    tableId: r.table_id ?? null,
    // Only list_orders() resolves this via a join — every other RPC here
    // returns the raw orders row, which has table_id but no name attached.
    // A mutation's own return value (create/update/register-payment) will
    // show this as null for a moment until the board's next fetch of
    // list_orders picks it up — display-only staleness, not a correctness
    // issue: occupancy itself (list_dining_rooms) is computed straight
    // from table_id, never from this resolved name.
    tableName: r.table_name ?? null,
    address: r.address ?? null,
    notes: r.notes ?? null,
    subtotal: n(r.subtotal),
    discountTotal: n(r.discount_total),
    serviceTotal: n(r.service_total),
    packagingTotal: n(r.packaging_total),
    deliveryTotal: n(r.delivery_total),
    total: n(r.total),
    currency: r.currency ?? 'CRC',
    createdAt: r.created_at,
    acceptedAt: r.accepted_at ?? null,
    closedAt: r.closed_at ?? null,
    paymentMethodId: r.payment_method_id ?? null,
    requiresInvoice: r.requires_invoice ?? false,
    promoCode: r.promo_code ?? null,
    externalSource: r.external_source ?? null,
    externalDisplayId: r.external_display_id ?? null,
    externalAcceptBy: r.external_accept_by ?? null,
    items: (r.items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.product_id ?? null,
      variantId: i.variant_id ?? null,
      name: i.name,
      variantName: i.variant_name ?? null,
      unitPrice: n(i.unit_price),
      quantity: i.quantity,
      lineTotal: n(i.line_total),
      packagingPrice: n(i.packaging_price),
      notes: i.notes ?? null,
      modifiers: (i.modifiers ?? []).map((m: any) => ({
        groupName: m.group_name,
        optionName: m.option_name,
        priceDelta: n(m.price_delta),
      })),
      // Falls back to the order's own created_at for a row from a provider
      // path that doesn't select it (there isn't one today, but list_orders
      // isn't the only caller of this mapper) rather than `undefined`,
      // which would silently break the ticket's time-header grouping.
      createdAt: i.created_at ?? r.created_at,
    })),
  };
}
