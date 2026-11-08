// COPY of the Tiko panel's src/lib/data/types.ts — keep identical (see README).
/**
 * Domain types — plain data shapes used across the app.
 *
 * These are hand-written and represent the domain as the UI understands it.
 * The Supabase-generated row types (database.types.ts) are mapped INTO these
 * by the Supabase provider, so the rest of the app never imports database
 * types directly. This keeps the UI decoupled from the storage schema.
 */

export type Role =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'cashier'
  | 'waiter'
  | 'kitchen'
  | 'driver';

export type MembershipStatus = 'invited' | 'active' | 'suspended';

export type Plan = 'free' | 'advanced' | 'premium' | 'elite' | 'infinity';

/** How a branch takes orders. 'counter'/'tables' are in-store, the rest delivery. */
export type SellMode = 'counter' | 'tables' | 'own_menu' | 'delivery_apps';

/** The tenant. Groups branches, billing and members. Created at sign-up. */
/** What the business sells: food (menu, kitchen, tables) or a store
 *  (catalog, counter, pick-up). Account-wide; every branch shares it. */
export type BusinessKind = 'restaurant' | 'store';

export interface Account {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  businessKind: BusinessKind;
  /** When the slug (public link) last changed — one change every 30 days
   *  (0104). Null = never changed since sign-up. */
  slugChangedAt: string | null;
  /** The slug before the last change; that old link still works. */
  previousSlug: string | null;
  createdAt: string;
}

/** Global identity. One person, reusable across accounts. */
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  /** The person's own number, not the branch's public WhatsApp line. */
  phone: string | null;
  /** True when this password was set by someone else (an invitation), so the
   *  app forces a change before letting them in. */
  mustChangePassword: boolean;
  /** Preferred UI language, e.g. "es" | "en". */
  locale: string;
}

/** Links a user to an account with a role. The core of multi-tenancy. */
export interface Membership {
  id: string;
  accountId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
  /** Branch ids this membership can access. Empty = all branches. */
  branchIds: string[];
}

/** A row in the "Equipo y roles" table. Flattens membership + user profile,
 *  since the screen shows them as one thing. */
export interface TeamMember {
  /** The membership id — what every mutation takes, NOT the user id. */
  id: string;
  accountId: string;
  /** Null while the invitation is still pending. */
  userId: string | null;
  /** Profile name once claimed, or the name typed at invite time. */
  fullName: string | null;
  email: string;
  phone: string | null;
  role: Role;
  status: MembershipStatus;
  /** True when nobody has signed up against this invitation yet. */
  isPending: boolean;
  /** Branches this member can access. Empty = all of them. */
  branchIds: string[];
  invitedAt: string;
}

/** What the invite-user Edge Function hands back so the admin can pass the
 *  credentials along. */
export interface InviteResult {
  membershipId: string;
  email: string;
  /** Null when the address already had a Tiko login — that person keeps their
   *  own password and there's nothing temporary to share. */
  tempPassword: string | null;
  alreadyExisted: boolean;
}

export interface InviteTeamMemberInput {
  accountId: string;
  email: string;
  name: string;
  role: Role;
  /** Empty = access to every branch. */
  branchIds: string[];
  /** Only meaningful for roles contacted outside the app itself, like
   *  'driver' — see memberships.phone (0068). */
  phone?: string;
}

/** Everything the "Nueva sucursal" drawer collects. */
export interface CreateBranchInput {
  accountId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  whatsappPhone: string | null;
  currency: string;
  /** Branch to copy the menu from. Null = start with an empty menu. */
  cloneFromBranchId: string | null;
}

/** A physical location. An account owns one or more. */
export interface Branch {
  id: string;
  accountId: string;
  name: string;
  isActive: boolean;
  settings: BranchSettings;
  businessTypeKeys: string[];
}

/** Configurable data for a branch. Separated from the branch identity. */
export interface BranchSettings {
  whatsappPhone: string | null;
  address: string | null;
  /** Pin position from the address map, in decimal degrees. Null until the
   *  owner actually places/confirms a pin — a typed address alone doesn't
   *  imply coordinates. */
  latitude: number | null;
  longitude: number | null;
  /** Administrative area the PIN falls in, resolved by reverse-geocoding it
   *  when the address is saved (see reverseGeocode / migration 0079). Each
   *  is independently nullable: Google's coverage isn't uniform (rural pins
   *  often have no district), and the lookup is best-effort — if it fails,
   *  the address and pin still save with these left null. Absent means
   *  "not resolved", never "has no province". */
  country: string | null;
  province: string | null;
  canton: string | null;
  district: string | null;
  hideAddress: boolean;
  currency: string;
  /** Language the PUBLIC menu renders in — not the admin panel's own UI
   *  language, which each user picks for themselves in the topbar. */
  language: string;
  posSystem: string | null;
  sellModes: SellMode[];
  /** Master switch for the whole "Configuración de pedidos" screen — when
   *  false, every channel is treated as off regardless of its own row. */
  acceptsOrders: boolean;
  /** Whether new orders are also forwarded to whatsappPhone, in addition to
   *  landing in the panel. */
  whatsappOrderingEnabled: boolean;
  defaultOrderStatus: 'pending' | 'preparing';
  acceptsTips: boolean;
  /** Wide banner shown above the digital menu. Null shows the diagonal
   *  placeholder pattern instead of an <img>. */
  coverImageUrl: string | null;
  /** Short message shown over the cover on the public menu (0102). At most
   *  100 characters and one line break (2 lines). Null = no message. */
  coverMessage: string | null;
  /** Square logo overlapping the cover. Null shows the placeholder icon. */
  logoUrl: string | null;
  /** "Mostrar productos ocultos" in the PDV catalog visibility modal — lets
   *  staff sell a product in the POS even while it's hidden from the public
   *  WEB menu (products.isVisible = false). */
  pdvShowsHiddenProducts: boolean;
  /** "Vender productos agotados" — lets staff ring up a sale with no stock
   *  available. */
  pdvSellsOutOfStock: boolean;
  /** "Aviso automático para abrir caja" (Cajas › Configuración, 0093). */
  cashOpenReminder: boolean;
  /** Which of the three printing setups the branch uses — see 0060. Only
   *  'browser' is actually implemented; the other two are stored so the
   *  choice persists, and the UI says plainly that they need a companion
   *  app that doesn't exist yet. */
  printingMode: PrintingMode;
  kitchenTicket: TicketSettings;
  customerTicket: TicketSettings;

  // ---- Propinas (0061) — acceptsTips above is the master on/off; these
  // configure it once it's on. ------------------------------------------
  /** null = every service type offered gets tipping. A non-null list
   *  restricts it ("Agrega propinas solo para un servicio específico"). */
  tipsRestrictedChannels: OrderChannel[] | null;
  tipPresets: TipPreset[];
  /** Which option the customer lands on by default — see 0062. null means
   *  no default is set at all (the switch is off). */
  tipsDefaultChoice: TipsDefaultChoice | null;
  /** Which preset, when tipsDefaultChoice === 'preset'. */
  tipsDefaultPresetIndex: number | null;
  tipsDescriptionEnabled: boolean;
  tipsDescription: string | null;

  // ---- Impulso de ventas (0064) ----------------------------------------
  /** Whole delivery pricing config — see 0067. */
  deliveryPricing: DeliveryPricing;
  /** Suggest extra products at the end of the cart. */
  upsellCartEnabled: boolean;
  /** Offer a one-tap repeat of the customer's previous order. */
  reorderSuggestionEnabled: boolean;
}

export type PrintingMode = 'browser' | 'bluetooth' | 'auto_pc';

/** Presentation toggles for one printed ticket. Stored as jsonb (0060), so
 *  adding a toggle costs nothing at the database level.
 *
 *  Declared as a `type`, not an `interface`, deliberately: the generated
 *  Json type these get assigned to is an index-signature shape, and
 *  TypeScript only grants an implicit index signature to type aliases —
 *  an interface can be augmented by declaration merging later, so it
 *  never qualifies. As an interface this needed a cast at every write. */
export type TicketSettings = {
  showLogo: boolean;
  showOrderNotes: boolean;
  showCustomer: boolean;
  /** Free-text line printed at the bottom, e.g. "¡Gracias por su compra!". */
  footerText: string | null;
  /* --- Automatic printing (only meaningful when printingMode is
     'auto_pc' — the browser and bluetooth modes are manual by
     definition). Kitchen and customer tickets expose different subsets
     of these, matching the reference: the kitchen has a single combined
     WEB+POS toggle, while the customer side separates them. Living in the
     same jsonb blob means adding them cost no migration. --- */
  /** Kitchen only: one toggle covering both WEB and POS orders. */
  autoWebPos: boolean;
  /** Customer only. */
  autoWeb: boolean;
  /** Customer only. Excludes table service, per the reference's own note. */
  autoPos: boolean;
  /** Both: orders coming from delivery integrations (Rappi, Uber Eats…). */
  autoDelivery: boolean;
  /** Customer only: whether a WEB ticket prints the moment the order
   *  arrives, or only once it's accepted for preparation. */
  autoWebTrigger: 'arrival' | 'accept';
};

/** One tappable tip amount — either a percentage of the order or a flat
 *  figure in the branch's own currency. A `type`, not `interface`, for the
 *  same reason TicketSettings is — see that type's own note. It needs to
 *  be assignable to Json (inside a jsonb array) without a cast at every
 *  write. */
export type TipsDefaultChoice = 'none' | 'preset' | 'free';

/** How a branch charges for delivery — see 0067. Only one is in effect. */
export type DeliveryPricingMode = 'none' | 'fixed' | 'neighborhood' | 'distance' | 'areas' | 'ranges';

export type DeliveryNeighborhood = { name: string; price: number };
/** A concentric radius from the branch, in metres, and its price. */
export type DeliveryRange = { meters: number; price: number };
export type DeliveryArea = {
  name: string;
  price: number;
  polygon: { lat: number; lng: number }[];
  /** Turned off areas stay drawn (dimmed) so they can be brought back
   *  without redrawing the shape. */
  enabled: boolean;
};

/** Declared with `type` (not `interface`) so it stays assignable to the
 *  generated Json shape — same reason as TicketSettings. */
export type DeliveryPricing = {
  mode: DeliveryPricingMode;
  /** Verify customer addresses against Google Maps before accepting. */
  googleValidation: boolean;
  /** Take orders from addresses that fall outside every configured zone. */
  acceptOutsideCoverage: boolean;
  fixedPrice: number | null;
  basePrice: number | null;
  pricePerKm: number | null;
  maxKm: number | null;
  neighborhoods: DeliveryNeighborhood[];
  ranges: DeliveryRange[];
  areas: DeliveryArea[];
};

export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  mode: 'none',
  googleValidation: false,
  acceptOutsideCoverage: false,
  fixedPrice: null,
  basePrice: null,
  pricePerKm: null,
  maxKm: null,
  neighborhoods: [],
  ranges: [],
  areas: [],
};

/** The three service types a payment method can be switched on for in the
 *  panel. A table order is 'dine_in' here — see paymentServiceType(). */
export type PaymentServiceType = 'delivery' | 'pickup' | 'dine_in';

/** One payment method a branch accepts — see 0065. */
export interface BranchPaymentMethod {
  id: string;
  branchId: string;
  /** Catalogue entry ('cash', 'card', 'sinpe'…), or 'other' for a
   *  free-text method the owner named themselves. */
  code: string;
  /** Only meaningful when code === 'other'. */
  customLabel: string | null;
  /** Whether the customer's ordering app offers this method — one switch,
   *  because for the customer the way of paying doesn't depend on how they
   *  receive the order (0086). */
  showInCustomerApp: boolean;
  /** Service types it's offered for when taking payment from the panel. The
   *  panel needs the distinction the customer app doesn't: it also creates
   *  delivery orders, where e.g. card may not apply. 'dine_in' covers both
   *  the counter and tables. */
  pdvChannels: PaymentServiceType[];
  /** Percentage added when the customer picks this method. null = none. */
  surchargePercent: number | null;
  /** Shown to the customer while paying — see 0066. */
  paymentInstructions: string | null;
  /** Shown at payment time with a copy button beside it. */
  paymentCode: string | null;
  sortOrder: number;
}

export interface CreatePaymentMethodInput {
  branchId: string;
  code: string;
  customLabel?: string | null;
}

export type TipPreset = {
  mode: 'percent' | 'amount';
  value: number;
};

export type OrderChannel = 'delivery' | 'pickup' | 'dine_in' | 'table';

export type DeliveryProvider = 'own' | 'uber';

/** Per-channel order configuration. A channel with no row is treated as
 *  disabled — rows are created on demand the first time an owner touches
 *  that channel's toggle, not pre-seeded for every branch. */
export interface BranchOrderChannel {
  id: string;
  branchId: string;
  channel: OrderChannel;
  isEnabled: boolean;
  /** Only meaningful for channel === 'delivery'. */
  deliveryRequestMode: 'manual' | 'automatic' | null;
  /** Who delivers: our own drivers, or an integration (0085). Only
   *  meaningful for channel === 'delivery'. With anything other than 'own'
   *  the request mode is always automatic and deliveryRequestMode is
   *  ignored (but kept, so switching back restores the earlier choice). */
  deliveryProvider: DeliveryProvider;
  /** Only meaningful for channel === 'dine_in'. */
  qrMode: 'generic' | 'specific' | null;
  /** Only meaningful for channel === 'table'. */
  chargesServiceFee: boolean;

  // ---- "Opciones avanzadas", all channel === 'delivery' only -------------
  /** A free-text question the admin writes; asked to the customer at
   *  checkout, e.g. "¿Quieres utensilios con tu pedido?". */
  requestsAdditionalInfo: boolean;
  additionalInfoPrompt: string | null;
  /** An extra required address line, e.g. "Punto de referencia específico" —
   *  the admin defines the label, not just a fixed "apartment" field. */
  requiresAddressComplement: boolean;
  addressComplementLabel: string | null;
  /** No delivery order below this amount can be placed. */
  minimumOrderEnabled: boolean;
  minimumOrderAmount: number | null;
  /** Delivery fee waived once the order reaches this amount — independent of
   *  minimumOrderAmount. */
  freeDeliveryEnabled: boolean;
  freeDeliveryThreshold: number | null;
  /** Shown to the customer as a range, not a single number. */
  estimatedTimeEnabled: boolean;
  estimatedTimeMinMinutes: number | null;
  estimatedTimeMaxMinutes: number | null;
  /** A flat amount in the branch's own currency, not a percentage. */
  serviceFeeEnabled: boolean;
  serviceFeeAmount: number | null;
  serviceFeeCustomerCanDecline: boolean;
  /** Boolean only — no reference screen ever showed an amount field for
   *  this one. May end up configured per product instead. */
  packagingFeeEnabled: boolean;
  allowsScheduledOrders: boolean;
  /** Only meaningful for channel === 'dine_in'. */
  requestsCustomerContact: boolean;
}

/** A single opening window for a weekday (0 = Sunday). */
export interface BranchHours {
  id: string;
  branchId: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
}

/** Catalog entry. Name is resolved from i18n using `key`, not stored here. */
export interface BusinessType {
  id: string;
  key: string;
  emoji: string;
  sortOrder: number;
  /** Which kind of business offers this type in onboarding. */
  kind: BusinessKind;
}

export interface Subscription {
  id: string;
  accountId: string;
  plan: Plan;
  ordersUsed: number;
  renewsAt: string | null;
}

/** Everything resolved for the signed-in session, in one shape. */
/** A menu category (e.g. "Sandwiches"). Featured is a product flag, not a category. */
export interface Category {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export type PricingMode = 'simple' | 'variants';

/** A menu item within a category. Price/compareAtPrice always reflect the
 *  base ("starting from") price — when pricingMode is 'variants', the real
 *  sellable prices live in `variants`. */
export interface Product {
  id: string;
  branchId: string;
  categoryIds: string[];
  /** Position of this product WITHIN each category it belongs to, keyed by
   *  category id. Lives on product_categories, not on the product, because
   *  the same product can sit in several categories at different positions. */
  categoryOrder: Record<string, number>;
  /** Position within "Destacados" specifically — products.sort_order, not
   *  scoped to any one category the way categoryOrder is. Meaningless for a
   *  non-featured product; only read/written when isFeatured is true. */
  sortOrder: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  compareAtPrice: number | null;
  /** Charged on delivery orders when the branch's "Precio de embalaje"
   *  toggle (BranchOrderChannel.packagingFeeEnabled) is on for the delivery
   *  channel — the amount lives here, per product, not on the channel. */
  packagingPrice: number | null;
  /** Optional extras, added via the "+ Costo" / "+ SKU" buttons — same
   *  fields product_variants and modifier_options already carry. Null means
   *  "not recorded", distinct from a real cost of 0. Only meaningful when
   *  pricingMode is 'simple'; a 'variants' product's real cost/SKU live on
   *  each ProductVariant instead. */
  cost: number | null;
  sku: string | null;
  /** Factory barcode (EAN-13, UPC…), separate from the internal SKU. Stores
   *  only for now, and only for simple-priced products; a 'variants'
   *  product's codes live on each ProductVariant. Unique per branch across
   *  products and variants (enforced by the database, see 0099). */
  barcode: string | null;
  /** Denormalized cache of the main (sort_order 0) row in product_images,
   *  kept in sync by a DB trigger. Read this for display; use the
   *  product-images methods below to change it. */
  isFeatured: boolean;
  isVisible: boolean;
  pricingMode: PricingMode;
  /** The question shown to customers above the variant list (e.g. "Elige el
   *  tamaño de tu pizza"). Only meaningful when pricingMode is 'variants'. */
  variantLabel: string | null;
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
  /** What the dish is made of. Empty means the product simply has no
   *  ingredient list, and the customer is shown nothing at all. */
  ingredients: ProductIngredient[];
  /** Gates EDITING only, not visibility: with this off the customer still
   *  sees the ingredient list read-only, since knowing what's in the food is
   *  useful either way. Irrelevant when `ingredients` is empty. */
  allowsIngredientCustomization: boolean;
  /** "Control de Stock" (0091). On: availability comes from stock (> 0),
   *  counted on the product for a simple product and on each variant for a
   *  variants product. Off: availability is the manual isAvailable. */
  stockControl: boolean;
  /** Units on hand — simple products only (variants carry their own). May go
   *  negative when the till sells past zero; that's the real figure. */
  stock: number;
  /** At or below this the item is flagged as "Alerta" (still sellable). */
  stockMin: number;
  /** Manual "Disponible / Agotado" for a product without stock control.
   *  A variants product uses each variant's isAvailable instead. */
  isAvailable: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  /** Optional per-variant extras, added via the "+ Costo" / "+ Embalaje" /
   *  "+ SKU" / "+ Código de búsqueda" buttons. Null means "not recorded",
   *  which is distinct from a real value of 0. */
  cost: number | null;
  packagingPrice: number | null;
  sku: string | null;
  /** Factory barcode of this variant — column ready (0099), not edited
   *  from the app yet. */
  barcode: string | null;
  searchCode: string | null;
  /** "Disponible / Agotado" — a stock statement about THIS variant, not the
   *  same thing as products.isVisible (whether it shows on the menu at all).
   *  A sold-out variant still appears, just not orderable. */
  isAvailable: boolean;
  /** Per-variant stock, used when the product has stockControl on (0091). */
  stock: number;
  stockMin: number;
  sortOrder: number;
}

/** One line of a product's composition — what the dish is MADE OF, as
 *  opposed to a modifier, which is a choice the customer makes while
 *  assembling the order.
 *
 *  Pricing works differently from modifiers, and the difference matters:
 *  `baseQuantity` is already included in the product's price, and
 *  `extraPrice` is charged only for units ABOVE it. Cheese with
 *  baseQuantity 1 and extraPrice 500 costs nothing at quantity 1, and ₡1000
 *  at quantity 3 (two extra units).
 *
 *  A null `extraPrice` means the ingredient can be removed or reduced but
 *  never exceeded — which is why there's no separate "allow extras" flag
 *  here, unlike ModifierOption.allowExtras. Removing never refunds. */
export interface ProductIngredient {
  id: string;
  productId: string;
  name: string;
  /** Included at no charge. 0 is valid: an optional add-on not present by
   *  default. */
  baseQuantity: number;
  /** Per-unit charge above baseQuantity. Null = can't exceed base. */
  extraPrice: number | null;
  sortOrder: number;
}

/** A reusable modifier-group template, shared across every product in the
 *  branch that attaches it — not owned by any single product. Editing it
 *  (name, isRequired, maxSelect, or its options) updates everywhere it's
 *  used; that's the point of a library, not an accident. See 0037. */
/** How a modifier group's choices are defined. 'manual' = hand-typed name
 *  and price per option (the original behaviour). 'products' = the customer
 *  picks real menu products, which is what a combo needs. */
export type ModifierOptionSource = 'manual' | 'products';

/** Only meaningful when optionSource is 'products'. 'all' = any visible
 *  product in the branch qualifies; 'specific' = only linkedProductIds. */
export type ModifierProductScope = 'all' | 'specific';

export interface ModifierGroup {
  id: string;
  branchId: string;
  name: string;
  isRequired: boolean;
  maxSelect: number;
  /** Lets the customer take a choice from this category more than once —
   *  "dos porciones de salmón". A category-wide rule, sitting alongside
   *  isRequired and maxSelect, because "¿se admiten adicionales aquí?" is a
   *  property of the category rather than of each individual choice.
   *  What each repeat costs is per option (ModifierOption.extraPrice). */
  allowExtras: boolean;
  optionSource: ModifierOptionSource;
  productScope: ModifierProductScope;
  /** Products this group allows, when optionSource is 'products' AND
   *  productScope is 'specific'. Empty otherwise. A linked product's price
   *  is the product's OWN price — there's deliberately no per-link price
   *  override. */
  linkedProductIds: string[];
  options: ModifierOption[];
  /** Every product currently using this group, via product_modifier_groups.
   *  Only populated by listModifierLibrary (the one place that needs to
   *  show "used by N products" and drive the Asociar/Desasociar picker) —
   *  reading a product's OWN modifierGroups doesn't need this and leaves it
   *  as an empty array to avoid an unnecessary join on every product fetch. */
  productIds: string[];
}

export interface ModifierOption {
  id: string;
  modifierGroupId: string;
  name: string;
  priceDelta: number;
  /** Optional extras, added per-option via the "+ Costo" / "+ Descuento" /
   *  "+ SKU" buttons. Null means "not recorded" — distinct from 0, which
   *  would claim the option genuinely costs nothing. */
  cost: number | null;
  /** The struck-through "before" price, same meaning as
   *  products.compareAtPrice. */
  compareAtPrice: number | null;
  sku: string | null;
  /** What each REPEAT of this option costs beyond the first, when the group
   *  it belongs to has allowExtras on. priceDelta is what picking the option
   *  at all costs; this is the per-extra charge.
   *
   *  Whether extras are permitted is a group-wide rule (see
   *  ModifierGroup.allowExtras), but the amount is per option — a second
   *  salmón and a second pollo aren't the same money. Null while the group
   *  doesn't allow extras, or when the owner hasn't priced them yet. */
  extraPrice: number | null;
  /** Per-option eye toggle — hides just this option, without touching the
   *  group it belongs to. */
  isVisible: boolean;
  sortOrder: number;
}

export interface CreateProductInput {
  branchId: string;
  categoryId: string;
  name: string;
  price: number;
}

export interface SessionContext {
  user: User;
  account: Account;
  membership: Membership;
  branches: Branch[];
  subscription: Subscription;
}

/** Payload to create the account + first branch at sign-up. */
export interface CreateAccountInput {
  businessName: string;
  slug: string;
  countryCode: string;
  ownerFullName: string;
  /** Defaults to 'restaurant'. */
  businessKind?: BusinessKind;
}

// ---- Orders -----------------------------------------------------------------

export type OrderStatus = 'draft' | 'pending' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type OrderSource = 'pos' | 'web' | 'app' | 'integration';

/** A chosen option on a line, snapshotted at sale time. */
export interface OrderItemModifier {
  groupName: string;
  optionName: string;
  priceDelta: number;
}

/** One line on a ticket. Name and price are COPIES of what the menu said when
 *  the order was taken — never re-read from `products`, or old tickets would
 *  silently rewrite themselves when the menu changes. */
export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  /** Already includes the modifier add-ons. */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  packagingPrice: number;
  notes: string | null;
  modifiers: OrderItemModifier[];
  /** When this line was actually added to the order — client-supplied at
   *  the moment it entered the cart, not server-stamped, since the server
   *  has no way to tell "the same line, saved again" from "a genuinely new
   *  line" across update_order_items' own delete-and-reinsert (0075/0076).
   *  Drives the kitchen ticket's own time-header grouping: a line added
   *  well after the rest gets its own "HH:MM" header so the kitchen knows
   *  it's a late addition, not part of the original order. */
  createdAt: string;
}

export interface Order {
  id: string;
  branchId: string;
  /** Per-branch, restarts daily. */
  number: number;
  code: string;
  channel: OrderChannel;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Sum of every payments row against this order — kept correct by a DB
   *  trigger on the payments table, never computed client-side, so a
   *  partial payment is reflected the instant it's registered. */
  paidTotal: number;
  /** "Guardar pago pendiente": the balance was left pending on purpose (a
   *  tab). Locks the payment screen while on; finishing the order then
   *  needs a customer linked (0100). */
  paymentPending: boolean;
  title: string | null;
  /** Snapshot — what was true when the order was placed, matching how
   *  order_items freezes its own name/price. Kept even when customerId
   *  below is set, and kept even after that customer is edited or
   *  deleted later. */
  customerName: string | null;
  customerPhone: string | null;
  /** The real link, when the order was placed against a known customer
   *  rather than just typed in free-hand. Null for a walk-in with no
   *  match picked (or created) during checkout. */
  customerId: string | null;
  tableId: string | null;
  /** Resolved via a join in list_orders — so a table-channel order can
   *  show "Mesa 5" without a second fetch. */
  tableName: string | null;
  address: string | null;
  notes: string | null;
  subtotal: number;
  discountTotal: number;
  serviceTotal: number;
  packagingTotal: number;
  deliveryTotal: number;
  total: number;
  currency: string;
  createdAt: string;
  acceptedAt: string | null;
  /** Stamped when the order reaches 'completed'/'cancelled' (set_order_status,
   *  0057) — null while it's still open. list_orders() itself never needed
   *  this (it's scoped to the still-open set), but get_order() and
   *  list_order_history() (0077) do, for the history screen's own
   *  "fecha creación/cierre" column and the detail drawer. */
  closedAt: string | null;
  /** What the customer picked as their way of paying at the web checkout —
   *  an intention, not a payment (0084). Null for panel orders. */
  paymentMethodId: string | null;
  /** The customer asked for an electronic invoice (data in `invoices`). */
  requiresInvoice: boolean;
  /** Promo code as typed at checkout; stored only, never applied (0084). */
  promoCode: string | null;
  /** Set when the order came from a delivery app (0106). Accepting,
   *  rejecting or cancelling it also has to reach that app — the provider
   *  routes those through the integration on its own. */
  externalSource: 'uber_eats' | null;
  /** The app's own short order code, the one the courier asks for. */
  externalDisplayId: string | null;
  /** The app's deadline to accept before it cancels on its own. */
  externalAcceptBy: string | null;
  items: OrderItem[];
}

/** Integraciones › Uber Eats (0106). */
export interface UberStore {
  id: string;
  uberStoreId: string;
  name: string | null;
  address: string | null;
  branchId: string | null;
  status: 'available' | 'active' | 'error';
  lastError: string | null;
}

export interface UberIntegration {
  connected: boolean;
  connectedAt: string | null;
  stores: UberStore[];
}

export type UberStoreAction =
  | { action: 'refresh' }
  | { action: 'link'; storeId: string; branchId: string }
  | { action: 'unlink'; storeId: string }
  | { action: 'disconnect' };

/** A table's occupancy is computed fresh on every read — whether a
 *  still-open order currently points at it — not a stored flag that
 *  could drift from reality if something forgot to clear it. */
export interface RestaurantTable {
  id: string;
  name: string;
  sortOrder: number;
  activeOrderId: string | null;
}

export interface DiningRoom {
  id: string;
  name: string;
  sortOrder: number;
  tables: RestaurantTable[];
}

/** One transaction against an order — an order can have several (part
 *  cash, part card, at different moments), which is the whole reason
 *  this is its own table instead of one amount field on the order. */
export interface Payment {
  id: string;
  orderId: string;
  method: string;
  amount: number;
  tip: number;
  createdAt: string;
}

/** One row in "Buscar pedido" — a deliberately smaller shape than Order:
 *  the drawer lists dozens of historical orders across every status and
 *  date, so it only carries what a summary row shows (no items/modifiers,
 *  which list_orders' Order DOES carry — fine for a handful of currently
 *  open orders, wasteful for a paginated search across the whole
 *  history). See search_orders() in 0073. */
/** What the live order feed reports when a new order row appears — just
 *  enough to decide whether to alert (who created it) and what to say
 *  (its number). The full order arrives through the normal list refetch. */
export interface OrderInsertEvent {
  id: string;
  number: number;
  source: OrderSource;
  channel: OrderChannel;
  status: OrderStatus;
  /** 'uber_eats' for an order from Uber (0106), so it gets the popup. */
  externalSource: 'uber_eats' | null;
}

export interface OrderSearchResult {
  id: string;
  branchId: string;
  number: number;
  code: string;
  channel: OrderChannel;
  source: OrderSource;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paidTotal: number;
  total: number;
  currency: string;
  customerName: string | null;
  tableName: string | null;
  itemCount: number;
  createdAt: string;
  /** null until the order reaches 'completed'/'cancelled' (orders.closed_at,
   *  stamped by set_order_status — see 0057). Drives the history table's
   *  own "fecha creación/cierre" second line. */
  closedAt: string | null;
  /** The most recently registered payment's method label, if any — "Efectivo",
   *  "Tarjeta", whatever the till was given at the time. Null before any
   *  payment lands on the order. */
  lastPaymentMethod: string | null;
  /** The order's free-text title ("uber jeder b"), shown above its number in
   *  the history. Only list_order_history returns it (0089); null elsewhere. */
  title: string | null;
  /** Every payment, oldest first — how the order was paid, or that it was
   *  split across several methods. Only list_order_history returns it
   *  (0089); an empty list elsewhere. */
  payments: { method: string; amount: number }[];
}

export interface OrderSearchResults {
  orders: OrderSearchResult[];
  total: number;
  page: number;
  pageSize: number;
}

/** "Ventas › Historial de pedidos" — a date-ranged, channel-grouped listing
 *  across every status (list_order_history, 0077). Distinct from a search:
 *  there's no query, just filters. */
export interface OrderHistoryFilters {
  /** ISO date (YYYY-MM-DD), inclusive on both ends. */
  dateFrom: string;
  dateTo: string;
  /** Whether the date range filters by when the order was placed or when
   *  it closed (completed/cancelled) — the reference's own "Creación /
   *  Cierre" toggle. */
  dateField: 'created' | 'closed';
  /** Time of day bounding the range, "HH:MM" (0089). Both null = the whole
   *  day. The range runs from dateFrom at timeFrom to dateTo at timeTo; an
   *  end time that isn't after the start (18:00–03:00) ends the next day. */
  timeFrom: string | null;
  timeTo: string | null;
  /** 'apps' = a third-party channel (Uber Eats and the like) placed it —
   *  see OrderSource. */
  channelGroup: 'all' | 'pos_web' | 'apps';
}

/** The history's "Resumen de caja", payments section: what was collected with
 *  each method over the same orders the list is showing (0090). Cancelled
 *  orders and tips are left out. */
export interface OrderHistorySummary {
  payments: {
    method: string;
    /** Number of payments (rows in `payments`), not orders. */
    count: number;
    amount: number;
  }[];
  /** Sum of `amount` over every method — the 100% the percentages are of. */
  paymentsTotal: number;
}

export interface OrderHistoryResults {
  orders: OrderSearchResult[];
  total: number;
  /** Sum of `total` across every matching order in the date range — NOT
   *  just the current page, so it reads the same whichever page you're on. */
  sumTotal: number;
  page: number;
  pageSize: number;
}

// ---- Discount codes ---------------------------------------------------------

/** 'order' discounts the whole ticket; 'products' only the targeted
 *  products/categories. */
export type DiscountScope = 'order' | 'products';
export type DiscountValueType = 'percent' | 'amount';
export type DiscountCustomerType = 'all' | 'new';

export interface DiscountCode {
  id: string;
  branchId: string;
  code: string;
  name: string;
  scope: DiscountScope;
  valueType: DiscountValueType;
  value: number;
  /** scope='products' only — discount just one unit of each matching product
   *  rather than every unit on the ticket. */
  applyOncePerProduct: boolean;
  startsOn: string;
  /** null = no end date. */
  endsOn: string | null;
  /** null = "Ilimitado" in the drawer's own wording. */
  redemptionLimit: number | null;
  redeemedCount: number;
  /** null = "Sin requisitos". */
  minPurchase: number | null;
  customerType: DiscountCustomerType;
  oncePerCustomer: boolean;
  /** Which service types the coupon is valid for. */
  channels: OrderChannel[];
  showInMenu: boolean;
  isActive: boolean;
  createdAt: string;
  /** scope='products' targets. Empty for scope='order'. */
  productIds: string[];
  categoryIds: string[];
}

export interface SaveDiscountCodeInput {
  branchId: string;
  code: string;
  name: string;
  scope: DiscountScope;
  valueType: DiscountValueType;
  value: number;
  applyOncePerProduct: boolean;
  startsOn: string;
  endsOn: string | null;
  redemptionLimit: number | null;
  minPurchase: number | null;
  customerType: DiscountCustomerType;
  oncePerCustomer: boolean;
  channels: OrderChannel[];
  showInMenu: boolean;
  productIds: string[];
  categoryIds: string[];
}

/** A repeat customer, shared across every branch of the account — not
 *  scoped per-branch, since the same person orders from whichever
 *  location is closest that day. */
export interface Customer {
  id: string;
  accountId: string;
  name: string;
  phone: string | null;
  address: string | null;
  addressLat: number | null;
  addressLng: number | null;
  createdAt: string;
}

export interface CreateCustomerInput {
  accountId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  addressLat?: number | null;
  addressLng?: number | null;
}

/** A line being built in the POS, before the order exists. */
export interface DraftOrderItem {
  productId: string | null;
  variantId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  packagingPrice: number;
  notes: string | null;
  modifiers: { optionId: string | null; groupName: string; optionName: string; priceDelta: number }[];
  /** Same meaning as OrderItem.createdAt — stamped client-side the moment
   *  a line is first added to the cart (PdvPage's addItem), preserved
   *  through quantity changes and edits to that same line, and rehydrated
   *  from the server's own order_items.created_at when a draft is resumed
   *  after a reload. See OrderItem.createdAt for why this is client- not
   *  server-authoritative. */
  createdAt: string;
}

export interface CreateOrderInput {
  branchId: string;
  channel: OrderChannel;
  items: DraftOrderItem[];
  title?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  notes?: string | null;
  discountTotal?: number;
  serviceTotal?: number;
  deliveryTotal?: number;
  /** Defaults to 'pending' server-side (create_order()'s own default) when
   *  omitted. Pass 'draft' for the PDV's "+ Nuevo pedido" — an order that
   *  starts empty and gets filled in over time, rather than assembled
   *  locally and sent all at once. A 'draft' is the only status allowed
   *  to have zero items; every other status still needs at least one. */
  status?: OrderStatus;
  /** Set when starting a draft from the "Mesas" grid for a specific
   *  table — that table shows as occupied everywhere else the instant
   *  this order exists, no separate "mark occupied" step. */
  tableId?: string | null;
}

// ---- Product image gallery ---------------------------------------------------

export interface ProductImage {
  id: string;
  productId: string;
  storagePath: string;
  publicUrl: string;
  /** 0 = the main image. Everything else is gallery order. */
  sortOrder: number;
}

export interface AddProductImageInput {
  productId: string;
  branchId: string;
  /** Already compressed client-side (see imageCompression.ts) before this
   *  ever reaches the provider. */
  file: Blob;
  /** True replaces whatever is currently the main image (sort_order 0) —
   *  its row and underlying Storage object are removed first. False appends
   *  to the end of the gallery. */
  isMain: boolean;
}


// ---- Cajas (0093) -------------------------------------------------------------

/** A cash register of a branch. Every branch has exactly one main register;
 *  others can take dining rooms (their tables' payments go to them). */
export interface CashRegister {
  id: string;
  name: string;
  isMain: boolean;
  roomIds: string[];
  /** The session currently open on it, if any. */
  openSessionId: string | null;
  lastClosedAt: string | null;
}

export type CashSessionStatus = 'open' | 'even' | 'short' | 'over';

/** Live totals of one payment method within a session. */
export interface CashSessionMethod {
  method: string;
  sales: number;
  tips: number;
  payments: number;
}

/** The frozen per-method row saved when a session is closed. */
export interface CashSessionCount {
  method: string;
  isCash: boolean;
  systemAmount: number;
  countedAmount: number | null;
  difference: number | null;
}

export interface CashSession {
  id: string;
  registerId: string;
  registerName: string;
  registerIsMain: boolean;
  openedAt: string;
  openedByName: string | null;
  openingAmount: number;
  closedAt: string | null;
  closedByName: string | null;
  notes: string | null;
  status: CashSessionStatus;
  salesTotal: number;
  tipsTotal: number;
  ordersCount: number;
  /** Opening amount + sales + tips while open; the saved total once closed. */
  systemTotal: number;
  countedTotal: number | null;
  difference: number | null;
  methods: CashSessionMethod[];
  counts: CashSessionCount[];
  /** Only from getCashSession: this register's open orders not fully paid. */
  unpaidOrders?: number;
}

export interface CloseCashSessionInput {
  sessionId: string;
  counts: { method: string; counted: number }[];
  /** The method the opening amount belongs to (the cash method's label). */
  cashMethod: string;
  notes: string;
}

// ---- Reportes (0101) ---------------------------------------------------------

/** Which date puts an order in a report's range. */
export type ReportBasis = 'created' | 'closed';

export interface ReportRange {
  /** Business days in Costa Rica time, YYYY-MM-DD, both inclusive. */
  from: string;
  to: string;
  basis: ReportBasis;
  /** Optional local hour window [hourFrom, hourTo). */
  hourFrom?: number | null;
  hourTo?: number | null;
  channel?: OrderChannel | null;
}

export interface ReportCount {
  key: string;
  n: number;
}

export interface ReportLine {
  name: string;
  qty: number;
  total: number;
}

export interface GeneralReport {
  kpis: { sales: number; orders: number; tips: number; prevSales: number; prevOrders: number; prevTips: number };
  byDay: { date: string; sales: number; prev: number }[];
  payments: { method: string; amount: number }[];
  /** ISO weekday (1 = Monday) × local hour → orders. */
  heat: { wd: number; h: number; n: number }[];
  sources: ReportCount[];
  channels: ReportCount[];
  /** completed / open / cancelled */
  statuses: ReportCount[];
  products: ReportLine[];
  modifiers: ReportLine[];
  free: ReportLine[];
  customers: {
    new: number;
    returning: number;
    top: { id: string; name: string; phone: string | null; orders: number; total: number }[];
  };
}

/** An order with a balance still owed (report_pending_payments). */
export interface PendingPaymentOrder {
  id: string;
  number: number;
  code: string;
  channel: OrderChannel;
  status: OrderStatus;
  createdAt: string;
  closedAt: string | null;
  total: number;
  paidTotal: number;
  paymentPending: boolean;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

/** One product (or variant) in Ganancias por producto. */
export interface ProductProfitRow {
  productId: string;
  variantId: string | null;
  name: string;
  qty: number;
  sale: number;
  /** Cost of the lines that had one; null when none did. */
  cost: number | null;
  /** Sales of the lines that had a cost — what profit is measured on. */
  saleWithCost: number | null;
  /** Some line was sold without a cost. */
  missingCost: boolean;
  /** Some line's cost was filled in afterwards (sold before 0101). */
  estimate: boolean;
  categoryIds: string[];
}
