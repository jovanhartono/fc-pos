import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignCodesTable,
  campaignStoresTable,
  campaignsTable,
  categoriesTable,
  complaintsTable,
  customersTable,
  itemImagesTable,
  itemsTable,
  orderCampaignsTable,
  orderCountersTable,
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceHandlerLogsTable,
  orderServiceStatusLogsTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
  paymentMethodsTable,
  productsTable,
  servicesTable,
  shiftsTable,
  storesTable,
  userStoresTable,
  usersTable,
} from "@/db/schema";

const SEED_NUMBER = 260_306;
const ADMIN_PASSWORD = "rojpyp-2cuzdo-rozmoP";
const CUSTOMER_COUNT = 120;
const VOUCHER_CODE_COUNT = 10;

// Days of work to seed, counted back from today. Shifts reach a week further
// so a Repair that reached QC on the oldest day still has a Shift to start on.
const WORK_LOOKBACK_DAYS = 45;
const SHIFT_LOOKBACK_DAYS = WORK_LOOKBACK_DAYS + 8;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Timestamps are stored as UTC, so a Jakarta clock time is written 7 hours
// earlier. Spelled out here rather than read from the machine's timezone.
const JAKARTA_OFFSET_MS = 7 * HOUR_MS;
// Of the first checks, the share that ends in a QC reject.
const QC_REJECT_RATE = 0.065;

// Crockford base32 (no 0/O/1/I/L) — mirrors the minting alphabet in
// campaign.repository.ts. Seeded voucher codes are bearer single-use secrets.
const CROCKFORD_CHARSET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const VOUCHER_CODE_LENGTH = 8;

const STORE_PRESETS = [
  {
    code: "KMG",
    name: "Fresclean Kemang",
    city: "Jakarta Selatan",
    latitude: "-6.26157800",
    longitude: "106.81273500",
  },
  {
    code: "BSD",
    name: "Fresclean BSD",
    city: "Tangerang",
    latitude: "-6.30184500",
    longitude: "106.65241300",
  },
  {
    code: "BKS",
    name: "Fresclean Bekasi",
    city: "Bekasi",
    latitude: "-6.24529300",
    longitude: "106.99825400",
  },
  {
    code: "BGR",
    name: "Fresclean Bogor",
    city: "Bogor",
    latitude: "-6.59850200",
    longitude: "106.79990400",
  },
] as const;

const CATEGORY_PRESETS = [
  { key: "deep_clean", name: "Deep Clean" },
  { key: "leather", name: "Leather Care" },
  { key: "suede", name: "Suede Care" },
  { key: "helmet", name: "Helmet" },
  { key: "sole_protector", name: "Sole Protector" },
  { key: "repaint", name: "Repaint" },
  { key: "repair", name: "Repair" },
  { key: "addons", name: "Add-Ons" },
  { key: "express", name: "Express" },
  { key: "retail", name: "Retail Product" },
] as const;

// Prices in IDR (rupiah). COGS approximated per service type.
const SERVICE_PRESETS = [
  // Deep Clean
  {
    code: "DCS",
    name: "Deep Clean Standard (Shoes / Hat)",
    categoryKey: "deep_clean",
    price: 60_000,
    cogs: 11_000,
  },
  {
    code: "DCE",
    name: "Deep Clean Express (6h to 24h)",
    // The two express services are the shop's priority lane: a treatment sold
    // from them jumps the queue, so the seed needs some on the rack to show it.
    is_priority: true,
    categoryKey: "deep_clean",
    price: 90_000,
    cogs: 16_000,
  },
  {
    code: "DCB",
    name: "Deep Clean Baby (up to EU 24)",
    categoryKey: "deep_clean",
    price: 30_000,
    cogs: 6000,
  },
  {
    code: "DCW",
    name: "Deep Clean Waist / Sling / Hand Bag",
    categoryKey: "deep_clean",
    price: 60_000,
    cogs: 11_000,
  },
  {
    code: "DCP",
    name: "Deep Clean Backpack / Tote Bag",
    categoryKey: "deep_clean",
    price: 80_000,
    cogs: 14_000,
  },
  {
    code: "DCL",
    name: "Deep Clean Luggage / Golf / Gym Bag",
    categoryKey: "deep_clean",
    price: 100_000,
    cogs: 18_000,
  },
  {
    code: "DCT",
    name: "Deep Clean Stroller",
    categoryKey: "deep_clean",
    price: 150_000,
    cogs: 27_000,
  },

  // Leather Care
  {
    code: "LCS",
    name: "Leather Care Standard",
    categoryKey: "leather",
    price: 125_000,
    cogs: 25_000,
  },
  {
    code: "LCB",
    name: "Leather Care Bag",
    categoryKey: "leather",
    price: 200_000,
    cogs: 40_000,
  },
  {
    code: "LCC",
    name: "Leather Care Complete (with Outsole Cleaning)",
    categoryKey: "leather",
    price: 150_000,
    cogs: 30_000,
  },

  // Suede Care
  {
    code: "SCC",
    name: "Suede Care Complete (Suede / Nubuck)",
    categoryKey: "suede",
    price: 150_000,
    cogs: 30_000,
  },

  // Helmet
  {
    code: "HLM",
    name: "Helmet Half / Full Face",
    categoryKey: "helmet",
    price: 80_000,
    cogs: 16_000,
  },

  // Sole Protector
  {
    code: "SPI",
    name: "Sole Protector Items Only",
    categoryKey: "sole_protector",
    price: 150_000,
    cogs: 60_000,
  },
  {
    code: "SPN",
    name: "Sole Protector Installation (6 Mo. Warranty)",
    categoryKey: "sole_protector",
    price: 275_000,
    cogs: 90_000,
  },

  // Repaint
  {
    code: "RPB",
    name: "Repaint Full Body",
    categoryKey: "repaint",
    price: 175_000,
    cogs: 35_000,
  },
  {
    code: "RPM",
    name: "Repaint Mid Sole",
    categoryKey: "repaint",
    price: 130_000,
    cogs: 26_000,
  },
  {
    code: "RPU",
    name: "Repaint Upper Sole",
    categoryKey: "repaint",
    price: 150_000,
    cogs: 30_000,
  },
  {
    code: "RP2",
    name: "Repaint Add Two Tone (2 Color)",
    categoryKey: "repaint",
    price: 50_000,
    cogs: 12_000,
  },
  {
    code: "RPC",
    name: "Repaint Add Checkerboard",
    categoryKey: "repaint",
    price: 100_000,
    cogs: 22_000,
  },
  {
    code: "RPG",
    name: "Repaint Bag",
    categoryKey: "repaint",
    price: 250_000,
    cogs: 50_000,
  },

  // Repair (6 Mo. Warranty)
  {
    code: "RGM",
    name: "Repair Minor Reglue",
    categoryKey: "repair",
    price: 35_000,
    cogs: 8000,
  },
  {
    code: "RGF",
    name: "Repair Full Sole Reglue",
    categoryKey: "repair",
    price: 150_000,
    cogs: 35_000,
  },
  {
    code: "RST",
    name: "Repair Restitch",
    categoryKey: "repair",
    price: 80_000,
    cogs: 18_000,
  },
  {
    code: "RLR",
    name: "Repair Leather Replacement",
    categoryKey: "repair",
    price: 120_000,
    cogs: 35_000,
  },
  {
    code: "RZP",
    name: "Repair Zipper Replacement",
    categoryKey: "repair",
    price: 90_000,
    cogs: 25_000,
  },
  {
    code: "RSS",
    name: "Repair Slide Swap",
    categoryKey: "repair",
    price: 500_000,
    cogs: 175_000,
  },
  {
    code: "RSO",
    name: "Repair Sole Swap",
    categoryKey: "repair",
    price: 200_000,
    cogs: 70_000,
  },
  {
    code: "RSY",
    name: "Repair Sole Swap Yeezy",
    categoryKey: "repair",
    price: 700_000,
    cogs: 280_000,
  },
  {
    code: "RSB",
    name: "Repair Sole Swap Balenciaga",
    categoryKey: "repair",
    price: 1_100_000,
    cogs: 440_000,
  },
  {
    code: "RSL",
    name: "Repair Sole Swap Louboutin",
    categoryKey: "repair",
    price: 1_110_000,
    cogs: 440_000,
  },
  {
    code: "RSN",
    name: "Repair Sole Swap Yonex SHB",
    categoryKey: "repair",
    price: 325_000,
    cogs: 110_000,
  },
  {
    code: "RHT",
    name: "Repair Heels Tip",
    categoryKey: "repair",
    price: 100_000,
    cogs: 28_000,
  },
  {
    code: "RLW",
    name: "Repair Luggage Wheels",
    categoryKey: "repair",
    price: 150_000,
    cogs: 50_000,
  },
  {
    code: "ROT",
    name: "Repair Others",
    categoryKey: "repair",
    price: 250_000,
    cogs: 80_000,
  },

  // Add-Ons
  {
    code: "AWT",
    name: "Add-On Whitening (Canvas)",
    categoryKey: "addons",
    price: 90_000,
    cogs: 14_000,
  },
  {
    code: "AHS",
    name: "Add-On Hard Stain (Mesh, Knit)",
    categoryKey: "addons",
    price: 40_000,
    cogs: 7000,
  },
  {
    code: "AUY",
    name: "Add-On Unyellow (Hard Rubber)",
    categoryKey: "addons",
    price: 50_000,
    cogs: 9000,
  },
  {
    code: "AUW",
    name: "Add-On Unwrinkle (Remove Creasing)",
    categoryKey: "addons",
    price: 50_000,
    cogs: 9000,
  },
  {
    code: "AHR",
    name: "Add-On Hat Reshape",
    categoryKey: "addons",
    price: 60_000,
    cogs: 10_000,
  },
  {
    code: "AWP",
    name: "Add-On Waterproof",
    categoryKey: "addons",
    price: 50_000,
    cogs: 12_000,
  },

  // Express
  {
    code: "EXP",
    name: "Express Skip the Line",
    categoryKey: "express",
    price: 30_000,
    cogs: 5000,
    is_priority: true,
  },
] as const;

const PAYMENT_METHODS = [
  { code: "CASH", name: "Cash" },
  { code: "QRIS", name: "QRIS" },
  { code: "BCA", name: "BCA Transfer" },
  { code: "GOPAY", name: "GoPay" },
  { code: "OVO", name: "OVO" },
] as const;

const BRANDS = [
  "Nike",
  "Adidas",
  "Puma",
  "Converse",
  "Vans",
  "New Balance",
  "Asics",
  "Skechers",
  "Compass",
] as const;

const SIZES = [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "41.5",
  "42.5",
] as const;

const SERVICE_NOTE_POOL = [
  "Mild yellowing on midsole",
  "Please keep suede texture soft",
  "Heavy dirt on outsole",
  "Customer asked for urgent handling",
  "Avoid aggressive brushing",
] as const;

type OrderServiceStatus =
  | "queued"
  | "processing"
  | "quality_check"
  | "qc_reject"
  | "ready_for_pickup"
  | "picked_up"
  | "refunded"
  | "cancelled";

type DiscountSource = "none" | "manual" | "campaign";

interface StoreRow {
  code: string;
  id: number;
  name: string;
}

interface CampaignRow {
  code: string;
  discount_type: "fixed" | "percentage" | "buy_n_get_m_free";
  discount_value: number;
  ends_at: Date | null;
  id: number;
  max_discount: number | null;
  min_order_total: number;
  redemption_mode: "listed" | "code";
  starts_at: Date | null;
  store_ids: Set<number>;
}

interface DraftStatusLog {
  changed_by: number;
  created_at: Date;
  from_status: OrderServiceStatus | null;
  note: string | null;
  to_status: OrderServiceStatus;
}

interface DraftHandlerLog {
  changed_by: number;
  created_at: Date;
  from_handler_id: number | null;
  note: string | null;
  to_handler_id: number | null;
}

interface DraftServiceLine {
  cogs: number;
  handler_id: number | null;
  handler_logs: DraftHandlerLog[];
  // Same rule as createOrder: a treatment inherits its Service's lane.
  is_priority: boolean;
  notes: string | null;
  price: number;
  service_id: number;
  status: OrderServiceStatus;
  status_logs: DraftStatusLog[];
}

// One physical object over the counter (ADR-0017). The tag, the descriptors
// the cashier reads off it, and the drop-off photo of its condition belong
// here (ADR-0019); each treatment sold against it keeps its own status,
// handler and price.
interface DraftItem {
  brand: string;
  color: string;
  item_code: string;
  model: string;
  photos: Array<{
    created_at: Date;
    note: string | null;
    uploaded_by: number | null;
  }>;
  size: string;
  treatments: DraftServiceLine[];
}

// How often the next treatment is an upsell on the object already on the
// counter rather than a new object. The shop's most common flow is a pair
// arriving for a deep clean and leaving as deep clean + repaint + leather
// care, so this is deliberately high enough that the grouped queue and the
// pickup gate both get realistic data to work against.
const UPSELL_ON_SAME_ITEM_CHANCE = 0.45;

interface DraftProductLine {
  cogs: number;
  price: number;
  product_id: number;
  qty: number;
}

const TERMINAL_SERVICE_STATUSES = new Set<OrderServiceStatus>([
  "picked_up",
  "refunded",
  "cancelled",
]);

function asMoney(value: number): string {
  return Math.round(value).toString();
}

function chance(probability: number): boolean {
  return faker.datatype.boolean({ probability });
}

function randInt(min: number, max: number): number {
  return faker.number.int({ min, max });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeForS3(value: string): string {
  return slugify(value).replace(/-/g, "_");
}

// Deterministic (faker-seeded) voucher code so re-seeds are reproducible.
function generateVoucherCode(): string {
  return Array.from({ length: VOUCHER_CODE_LENGTH }, () =>
    faker.helpers.arrayElement(CROCKFORD_CHARSET.split(""))
  ).join("");
}

function createStatusNote(nextStatus: OrderServiceStatus): string {
  if (nextStatus === "queued") {
    return faker.helpers.arrayElement([
      "Item tagged and moved into the cleaning queue",
      "Queued for the next cleaning batch",
      "Item verified and lined up for processing",
    ]);
  }

  if (nextStatus === "processing") {
    return faker.helpers.arrayElement([
      "Cleaning started with material-safe treatment",
      "Main cleaning process started",
      "Technician began detailed cleaning work",
    ]);
  }

  if (nextStatus === "quality_check") {
    return faker.helpers.arrayElement([
      "Finishing complete and moved to quality control",
      "Quality team is checking the cleaning result",
      "Final inspection started before release",
    ]);
  }

  if (nextStatus === "qc_reject") {
    return faker.helpers.arrayElement([
      "QC flagged residue, sent back for rework",
      "Rejected at quality check — needs reprocessing",
      "Finishing inconsistency found, returning to worker",
    ]);
  }

  if (nextStatus === "ready_for_pickup") {
    return faker.helpers.arrayElement([
      "Cleaning completed and item is ready for pickup",
      "Item packed and awaiting customer pickup",
      "Work finished and customer can be notified",
    ]);
  }

  if (nextStatus === "picked_up") {
    return faker.helpers.arrayElement([
      "Customer picked up the item in good condition",
      "Order handed over to customer",
      "Pickup completed at the counter",
    ]);
  }

  if (nextStatus === "refunded") {
    return faker.helpers.arrayElement([
      "Service refunded after final review",
      "Refund processed and item marked as closed",
      "Refund approved with supporting documentation",
    ]);
  }

  return faker.helpers.arrayElement([
    "Order cancelled after customer confirmation",
    "Service cancelled and removed from active work queue",
    "Cancellation recorded in the service timeline",
  ]);
}

function pickWeighted<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = faker.number.float({ min: 0, max: total, fractionDigits: 6 });

  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item.item;
    }
  }

  const fallback = items.at(-1);
  if (!fallback) {
    throw new Error("Weighted pick called with empty items");
  }

  return fallback.item;
}

function resolveOrderStatus(
  serviceStatuses: OrderServiceStatus[],
  productCount: number
): "created" | "processing" | "ready_for_pickup" | "completed" | "cancelled" {
  if (serviceStatuses.length === 0) {
    return productCount > 0 ? "completed" : "created";
  }

  const allQueued = serviceStatuses.every((status) => status === "queued");
  if (allQueued) {
    return "created";
  }

  const allTerminal = serviceStatuses.every((status) =>
    TERMINAL_SERVICE_STATUSES.has(status)
  );
  if (allTerminal) {
    return "completed";
  }

  const activeStatuses = serviceStatuses.filter(
    (status) => !TERMINAL_SERVICE_STATUSES.has(status)
  );
  if (activeStatuses.every((status) => status === "ready_for_pickup")) {
    return "ready_for_pickup";
  }

  return "processing";
}

function createOrderCode(
  storeCode: string,
  createdAt: Date,
  counters: Map<string, number>
): string {
  const iso = new Date(createdAt.getTime() + JAKARTA_OFFSET_MS).toISOString();
  const dateStr = `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
  const key = `${storeCode}:${dateStr}`;
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return `#${storeCode}/${dateStr}/${next}`;
}

function chooseDiscount(
  grossTotal: number,
  createdAt: Date,
  storeId: number,
  campaigns: CampaignRow[]
): {
  campaign_id: number | null;
  discount: number;
  discount_source: DiscountSource;
} {
  const eligible = campaigns.filter((campaign) => {
    // Vouchers (code-mode) are bearer, per-code single-use — never auto-applied
    // to a seeded order. Only listed campaigns show up in the POS discount pool.
    if (campaign.redemption_mode === "code") {
      return false;
    }
    if (campaign.store_ids.size > 0 && !campaign.store_ids.has(storeId)) {
      return false;
    }
    if (campaign.starts_at && createdAt < campaign.starts_at) {
      return false;
    }
    if (campaign.ends_at && createdAt > campaign.ends_at) {
      return false;
    }
    return grossTotal >= campaign.min_order_total;
  });

  if (eligible.length > 0 && chance(0.35)) {
    const campaign = faker.helpers.arrayElement(eligible);
    let discount =
      campaign.discount_type === "fixed"
        ? campaign.discount_value
        : Math.floor((grossTotal * campaign.discount_value) / 100);

    if (campaign.max_discount !== null) {
      discount = Math.min(discount, campaign.max_discount);
    }

    discount = Math.max(0, Math.min(discount, grossTotal));
    if (discount > 0) {
      return {
        campaign_id: campaign.id,
        discount,
        discount_source: "campaign",
      };
    }
  }

  if (chance(0.22)) {
    const manual = Math.min(
      randInt(5000, 30_000),
      Math.floor(grossTotal * 0.25)
    );
    if (manual > 0) {
      return {
        campaign_id: null,
        discount: manual,
        discount_source: "manual",
      };
    }
  }

  return {
    campaign_id: null,
    discount: 0,
    discount_source: "none",
  };
}

async function resetDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE
      "order_refund_items",
      "order_refunds",
      "order_service_handler_logs",
      "order_service_status_logs",
      "item_images",
      "order_pickup_events",
      "orders_products",
      "orders_services",
      "items",
      "order_campaigns",
      "orders",
      "order_counters",
      "shifts",
      "campaign_stores",
      "campaign_codes",
      "campaigns",
      "payment_methods",
      "products",
      "services",
      "categories",
      "customers",
      "user_stores",
      "stores",
      "users"
    RESTART IDENTITY CASCADE
  `);
}

function seedStores() {
  return db
    .insert(storesTable)
    .values(
      STORE_PRESETS.map((store) => ({
        code: store.code,
        name: store.name,
        phone_number: `+62811${faker.number.int({ min: 100_000, max: 999_999 })}`,
        address: `${faker.location.streetAddress()}, ${store.city}`,
        latitude: store.latitude,
        longitude: store.longitude,
        is_active: true,
      }))
    )
    .returning({
      id: storesTable.id,
      code: storesTable.code,
      name: storesTable.name,
    });
}

async function seedUsers(stores: StoreRow[]) {
  const passwordHash = await Bun.password.hash(ADMIN_PASSWORD);

  const userRows: Array<{
    username: string;
    name: string;
    role: "admin" | "cashier" | "worker" | "courier";
    is_active: boolean;
    can_process_pickup: boolean;
    password: string;
  }> = [
    {
      username: "admin",
      name: "Fresclean Admin",
      role: "admin",
      is_active: true,
      can_process_pickup: false,
      password: passwordHash,
    },
  ];

  for (const store of stores) {
    const lowerCode = store.code.toLowerCase();
    userRows.push(
      {
        username: `cashier.${lowerCode}`,
        name: faker.person.fullName(),
        role: "cashier",
        is_active: true,
        can_process_pickup: false,
        password: passwordHash,
      },
      {
        // Designated backup cashier — may process pickups while the cashier
        // is on holiday, even though their day-job is on the production line.
        username: `worker.${lowerCode}.1`,
        name: faker.person.fullName(),
        role: "worker",
        is_active: true,
        can_process_pickup: true,
        password: passwordHash,
      },
      {
        username: `worker.${lowerCode}.2`,
        name: faker.person.fullName(),
        role: "worker",
        is_active: true,
        can_process_pickup: false,
        password: passwordHash,
      }
    );
  }

  // Two roaming couriers — collect items at intake, deliver finished items
  // back. They log in only to clock a Shift; excluded from the worker
  // productivity report by allowlist (see ADR-0010).
  userRows.push(
    {
      username: "courier.1",
      name: faker.person.fullName(),
      role: "courier",
      is_active: true,
      can_process_pickup: false,
      password: passwordHash,
    },
    {
      username: "courier.2",
      name: faker.person.fullName(),
      role: "courier",
      is_active: true,
      can_process_pickup: false,
      password: passwordHash,
    }
  );

  const users = await db.insert(usersTable).values(userRows).returning({
    id: usersTable.id,
    username: usersTable.username,
    role: usersTable.role,
  });

  const userByUsername = new Map(users.map((user) => [user.username, user]));
  const assignments: Array<{ user_id: number; store_id: number }> = [];

  for (const store of stores) {
    const lowerCode = store.code.toLowerCase();
    const usernames = [
      `cashier.${lowerCode}`,
      `worker.${lowerCode}.1`,
      `worker.${lowerCode}.2`,
    ];

    for (const username of usernames) {
      const user = userByUsername.get(username);
      if (!user) {
        continue;
      }
      assignments.push({ user_id: user.id, store_id: store.id });
    }
  }

  // Couriers roam — assign to every store so they can clock a Shift anywhere.
  for (const username of ["courier.1", "courier.2"]) {
    const courier = userByUsername.get(username);
    if (!courier) {
      continue;
    }
    for (const store of stores) {
      assignments.push({ user_id: courier.id, store_id: store.id });
    }
  }

  await db.insert(userStoresTable).values(assignments);

  return {
    users,
    userByUsername,
  };
}

async function seedCatalog(adminId: number) {
  const categories = await db
    .insert(categoriesTable)
    .values(
      CATEGORY_PRESETS.map((category) => ({
        name: category.name,
        description: faker.lorem.sentence(),
        is_active: true,
      }))
    )
    .returning({
      id: categoriesTable.id,
      name: categoriesTable.name,
    });

  const categoryByKey = new Map<string, number>();
  for (let index = 0; index < CATEGORY_PRESETS.length; index++) {
    categoryByKey.set(CATEGORY_PRESETS[index].key, categories[index].id);
  }

  const services = await db
    .insert(servicesTable)
    .values(
      SERVICE_PRESETS.map((service) => ({
        category_id: categoryByKey.get(service.categoryKey) ?? categories[0].id,
        code: service.code,
        name: service.name,
        description: faker.lorem.sentence(),
        cogs: asMoney(service.cogs),
        price: asMoney(service.price),
        is_active: true,
        is_priority: "is_priority" in service ? service.is_priority : false,
      }))
    )
    .returning({
      id: servicesTable.id,
      code: servicesTable.code,
      price: servicesTable.price,
      cogs: servicesTable.cogs,
      is_active: servicesTable.is_active,
      is_priority: servicesTable.is_priority,
    });

  const retailCategoryId = categoryByKey.get("retail") ?? categories[0].id;
  const skuSet = new Set<string>();
  const productsToCreate = Array.from({ length: 12 }, (_, index) => {
    let sku = "";
    do {
      sku = `FC${faker.string.alphanumeric({ length: 7, casing: "upper" })}${String(index)}`;
      sku = sku.replace(/[^A-Z0-9]/g, "A");
    } while (skuSet.has(sku));
    skuSet.add(sku);

    return {
      category_id: retailCategoryId,
      sku,
      name: `${faker.commerce.productAdjective()} ${faker.helpers.arrayElement(["Cleaner", "Spray", "Brush", "Laces", "Conditioner"])}`,
      description: faker.commerce.productDescription(),
      cogs: asMoney(randInt(8000, 45_000)),
      price: asMoney(randInt(20_000, 95_000)),
      stock: randInt(40, 250),
      uom: faker.helpers.arrayElement(["pcs", "bottle", "pair", "pack", "set"]),
      is_active: true,
    };
  });

  const products = await db
    .insert(productsTable)
    .values(productsToCreate)
    .returning({
      id: productsTable.id,
      sku: productsTable.sku,
      price: productsTable.price,
      cogs: productsTable.cogs,
      is_active: productsTable.is_active,
    });

  const paymentMethods = await db
    .insert(paymentMethodsTable)
    .values(PAYMENT_METHODS.map((method) => ({ ...method, is_active: true })))
    .returning({
      id: paymentMethodsTable.id,
      code: paymentMethodsTable.code,
      is_active: paymentMethodsTable.is_active,
    });

  const campaignSeed = [
    {
      code: "GOOGLE_REVIEW",
      name: "Google review",
      discount_type: "percentage" as const,
      discount_value: 10,
      min_order_total: 0,
      max_discount: null,
      starts_at: null,
      ends_at: null,
      is_active: true,
      redemption_mode: "listed" as const,
      scope_codes: [],
    },
    {
      code: "WEEKEND10",
      name: faker.company.buzzPhrase(),
      discount_type: "percentage" as const,
      discount_value: 10,
      min_order_total: 120_000,
      max_discount: 30_000,
      starts_at: dayjs().subtract(30, "day").startOf("day").toDate(),
      ends_at: dayjs().add(60, "day").endOf("day").toDate(),
      is_active: true,
      redemption_mode: "listed" as const,
      scope_codes: ["KMG", "BSD", "BKS"],
    },
    {
      code: "NEWCUST15",
      name: faker.company.buzzPhrase(),
      discount_type: "fixed" as const,
      discount_value: 15_000,
      min_order_total: 75_000,
      max_discount: null,
      starts_at: dayjs().subtract(100, "day").startOf("day").toDate(),
      ends_at: null,
      is_active: true,
      redemption_mode: "listed" as const,
      scope_codes: [],
    },
    {
      code: "PAYDAY20",
      name: faker.company.buzzPhrase(),
      discount_type: "percentage" as const,
      discount_value: 20,
      min_order_total: 150_000,
      max_discount: 40_000,
      starts_at: dayjs().subtract(90, "day").startOf("day").toDate(),
      ends_at: dayjs().subtract(7, "day").endOf("day").toDate(),
      is_active: false,
      redemption_mode: "listed" as const,
      scope_codes: [],
    },
    {
      code: "BKSOPEN25",
      name: faker.company.buzzPhrase(),
      discount_type: "fixed" as const,
      discount_value: 25_000,
      min_order_total: 100_000,
      max_discount: null,
      starts_at: dayjs().subtract(15, "day").startOf("day").toDate(),
      ends_at: dayjs().add(20, "day").endOf("day").toDate(),
      is_active: true,
      redemption_mode: "listed" as const,
      scope_codes: ["BKS"],
    },
    {
      // Voucher campaign — bearer, per-code single-use. usage_limit MUST stay
      // null (campaign_mode_exclusivity_check: code-mode forbids a global cap).
      // Codes are minted after insert (VOUCHER_CODE_COUNT rows).
      code: "VIP_LAUNCH",
      name: "VIP Launch Voucher",
      discount_type: "percentage" as const,
      discount_value: 25,
      min_order_total: 100_000,
      max_discount: 75_000,
      starts_at: dayjs().subtract(10, "day").startOf("day").toDate(),
      ends_at: dayjs().add(30, "day").endOf("day").toDate(),
      is_active: true,
      redemption_mode: "code" as const,
      scope_codes: [],
    },
  ];

  const campaigns = await db
    .insert(campaignsTable)
    .values(
      campaignSeed.map((campaign) => ({
        code: campaign.code,
        name: campaign.name,
        discount_type: campaign.discount_type,
        discount_value: asMoney(campaign.discount_value),
        min_order_total: asMoney(campaign.min_order_total),
        max_discount:
          campaign.max_discount === null
            ? null
            : asMoney(campaign.max_discount),
        starts_at: campaign.starts_at,
        ends_at: campaign.ends_at,
        is_active: campaign.is_active,
        redemption_mode: campaign.redemption_mode,
        created_by: adminId,
        updated_by: adminId,
      }))
    )
    .returning({
      id: campaignsTable.id,
      code: campaignsTable.code,
      discount_type: campaignsTable.discount_type,
      discount_value: campaignsTable.discount_value,
      min_order_total: campaignsTable.min_order_total,
      max_discount: campaignsTable.max_discount,
      starts_at: campaignsTable.starts_at,
      ends_at: campaignsTable.ends_at,
      redemption_mode: campaignsTable.redemption_mode,
    });

  // Mint bearer codes for every voucher (code-mode) campaign. Codes are unique
  // per the campaign_codes_code_uidx; the Set guards intra-seed collisions.
  const voucherCampaigns = campaigns.filter(
    (campaign) => campaign.redemption_mode === "code"
  );
  if (voucherCampaigns.length > 0) {
    const mintedCodes = new Set<string>();
    const codeRows: Array<{ campaign_id: number; code: string }> = [];

    for (const campaign of voucherCampaigns) {
      for (let index = 0; index < VOUCHER_CODE_COUNT; index++) {
        let code = generateVoucherCode();
        while (mintedCodes.has(code)) {
          code = generateVoucherCode();
        }
        mintedCodes.add(code);
        codeRows.push({ campaign_id: campaign.id, code });
      }
    }

    await db.insert(campaignCodesTable).values(codeRows);
  }

  return {
    services,
    products,
    paymentMethods,
    categories,
    campaigns,
    campaignSeed,
  };
}

function seedCustomers(
  stores: StoreRow[],
  cashiersByStore: Map<number, number[]>
) {
  const storeWeights = stores.map((store) => {
    if (store.code === "KMG") {
      return { item: store.id, weight: 35 };
    }
    if (store.code === "BSD") {
      return { item: store.id, weight: 30 };
    }
    if (store.code === "BKS") {
      return { item: store.id, weight: 20 };
    }
    return { item: store.id, weight: 15 };
  });

  const customerRows: Array<{
    name: string;
    phone_number: string;
    email: string | null;
    address: string;
    origin_store_id: number;
    created_by: number;
    updated_by: number;
  }> = [];

  for (let index = 0; index < CUSTOMER_COUNT; index++) {
    const originStoreId = pickWeighted(storeWeights);
    const cashiers = cashiersByStore.get(originStoreId) ?? [];
    const actorId = faker.helpers.arrayElement(cashiers);
    customerRows.push({
      name: faker.person.fullName(),
      phone_number: `+62812${String(1_000_000 + index).padStart(7, "0")}`,
      email: chance(0.25) ? null : faker.internet.email(),
      address: `${faker.location.streetAddress()}, ${faker.location.city()}`,
      origin_store_id: originStoreId,
      created_by: actorId,
      updated_by: actorId,
    });
  }

  return db.insert(customersTable).values(customerRows).returning({
    id: customersTable.id,
    origin_store_id: customersTable.origin_store_id,
  });
}

// ───────────────────────── Time ─────────────────────────

// Jakarta calendar days as whole numbers (day 0 is Thursday 1970-01-01), so a
// "day" never depends on the timezone of the machine running the seed.
function jakartaDayNumber(at: number): number {
  return Math.floor((at + JAKARTA_OFFSET_MS) / DAY_MS);
}

function jakartaDayStartAt(day: number): number {
  return day * DAY_MS - JAKARTA_OFFSET_MS;
}

function jakartaHour(at: number): number {
  return Math.floor(((at + JAKARTA_OFFSET_MS) % DAY_MS) / HOUR_MS);
}

function isSunday(day: number): boolean {
  return (day + 4) % 7 === 0;
}

function chunked<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}

// ───────────────────────── Shifts ─────────────────────────

type ShiftInsert = typeof shiftsTable.$inferInsert;
type OrderServiceInsert = typeof ordersServicesTable.$inferInsert;

interface ShiftWindow {
  day: number;
  end: number;
  start: number;
}

// Each worker's Shifts, oldest first. The order seed places every move by
// asking this book, so nobody is recorded working while clocked out.
type ShiftBook = Map<number, ShiftWindow[]>;

interface WorkerProfile {
  attendance: number;
  dailyLoad: () => number;
}

// Rough Services per day worked at each Store. Keeps every worker inside 6 to 12.
const STORE_LOAD: Record<string, number> = {
  BGR: 0.95,
  BKS: 1,
  BSD: 1.05,
  KMG: 1.15,
};

// Share of working days attended by [worker 1, worker 2]. Worker 2 at the two
// smaller Stores is the part-timer, so their report row shows fewer days worked.
const ATTENDANCE: Record<string, [number, number]> = {
  BGR: [0.94, 0.3],
  BKS: [0.92, 0.5],
  BSD: [0.95, 0.88],
  KMG: [0.96, 0.9],
};

// Today the live view needs people on the floor, so these Stores' workers have
// clocked in this morning and not out.
const OPEN_TODAY_STORES = new Set(["KMG", "BSD"]);

// Worker 1 is steady, with a narrow daily range. Worker 2 is spiky: some very
// busy days and some slow ones, about the same average.
function workerProfile(storeCode: string, slot: number): WorkerProfile {
  const load = STORE_LOAD[storeCode] ?? 1;
  const attendance = ATTENDANCE[storeCode]?.[slot] ?? 0.9;
  if (slot === 0) {
    return {
      attendance,
      dailyLoad: () => Math.round(load * 9 + randInt(-1, 1)),
    };
  }
  return {
    attendance,
    dailyLoad: () => {
      const roll = faker.number.float({ min: 0, max: 1 });
      if (roll < 0.25) {
        return Math.round(load * randInt(14, 19));
      }
      if (roll < 0.65) {
        return Math.round(load * randInt(6, 10));
      }
      return Math.max(1, Math.round(load * randInt(2, 5)));
    },
  };
}

// One worker's Shifts over the lookback: Mondays to Saturdays they turned up,
// clocking in 07:00 to 09:59 for 7 to 9 hours. Open ones have no clock-out yet.
function planShifts(storeCode: string, slot: number, now: number) {
  const today = jakartaDayNumber(now);
  const { attendance } = workerProfile(storeCode, slot);
  const shifts: Array<ShiftWindow & { clockOut: number | null }> = [];
  for (let day = today - SHIFT_LOOKBACK_DAYS; day <= today; day++) {
    const isToday = day === today;
    const keptOpen = isToday && OPEN_TODAY_STORES.has(storeCode);
    if ((isSunday(day) && !isToday) || !(keptOpen || chance(attendance))) {
      continue;
    }
    const clockIn =
      jakartaDayStartAt(day) + randInt(7 * 60, 9 * 60 + 59) * MINUTE_MS;
    if (clockIn > now - 20 * MINUTE_MS) {
      continue;
    }
    const clockOut = clockIn + randInt(7, 9) * HOUR_MS;
    const isOpen = isToday && (keptOpen || clockOut > now);
    shifts.push({
      clockOut: isOpen ? null : clockOut,
      day,
      end: isOpen ? now : clockOut,
      start: clockIn,
    });
  }
  return shifts;
}

async function seedShifts(
  stores: StoreRow[],
  workersByStore: Map<number, number[]>
): Promise<ShiftBook> {
  const now = Date.now();
  const book: ShiftBook = new Map();
  const rows: ShiftInsert[] = [];

  for (const store of stores) {
    const workers = workersByStore.get(store.id) ?? [];
    for (const [slot, workerId] of workers.entries()) {
      const shifts = planShifts(store.code, slot, now);
      book.set(
        workerId,
        shifts.map(({ day, end, start }) => ({ day, end, start }))
      );
      for (const shift of shifts) {
        rows.push({
          user_id: workerId,
          store_id: store.id,
          clock_in_at: new Date(shift.start),
          clock_out_at:
            shift.clockOut === null ? null : new Date(shift.clockOut),
        });
      }
    }
  }

  for (const chunk of chunked(rows, 1000)) {
    await db.insert(shiftsTable).values(chunk);
  }
  return book;
}

function isOnShift(book: ShiftBook, userId: number, at: number): boolean {
  return (book.get(userId) ?? []).some(
    (window) => at >= window.start && at <= window.end
  );
}

// A random moment, to the minute, while `userId` was clocked in somewhere
// between `from` and `to`. Null when they were not on shift at all in that stretch.
function pickOnShift(
  book: ShiftBook,
  userId: number,
  from: number,
  to: number
): number | null {
  const spans: Array<{ hi: number; lo: number }> = [];
  let total = 0;
  for (const window of book.get(userId) ?? []) {
    const lo = Math.max(window.start, from);
    const hi = Math.min(window.end, to);
    if (hi > lo) {
      spans.push({ hi, lo });
      total += hi - lo;
    }
  }
  if (total === 0) {
    return null;
  }
  let cursor = faker.number.float({ min: 0, max: total });
  for (const span of spans) {
    if (cursor <= span.hi - span.lo) {
      const at = Math.floor((span.lo + cursor) / MINUTE_MS) * MINUTE_MS;
      return Math.max(span.lo, at);
    }
    cursor -= span.hi - span.lo;
  }
  return spans.at(-1)?.lo ?? null;
}

// ───────────────────────── Work on the Services ─────────────────────────

// How long a Service sits between starting and first reaching quality check.
// Express is the same-day lane; Repair and Repaint take days.
type ServiceKind = "express" | "long" | "standard";

const DURATION_HOURS: Record<ServiceKind, readonly [number, number]> = {
  express: [2, 24],
  long: [72, 168],
  standard: [24, 72],
};

const KIND_MIX: Array<{ item: ServiceKind; weight: number }> = [
  { item: "standard", weight: 68 },
  { item: "long", weight: 20 },
  { item: "express", weight: 12 },
];

// How far back a Service still in hand (not yet at quality check) can have started.
const IN_HAND_WINDOW_HOURS: Record<ServiceKind, number> = {
  express: 8,
  long: 100,
  standard: 40,
};

const CATEGORY_WEIGHT: Record<string, number> = {
  addons: 3,
  deep_clean: 6,
  express: 1,
  helmet: 5,
  leather: 5,
  repaint: 6,
  repair: 3,
  sole_protector: 3,
  suede: 5,
};

const CATEGORY_KEY_BY_SERVICE_CODE = new Map<string, string>(
  SERVICE_PRESETS.map((service) => [service.code, service.categoryKey])
);

interface SeedService {
  code: string;
  cogs: string;
  id: number;
  is_priority: boolean;
  price: string;
}

type ServicePools = Record<
  ServiceKind,
  Array<{ item: SeedService; weight: number }>
>;

function serviceKindOf(service: SeedService): ServiceKind {
  if (service.is_priority) {
    return "express";
  }
  const category = CATEGORY_KEY_BY_SERVICE_CODE.get(service.code);
  return category === "repair" || category === "repaint" ? "long" : "standard";
}

function buildServicePools(services: SeedService[]): ServicePools {
  const pools: ServicePools = { express: [], long: [], standard: [] };
  for (const service of services) {
    const category = CATEGORY_KEY_BY_SERVICE_CODE.get(service.code) ?? "";
    pools[serviceKindOf(service)].push({
      item: service,
      // The plain shoe wash is most of what comes over the counter.
      weight: service.code === "DCS" ? 40 : (CATEGORY_WEIGHT[category] ?? 3),
    });
  }
  return pools;
}

function pickAnyService(pools: ServicePools): SeedService {
  return pickWeighted(pools[pickWeighted(KIND_MIX)]);
}

interface Crew {
  adminId: number;
  cashierId: number;
  store: StoreRow;
  workerIds: number[];
}

interface PlanContext {
  book: ShiftBook;
  now: number;
  pools: ServicePools;
  today: number;
}

interface LineEvent {
  at: number;
  by: number;
  to: OrderServiceStatus;
}

interface PlannedWork {
  events: LineEvent[];
  handlerId: number;
  handlerLogs: DraftHandlerLog[];
}

// Someone checks an Item a little after the cleaner hands it over: now and then
// the cleaner (a self-check), more often the other worker, else the cashier or
// admin. A worker only checks while clocked in.
function pickChecker(
  crew: Crew,
  ctx: PlanContext,
  cleanerId: number,
  finishedAt: number
): { at: number; by: number } {
  const other = crew.workerIds.find((id) => id !== cleanerId);
  const roll = faker.number.float({ min: 0, max: 1 });
  let candidate: number | undefined;
  if (roll < 0.08) {
    candidate = cleanerId;
  } else if (roll < 0.6) {
    candidate = other;
  }
  if (candidate !== undefined) {
    const at = pickOnShift(
      ctx.book,
      candidate,
      finishedAt + 10 * MINUTE_MS,
      finishedAt + 4 * HOUR_MS
    );
    if (at !== null) {
      return { at, by: candidate };
    }
  }
  return {
    at: finishedAt + randInt(10, 180) * MINUTE_MS,
    by: chance(0.8) ? crew.cashierId : crew.adminId,
  };
}

// An Item with a QC reject goes to the cleaner again, or sometimes to the other worker,
// on a later Shift. If nobody on shift can take it, it waits at qc_reject.
function planRedo(
  crew: Crew,
  ctx: PlanContext,
  work: PlannedWork,
  starterId: number,
  rejectedAt: number
) {
  const other = crew.workerIds.find((id) => id !== starterId);
  const candidates =
    other !== undefined && chance(0.3)
      ? [other, starterId]
      : [starterId, ...(other === undefined ? [] : [other])];
  for (const redoer of candidates) {
    const redoStart = pickOnShift(
      ctx.book,
      redoer,
      rejectedAt + 30 * MINUTE_MS,
      rejectedAt + 30 * HOUR_MS
    );
    if (redoStart === null) {
      continue;
    }
    work.events.push({ at: redoStart, by: redoer, to: "processing" });
    if (redoer !== starterId) {
      work.handlerLogs.push({
        changed_by: redoer,
        created_at: new Date(redoStart - MINUTE_MS),
        from_handler_id: starterId,
        note: "Took over the redo",
        to_handler_id: redoer,
      });
    }
    work.handlerId = redoer;
    const redoFinish = pickOnShift(
      ctx.book,
      redoer,
      redoStart + 2 * HOUR_MS,
      redoStart + 40 * HOUR_MS
    );
    if (redoFinish === null) {
      return;
    }
    work.events.push({ at: redoFinish, by: redoer, to: "quality_check" });
    const check = pickChecker(crew, ctx, redoer, redoFinish);
    work.events.push({ at: check.at, by: check.by, to: "ready_for_pickup" });
    return;
  }
  // Nobody could take it for over a day: say it passed rather than leave an
  // old pair stuck at qc_reject.
  if (rejectedAt + 30 * HOUR_MS < ctx.now) {
    const last = work.events.at(-1);
    if (last) {
      last.to = "ready_for_pickup";
    }
  }
}

// One Service's moves: started on a Shift, handed to quality check (`finishAt`,
// null while still in hand), checked, and in a few cases sent back and redone.
function planWork(
  crew: Crew,
  ctx: PlanContext,
  starterId: number,
  startAt: number,
  finishAt: number | null
): PlannedWork {
  const work: PlannedWork = {
    events: [{ at: startAt, by: starterId, to: "processing" }],
    handlerId: starterId,
    handlerLogs: [
      {
        changed_by: starterId,
        created_at: new Date(startAt - randInt(1, 15) * MINUTE_MS),
        from_handler_id: null,
        note: "Claimed by worker",
        to_handler_id: starterId,
      },
    ],
  };
  if (finishAt === null) {
    return work;
  }

  const other = crew.workerIds.find((id) => id !== starterId);
  const mover =
    other !== undefined && chance(0.15) && isOnShift(ctx.book, other, finishAt)
      ? other
      : starterId;
  work.events.push({ at: finishAt, by: mover, to: "quality_check" });

  const check = pickChecker(crew, ctx, starterId, finishAt);
  if (chance(QC_REJECT_RATE)) {
    work.events.push({ at: check.at, by: check.by, to: "qc_reject" });
    planRedo(crew, ctx, work, starterId, check.at);
  } else {
    work.events.push({ at: check.at, by: check.by, to: "ready_for_pickup" });
  }
  work.events = work.events.filter((event) => event.at <= ctx.now);
  return work;
}

function toStatusLogs(events: LineEvent[]): DraftStatusLog[] {
  let from: OrderServiceStatus = "queued";
  return events.map((event) => {
    const log: DraftStatusLog = {
      changed_by: event.by,
      created_at: new Date(event.at),
      from_status: from,
      note: createStatusNote(event.to),
      to_status: event.to,
    };
    from = event.to;
    return log;
  });
}

function createLine(
  service: SeedService,
  events: LineEvent[],
  handler: { id: number | null; logs: DraftHandlerLog[] }
): DraftServiceLine {
  return {
    cogs: Number(service.cogs),
    handler_id: handler.id,
    handler_logs: handler.logs,
    is_priority: service.is_priority,
    notes: chance(0.35) ? faker.helpers.arrayElement(SERVICE_NOTE_POOL) : null,
    price: Number(service.price),
    service_id: service.id,
    status: events.at(-1)?.to ?? "queued",
    status_logs: toStatusLogs(events),
  };
}

const createLineFromWork = (service: SeedService, work: PlannedWork) =>
  createLine(service, work.events, {
    id: work.handlerId,
    logs: work.handlerLogs,
  });

const untouchedLine = (service: SeedService) =>
  createLine(service, [], { id: null, logs: [] });

interface AnchoredLine {
  // When work on the line began; the Order has to exist before it.
  anchor: number;
  line: DraftServiceLine;
}

// Each worker's Services: on every day worked, as many reaching quality check as
// their profile says. Each is placed backwards from that moment, so it was
// started on one of their own Shifts a Service-type-appropriate time earlier.
function planWorkedLines(crew: Crew, ctx: PlanContext): AnchoredLine[] {
  const lines: AnchoredLine[] = [];
  for (const [slot, workerId] of crew.workerIds.entries()) {
    const profile = workerProfile(crew.store.code, slot);
    for (const window of ctx.book.get(workerId) ?? []) {
      if (window.day < ctx.today - WORK_LOOKBACK_DAYS) {
        continue;
      }
      // Today is part-way through, so only part of a day's work is done yet.
      const share = Math.min(1, (window.end - window.start) / (8 * HOUR_MS));
      const count = Math.round(profile.dailyLoad() * share);
      for (let n = 0; n < count; n++) {
        const planned = planWorkedLine(crew, ctx, workerId, window);
        if (planned) {
          lines.push(planned);
        }
      }
    }
  }
  return lines;
}

function planWorkedLine(
  crew: Crew,
  ctx: PlanContext,
  workerId: number,
  window: ShiftWindow
): AnchoredLine | null {
  const finishAt = pickOnShift(
    ctx.book,
    workerId,
    window.start + 30 * MINUTE_MS,
    window.end
  );
  if (finishAt === null) {
    return null;
  }
  const first = pickWeighted(KIND_MIX);
  const kinds = [
    first,
    ...KIND_MIX.map((k) => k.item).filter((k) => k !== first),
  ];
  for (const kind of kinds) {
    const [minHours, maxHours] = DURATION_HOURS[kind];
    const startAt = pickOnShift(
      ctx.book,
      workerId,
      finishAt - maxHours * HOUR_MS,
      finishAt - minHours * HOUR_MS
    );
    if (startAt !== null) {
      const service = pickWeighted(ctx.pools[kind]);
      const work = planWork(crew, ctx, workerId, startAt, finishAt);
      return { anchor: startAt, line: createLineFromWork(service, work) };
    }
  }
  return null;
}

// Services a worker has started and still holds, for the live "In hand" count.
function planInHandLines(crew: Crew, ctx: PlanContext): AnchoredLine[] {
  const lines: AnchoredLine[] = [];
  for (const workerId of crew.workerIds) {
    for (let n = randInt(3, 7); n > 0; n--) {
      const kind = pickWeighted(KIND_MIX);
      const startAt = pickOnShift(
        ctx.book,
        workerId,
        ctx.now - IN_HAND_WINDOW_HOURS[kind] * HOUR_MS,
        ctx.now
      );
      if (startAt !== null) {
        const work = planWork(crew, ctx, workerId, startAt, null);
        lines.push({
          anchor: startAt,
          line: createLineFromWork(pickWeighted(ctx.pools[kind]), work),
        });
      }
    }
  }
  return lines;
}

// ───────────────────────── Orders ─────────────────────────

interface PlannedOrder {
  cashierId: number;
  createdAt: number;
  lines: DraftServiceLine[];
  store: StoreRow;
}

// The cashier took the Order a little before work began on it. Work starting
// before the counter opened means it came in the evening before.
function orderCreatedAt(firstWorkAt: number): number {
  const at = firstWorkAt - randInt(20, 240) * MINUTE_MS;
  if (jakartaHour(at) >= 8) {
    return at;
  }
  const evenings = jakartaDayStartAt(jakartaDayNumber(at) - 1);
  return evenings + randInt(16 * 60, 19 * 60 + 30) * MINUTE_MS;
}

// Lines started close together at one Store share an Order, one to three each.
function groupIntoOrders(crew: Crew, lines: AnchoredLine[]): PlannedOrder[] {
  const sorted = [...lines].sort((a, b) => a.anchor - b.anchor);
  const orders: PlannedOrder[] = [];
  let group: AnchoredLine[] = [];
  let groupSize = 0;
  const flush = () => {
    const [first] = group;
    if (first) {
      orders.push({
        cashierId: crew.cashierId,
        createdAt: orderCreatedAt(first.anchor),
        lines: group.map((entry) => entry.line),
        store: crew.store,
      });
    }
    group = [];
  };
  for (const entry of sorted) {
    const [first] = group;
    const sameStretch =
      first !== undefined &&
      jakartaDayNumber(entry.anchor) === jakartaDayNumber(first.anchor) &&
      entry.anchor - first.anchor < 4 * HOUR_MS;
    if (!sameStretch || group.length >= groupSize) {
      flush();
      groupSize = pickWeighted([
        { item: 1, weight: 50 },
        { item: 2, weight: 30 },
        { item: 3, weight: 20 },
      ]);
    }
    group.push(entry);
  }
  flush();
  return orders;
}

// A random counter moment on a day within the lookback, never later than now.
function randomCounterTime(ctx: PlanContext, maxDaysAgo: number): number {
  const day = ctx.today - randInt(0, maxDaysAgo);
  const at = jakartaDayStartAt(day) + randInt(9 * 60, 19 * 60) * MINUTE_MS;
  return Math.min(at, ctx.now - randInt(30, 180) * MINUTE_MS);
}

// Orders taken in the last day or so that nobody has started: the queue.
function planBacklogOrders(crew: Crew, ctx: PlanContext): PlannedOrder[] {
  return Array.from({ length: randInt(3, 5) }, () => ({
    cashierId: crew.cashierId,
    createdAt: randomCounterTime(ctx, 1),
    lines: Array.from(
      {
        length: pickWeighted([
          { item: 1, weight: 50 },
          { item: 2, weight: 30 },
          { item: 3, weight: 20 },
        ]),
      },
      () => untouchedLine(pickAnyService(ctx.pools))
    ),
    store: crew.store,
  }));
}

// Lines the customer called off at the counter before anything was started.
function planCancelledOrders(crew: Crew, ctx: PlanContext): PlannedOrder[] {
  return Array.from({ length: randInt(6, 10) }, () => {
    const createdAt = randomCounterTime(ctx, WORK_LOOKBACK_DAYS);
    const cancelledAt = createdAt + randInt(5, 60) * MINUTE_MS;
    return {
      cashierId: crew.cashierId,
      createdAt,
      lines: Array.from({ length: randInt(1, 2) }, () =>
        createLine(
          pickAnyService(ctx.pools),
          [{ at: cancelledAt, by: crew.cashierId, to: "cancelled" }],
          { id: null, logs: [] }
        )
      ),
      store: crew.store,
    };
  });
}

function planProductOnlyOrders(crew: Crew, ctx: PlanContext): PlannedOrder[] {
  return Array.from({ length: randInt(12, 18) }, () => ({
    cashierId: crew.cashierId,
    createdAt: randomCounterTime(ctx, WORK_LOOKBACK_DAYS),
    lines: [],
    store: crew.store,
  }));
}

interface OrderEnv {
  campaigns: CampaignRow[];
  courierIds: number[];
  customerIds: number[];
  customersByStore: Map<number, number[]>;
  hasIntakeChannel: boolean;
  now: number;
  paymentMethods: Array<{ id: number }>;
  products: Array<{ cogs: string; id: number; price: string }>;
}

interface DraftRefund {
  at: Date;
  items: Array<{
    amount: number;
    line: DraftServiceLine;
    note: string | null;
    reason: "cannot_process" | "damaged" | "lost" | "other";
  }>;
  total: number;
}

interface DraftOrder {
  campaign: { applied: number; campaign: CampaignRow; at: Date } | null;
  cashierId: number;
  code: string;
  courierId: number | null;
  items: DraftItem[];
  pickup: { at: Date; imagePath: string } | null;
  products: DraftProductLine[];
  refund: DraftRefund | null;
  row: typeof ordersTable.$inferInsert;
}

function passedAtOf(line: DraftServiceLine): number {
  const passed = line.status_logs.filter(
    (log) => log.to_status === "ready_for_pickup"
  );
  return passed.at(-1)?.created_at.getTime() ?? 0;
}

function groupIntoItems(
  lines: DraftServiceLine[],
  code: string,
  createdAt: number,
  cashierId: number
): DraftItem[] {
  const items: DraftItem[] = [];
  for (const line of lines) {
    const last = items.at(-1);
    // A cashier upsells the object already on the counter. A cancelled line is
    // never one of the treatments on an object that stayed.
    if (
      last &&
      line.status !== "cancelled" &&
      last.treatments.every((existing) => existing.status !== "cancelled") &&
      chance(UPSELL_ON_SAME_ITEM_CHANCE)
    ) {
      last.treatments.push(line);
      continue;
    }
    items.push({
      brand: faker.helpers.arrayElement(BRANDS),
      color: faker.color.human(),
      item_code: `${code}-I${String(items.length + 1).padStart(3, "0")}`,
      model: faker.helpers.arrayElement([
        "Classic",
        "Sport",
        "Premium",
        "Traveler",
        "Urban",
      ]),
      // The cashier's one drop-off shot of the object, which unlocks every
      // treatment on it (ADR-0019).
      photos: [
        {
          created_at: new Date(createdAt + randInt(1, 12) * MINUTE_MS),
          note: chance(0.3)
            ? faker.helpers.arrayElement([
                "Outsole cracked, inform customer",
                "Heel shows mild yellowing",
                "Tongue discolored — cleaning requested",
                null,
              ])
            : null,
          uploaded_by: cashierId,
        },
      ],
      size: faker.helpers.arrayElement(SIZES),
      treatments: [line],
    });
  }
  return items;
}

function pickupChance(ageMs: number): number {
  if (ageMs > 3 * DAY_MS) {
    return 0.92;
  }
  if (ageMs > DAY_MS) {
    return 0.55;
  }
  return ageMs > 6 * HOUR_MS ? 0.2 : 0;
}

// The customer collects during counter hours, never after now.
function toCounterHours(at: number, now: number): number {
  const hour = jakartaHour(at);
  const inHours =
    hour >= 9 && hour < 20
      ? at
      : jakartaDayStartAt(jakartaDayNumber(at) + (hour >= 20 ? 1 : 0)) +
        randInt(9 * 60, 11 * 60) * MINUTE_MS;
  return Math.min(inHours, now - randInt(1, 5) * MINUTE_MS);
}

// After the checks, the cashier hands finished objects over (whole object at
// once, ADR-0017) or, rarely, refunds a lone treatment. Both are logged against
// the cashier, never the worker.
function settleItems(items: DraftItem[], cashierId: number, now: number) {
  const pickedUp: DraftServiceLine[] = [];
  const refunded: Array<{ at: number; line: DraftServiceLine }> = [];
  let latestPass = 0;

  for (const item of items) {
    if (item.treatments.some((line) => line.status !== "ready_for_pickup")) {
      continue;
    }
    const passedAt = Math.max(...item.treatments.map(passedAtOf));
    const age = now - passedAt;
    const [only] = item.treatments;
    if (item.treatments.length === 1 && age > 2 * DAY_MS && chance(0.03)) {
      refunded.push({
        at: passedAt + randInt(60, 2 * 24 * 60) * MINUTE_MS,
        line: only,
      });
    } else if (chance(pickupChance(age))) {
      pickedUp.push(...item.treatments);
      latestPass = Math.max(latestPass, passedAt);
    }
  }

  for (const { at, line } of refunded) {
    line.status = "refunded";
    line.status_logs.push({
      changed_by: cashierId,
      created_at: new Date(at),
      from_status: "ready_for_pickup",
      note: createStatusNote("refunded"),
      to_status: "refunded",
    });
  }

  if (pickedUp.length === 0) {
    return { pickedUp, pickupAt: null, refunded: refunded.map((r) => r.line) };
  }
  const pickupAt = toCounterHours(
    latestPass + randInt(45, 30 * 60) * MINUTE_MS,
    now
  );
  for (const line of pickedUp) {
    line.status = "picked_up";
    line.status_logs.push({
      changed_by: cashierId,
      created_at: new Date(pickupAt),
      from_status: "ready_for_pickup",
      note: createStatusNote("picked_up"),
      to_status: "picked_up",
    });
  }
  return { pickedUp, pickupAt, refunded: refunded.map((r) => r.line) };
}

function latestMoment(...moments: number[]): number {
  return moments.reduce((max, at) => (at > max ? at : max), 0);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one Order's whole money and status picture is built in one pass.
function buildDraftOrder(
  planned: PlannedOrder,
  code: string,
  env: OrderEnv
): DraftOrder {
  const { cashierId, store } = planned;
  const createdAt = new Date(planned.createdAt);
  const items = groupIntoItems(
    planned.lines,
    code,
    planned.createdAt,
    cashierId
  );
  const settled = settleItems(items, cashierId, env.now);
  const draftServices = items.flatMap((item) => item.treatments);

  const productCount =
    draftServices.length === 0 ? randInt(1, 3) : randInt(0, 2);
  const products: DraftProductLine[] = Array.from(
    { length: productCount },
    () => {
      const product = faker.helpers.arrayElement(env.products);
      return {
        cogs: Number(product.cogs),
        price: Number(product.price),
        product_id: product.id,
        qty: randInt(1, 3),
      };
    }
  );

  // A cancelled line took the unpaid off-ramp (ADR-0008): the app refuses to
  // cancel on a paid Order, so its price never sits inside `total`.
  const serviceGross = draftServices.reduce(
    (sum, line) => (line.status === "cancelled" ? sum : sum + line.price),
    0
  );
  const productGross = products.reduce(
    (sum, line) => sum + line.price * line.qty,
    0
  );
  const grossTotal = serviceGross + productGross;
  const discountRes = chooseDiscount(
    grossTotal,
    createdAt,
    store.id,
    env.campaigns
  );
  const discount = Math.min(discountRes.discount, grossTotal);
  const netTotal = Math.max(0, grossTotal - discount);

  const orderStatus = resolveOrderStatus(
    draftServices.map((line) => line.status),
    products.length
  );
  let paid = chance(0.35);
  if (orderStatus === "completed") {
    paid = chance(0.9);
  } else if (orderStatus === "processing") {
    paid = chance(0.6);
  } else if (orderStatus === "ready_for_pickup") {
    paid = chance(0.7);
  }
  // Payment precedes pickup (ADR-0009), and a refund returns money paid.
  if (settled.pickedUp.length > 0 || settled.refunded.length > 0) {
    paid = true;
  }
  const paidAmount = paid ? netTotal : 0;
  const paidAt = paid
    ? Math.min(
        planned.createdAt + randInt(5, 220) * MINUTE_MS,
        env.now - MINUTE_MS,
        (settled.pickupAt ?? Number.POSITIVE_INFINITY) - MINUTE_MS
      )
    : null;

  let refund: DraftRefund | null = null;
  if (settled.refunded.length > 0) {
    const refundItems = settled.refunded
      .map((line) => ({
        amount: Math.max(
          0,
          line.price -
            (grossTotal > 0
              ? Math.floor((line.price / grossTotal) * discount)
              : 0)
        ),
        line,
        note: chance(0.15) ? faker.lorem.sentence() : null,
        reason: faker.helpers.arrayElement([
          "damaged",
          "cannot_process",
          "lost",
          "other",
        ] as const),
      }))
      .filter((item) => item.amount > 0);
    const total = Math.min(
      refundItems.reduce((sum, item) => sum + item.amount, 0),
      paidAmount
    );
    if (refundItems.length > 0 && total > 0) {
      const refundedAt = latestMoment(
        ...settled.refunded.map(
          (line) => line.status_logs.at(-1)?.created_at.getTime() ?? 0
        )
      );
      refund = {
        at: new Date(refundedAt + randInt(5, 45) * MINUTE_MS),
        items: refundItems,
        total,
      };
    }
  }

  const logTimes = draftServices.flatMap((line) =>
    line.status_logs.map((log) => log.created_at.getTime())
  );
  const completedAt =
    orderStatus === "completed"
      ? latestMoment(planned.createdAt, ...logTimes)
      : null;
  const readyAt =
    orderStatus === "ready_for_pickup"
      ? latestMoment(
          ...draftServices
            .filter((line) => line.status === "ready_for_pickup")
            .map(passedAtOf)
        )
      : null;
  const updatedAt = latestMoment(
    planned.createdAt,
    paidAt ?? 0,
    completedAt ?? 0,
    refund?.at.getTime() ?? 0,
    ...logTimes,
    ...draftServices.flatMap((line) =>
      line.handler_logs.map((log) => log.created_at.getTime())
    ),
    ...items.flatMap((item) =>
      item.photos.map((photo) => photo.created_at.getTime())
    )
  );

  // Drop-off photo is required for every Order (ADR-0014); the ~10% miss
  // exercises the "Missing" recovery path on the Order page.
  const hasDropoffPhoto = chance(0.9);
  const customerPool = env.customersByStore.get(store.id) ?? env.customerIds;
  const collectedBy =
    env.courierIds.length > 0 && chance(0.3)
      ? faker.helpers.arrayElement(env.courierIds)
      : null;

  const campaign =
    discountRes.campaign_id !== null && discount > 0
      ? env.campaigns.find((item) => item.id === discountRes.campaign_id)
      : undefined;

  return {
    campaign: campaign ? { applied: discount, at: createdAt, campaign } : null,
    cashierId,
    code,
    // The dev database may already carry the intake_channel check, which ties
    // a courier to the channel; then the courier is written after the insert.
    courierId: env.hasIntakeChannel ? collectedBy : null,
    items,
    pickup: settled.pickupAt
      ? {
          at: new Date(settled.pickupAt),
          imagePath: `seed/orders/${sanitizeForS3(code)}/pickup/event-1.jpg`,
        }
      : null,
    products,
    refund,
    row: {
      cancelled_at: null,
      code,
      collected_by: env.hasIntakeChannel ? null : collectedBy,
      completed_at: completedAt === null ? null : new Date(completedAt),
      created_at: createdAt,
      created_by: cashierId,
      customer_id: faker.helpers.arrayElement(customerPool),
      discount: asMoney(discount),
      discount_source: discountRes.discount_source,
      dropoff_photo_path: hasDropoffPhoto
        ? `seed/orders/${sanitizeForS3(code)}/dropoff/handover.jpg`
        : null,
      dropoff_photo_uploaded_at: hasDropoffPhoto
        ? new Date(planned.createdAt + randInt(1, 10) * MINUTE_MS)
        : null,
      dropoff_photo_uploaded_by: hasDropoffPhoto ? cashierId : null,
      notes: chance(0.2) ? faker.lorem.sentence() : null,
      paid_amount: asMoney(paidAmount),
      paid_at: paidAt === null ? null : new Date(paidAt),
      payment_method_id:
        paidAmount > 0
          ? faker.helpers.arrayElement(env.paymentMethods).id
          : null,
      payment_status: paidAmount > 0 ? "paid" : "unpaid",
      ready_at: readyAt === null ? null : new Date(readyAt),
      refunded_amount: asMoney(refund?.total ?? 0),
      status: orderStatus,
      store_id: store.id,
      total: asMoney(grossTotal),
      updated_at: new Date(updatedAt),
      updated_by: cashierId,
    },
  };
}

function requireId(ids: Map<string, number>, key: string): number {
  const id = ids.get(key);
  if (id === undefined) {
    throw new Error(`Seed lost the id of ${key}`);
  }
  return id;
}

async function ordersHaveIntakeChannel(): Promise<boolean> {
  const result = await db.execute(
    sql`select 1 from information_schema.columns where table_name = 'orders' and column_name = 'intake_channel'`
  );
  return result.rows.length > 0;
}

const COMPLAINT_REASONS = [
  "Stain still visible after cleaning",
  "Sole came unglued within a week",
  "Colour faded on the upper",
  "Smell not gone",
  "Stitching loosened again",
] as const;

// Every draft goes in by the table, in batches, instead of Order by Order: the
// seed is now thousands of Orders and a round trip each took minutes.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one ordered pass over every table an Order touches.
async function insertDrafts(drafts: DraftOrder[], now: number) {
  const orderIds = new Map<string, number>();
  for (const chunk of chunked(drafts, 400)) {
    const rows = await db
      .insert(ordersTable)
      .values(chunk.map((draft) => draft.row))
      .returning({ code: ordersTable.code, id: ordersTable.id });
    for (const row of rows) {
      orderIds.set(row.code, row.id);
    }
  }
  const idOf = (draft: DraftOrder) => requireId(orderIds, draft.code);

  const campaignRows = drafts.flatMap((draft) =>
    draft.campaign
      ? [
          {
            applied_amount: asMoney(draft.campaign.applied),
            campaign_id: draft.campaign.campaign.id,
            created_at: draft.campaign.at,
            discount_type: draft.campaign.campaign.discount_type,
            discount_value: asMoney(draft.campaign.campaign.discount_value),
            max_discount:
              draft.campaign.campaign.max_discount === null
                ? null
                : asMoney(draft.campaign.campaign.max_discount),
            order_id: idOf(draft),
          },
        ]
      : []
  );
  for (const chunk of chunked(campaignRows, 1000)) {
    await db.insert(orderCampaignsTable).values(chunk);
  }

  const itemIds = new Map<string, number>();
  const itemRows = drafts.flatMap((draft) =>
    draft.items.map((item) => ({
      brand: item.brand,
      color: item.color,
      item_code: item.item_code,
      model: item.model,
      order_id: idOf(draft),
      size: item.size,
    }))
  );
  for (const chunk of chunked(itemRows, 1000)) {
    const rows = await db
      .insert(itemsTable)
      .values(chunk)
      .returning({ id: itemsTable.id, item_code: itemsTable.item_code });
    for (const row of rows) {
      itemIds.set(row.item_code, row.id);
    }
  }

  // One pickup event per Order; the lines it released point at it, so it goes
  // in before them and no line has to be flipped to picked_up afterwards.
  const pickupEventIds = new Map<number, number>();
  const pickupRows = drafts.flatMap((draft) =>
    draft.pickup
      ? [
          {
            created_at: draft.pickup.at,
            image_path: draft.pickup.imagePath,
            order_id: idOf(draft),
            picked_up_at: draft.pickup.at,
            picked_up_by: draft.cashierId,
          },
        ]
      : []
  );
  for (const chunk of chunked(pickupRows, 1000)) {
    const rows = await db
      .insert(orderPickupEventsTable)
      .values(chunk)
      .returning({
        id: orderPickupEventsTable.id,
        order_id: orderPickupEventsTable.order_id,
      });
    for (const row of rows) {
      pickupEventIds.set(row.order_id, row.id);
    }
  }

  const lines: DraftServiceLine[] = [];
  const lineRows: OrderServiceInsert[] = [];
  for (const draft of drafts) {
    const orderId = idOf(draft);
    for (const item of draft.items) {
      for (const line of item.treatments) {
        lines.push(line);
        lineRows.push({
          cogs_snapshot: asMoney(line.cogs),
          discount: "0",
          handler_id: line.handler_id,
          is_priority: line.is_priority,
          item_id: requireId(itemIds, item.item_code),
          notes: line.notes,
          order_id: orderId,
          pickup_event_id:
            line.status === "picked_up"
              ? (pickupEventIds.get(orderId) ?? null)
              : null,
          price: asMoney(line.price),
          service_id: line.service_id,
          status: line.status,
        });
      }
    }
  }
  // Postgres hands ids back in the order the rows were given, so a line and
  // its id sit at the same position across the chunks.
  const lineIds = new Map<DraftServiceLine, number>();
  let position = 0;
  for (const chunk of chunked(lineRows, 1000)) {
    const rows = await db
      .insert(ordersServicesTable)
      .values(chunk)
      .returning({ id: ordersServicesTable.id });
    for (const row of rows) {
      lineIds.set(lines[position], row.id);
      position++;
    }
  }
  const lineIdOf = (line: DraftServiceLine) => {
    const id = lineIds.get(line);
    if (id === undefined) {
      throw new Error("Seed lost the id of a line");
    }
    return id;
  };

  const statusLogRows = lines.flatMap((line) =>
    line.status_logs.map((log) => ({
      changed_by: log.changed_by,
      created_at: log.created_at,
      from_status: log.from_status,
      note: log.note,
      order_service_id: lineIdOf(line),
      to_status: log.to_status,
    }))
  );
  for (const chunk of chunked(statusLogRows, 2000)) {
    await db.insert(orderServiceStatusLogsTable).values(chunk);
  }

  const handlerLogRows = lines.flatMap((line) =>
    line.handler_logs.map((log) => ({
      changed_by: log.changed_by,
      created_at: log.created_at,
      from_handler_id: log.from_handler_id,
      note: log.note,
      order_service_id: lineIdOf(line),
      to_handler_id: log.to_handler_id,
    }))
  );
  for (const chunk of chunked(handlerLogRows, 2000)) {
    await db.insert(orderServiceHandlerLogsTable).values(chunk);
  }

  const photoRows = drafts.flatMap((draft) =>
    draft.items.flatMap((item) => {
      const itemId = requireId(itemIds, item.item_code);
      return item.photos.map((photo, photoIndex) => ({
        created_at: photo.created_at,
        // Mirrors the live key layout, keyed by the object's row id (ADR-0019).
        image_path: `seed/orders/${sanitizeForS3(draft.code)}/items/${itemId}/item-${photoIndex + 1}.jpg`,
        item_id: itemId,
        note: photo.note,
        updated_at: photo.created_at,
        uploaded_by: photo.uploaded_by,
      }));
    })
  );
  for (const chunk of chunked(photoRows, 1500)) {
    await db.insert(itemImagesTable).values(chunk);
  }

  const productRows = drafts.flatMap((draft) =>
    draft.products.map((line) => ({
      cogs_snapshot: asMoney(line.cogs * line.qty),
      discount: "0",
      order_id: idOf(draft),
      price: asMoney(line.price),
      product_id: line.product_id,
      qty: line.qty,
    }))
  );
  for (const chunk of chunked(productRows, 1500)) {
    await db.insert(ordersProductsTable).values(chunk);
  }

  for (const draft of drafts) {
    if (!draft.refund) {
      continue;
    }
    const { refund } = draft;
    const [created] = await db
      .insert(orderRefundsTable)
      .values({
        created_at: refund.at,
        order_id: idOf(draft),
        refunded_by: draft.cashierId,
        total_amount: asMoney(refund.total),
      })
      .returning({ id: orderRefundsTable.id });
    await db.insert(orderRefundItemsTable).values(
      refund.items.map((item) => ({
        amount: asMoney(item.amount),
        note:
          item.reason === "other"
            ? (item.note ?? faker.lorem.sentence())
            : item.note,
        order_refund_id: created.id,
        order_service_id: lineIdOf(item.line),
        reason: item.reason,
      }))
    );
  }

  // A handful of Customers came back about a pair they collected at least two
  // days ago.
  const complaintCandidates = drafts.flatMap((draft) => {
    const { pickup } = draft;
    if (!pickup || now - pickup.at.getTime() < 2 * DAY_MS) {
      return [];
    }
    return draft.items
      .flatMap((item) => item.treatments)
      .filter((line) => line.status === "picked_up")
      .map((line) => ({ cashierId: draft.cashierId, line, pickup }));
  });
  const complaintRows = faker.helpers
    .arrayElements(
      complaintCandidates,
      Math.min(14, complaintCandidates.length)
    )
    .map(({ cashierId, line, pickup }) => ({
      created_at: new Date(
        Math.min(pickup.at.getTime() + randInt(1, 4) * DAY_MS, now - HOUR_MS)
      ),
      opened_by: cashierId,
      order_service_id: lineIdOf(line),
      reason: faker.helpers.arrayElement(COMPLAINT_REASONS),
    }));
  if (complaintRows.length > 0) {
    await db.insert(complaintsTable).values(complaintRows);
  }

  const courierRows = drafts.flatMap((draft) =>
    draft.courierId === null
      ? []
      : [{ courierId: draft.courierId, orderId: idOf(draft) }]
  );
  for (const chunk of chunked(courierRows, 500)) {
    await db.execute(sql`
      update orders set intake_channel = 'courier', collected_by = v.courier_id
      from (values ${sql.join(
        chunk.map((row) => sql`(${row.orderId}::int, ${row.courierId}::int)`),
        sql`, `
      )}) as v(order_id, courier_id)
      where orders.id = v.order_id
    `);
  }
}

async function seedOrders(params: {
  stores: StoreRow[];
  customers: Array<{ id: number; origin_store_id: number }>;
  services: Array<{
    id: number;
    code: string;
    price: string | null;
    cogs: string;
    is_active: boolean;
    is_priority: boolean;
  }>;
  products: Array<{
    id: number;
    price: string;
    cogs: string;
    is_active: boolean;
  }>;
  paymentMethods: Array<{ id: number; is_active: boolean }>;
  campaigns: CampaignRow[];
  cashiersByStore: Map<number, number[]>;
  workersByStore: Map<number, number[]>;
  courierIds: number[];
  adminId: number;
  book: ShiftBook;
}) {
  const now = Date.now();
  // Seeded orders price their lines off the catalog row, so a no-list-price
  // Service (Repair, ADR-0018) cannot take part — it has no number to copy.
  const pools = buildServicePools(
    params.services.flatMap((service) =>
      service.is_active && service.price !== null
        ? [{ ...service, price: service.price }]
        : []
    )
  );
  const ctx: PlanContext = {
    book: params.book,
    now,
    pools,
    today: jakartaDayNumber(now),
  };

  const customersByStore = new Map<number, number[]>();
  for (const customer of params.customers) {
    const items = customersByStore.get(customer.origin_store_id);
    if (items) {
      items.push(customer.id);
    } else {
      customersByStore.set(customer.origin_store_id, [customer.id]);
    }
  }

  const planned: PlannedOrder[] = [];
  for (const store of params.stores) {
    const crew: Crew = {
      adminId: params.adminId,
      cashierId: params.cashiersByStore.get(store.id)?.[0] ?? params.adminId,
      store,
      workerIds: params.workersByStore.get(store.id) ?? [],
    };
    planned.push(
      ...groupIntoOrders(crew, [
        ...planWorkedLines(crew, ctx),
        ...planInHandLines(crew, ctx),
      ]),
      ...planBacklogOrders(crew, ctx),
      ...planCancelledOrders(crew, ctx),
      ...planProductOnlyOrders(crew, ctx)
    );
  }

  const env: OrderEnv = {
    campaigns: params.campaigns,
    courierIds: params.courierIds,
    customerIds: params.customers.map((customer) => customer.id),
    customersByStore,
    hasIntakeChannel: await ordersHaveIntakeChannel(),
    now,
    paymentMethods: params.paymentMethods.filter((method) => method.is_active),
    products: params.products.filter((product) => product.is_active),
  };

  // Codes count up through each Store's day in the order the Orders were taken.
  const orderCounters = new Map<string, number>();
  const drafts = [...planned]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((order) =>
      buildDraftOrder(
        order,
        createOrderCode(
          order.store.code,
          new Date(order.createdAt),
          orderCounters
        ),
        env
      )
    );

  await insertDrafts(drafts, now);

  const counterRows = Array.from(orderCounters.entries()).map(
    ([key, lastNumber]) => {
      const [storeCode, dateStr] = key.split(":");
      return {
        store_code: storeCode,
        date_str: dateStr,
        last_number: lastNumber,
      };
    }
  );

  if (counterRows.length > 0) {
    await db.insert(orderCountersTable).values(counterRows);
  }
}

export async function runSeed() {
  // The seed truncates every table first, so pointed at prod by mistake it wipes
  // the shop's real Orders. Only a confirmed dev database is allowed through.
  const isDev =
    process.env.STORAGE_PREFIX === "dev/" &&
    (!process.env.DATABASE_URL_DEV ||
      process.env.DATABASE_URL === process.env.DATABASE_URL_DEV);
  if (!isDev) {
    throw new Error(
      "Refusing to seed: DATABASE_URL is not confirmed to be the dev database"
    );
  }

  faker.seed(SEED_NUMBER);
  await resetDatabase();

  const stores = await seedStores();
  const { userByUsername } = await seedUsers(stores);

  const admin = userByUsername.get("admin");
  if (!admin) {
    throw new Error("Admin user not generated");
  }

  const cashiersByStore = new Map<number, number[]>();
  const workersByStore = new Map<number, number[]>();

  for (const store of stores) {
    const lowerCode = store.code.toLowerCase();
    const cashier = userByUsername.get(`cashier.${lowerCode}`);
    const worker1 = userByUsername.get(`worker.${lowerCode}.1`);
    const worker2 = userByUsername.get(`worker.${lowerCode}.2`);

    cashiersByStore.set(store.id, cashier ? [cashier.id] : []);
    workersByStore.set(
      store.id,
      [worker1?.id, worker2?.id].filter((id): id is number => id !== undefined)
    );
  }

  const courierIds = ["courier.1", "courier.2"]
    .map((username) => userByUsername.get(username)?.id)
    .filter((id): id is number => id !== undefined);

  const catalog = await seedCatalog(admin.id);

  const storeByCode = new Map(stores.map((store) => [store.code, store]));
  const campaignByCode = new Map(
    catalog.campaigns.map((campaign) => [campaign.code, campaign])
  );

  const scopedRows: Array<{ campaign_id: number; store_id: number }> = [];
  for (const seed of catalog.campaignSeed) {
    const campaign = campaignByCode.get(seed.code);
    if (!campaign) {
      continue;
    }

    for (const code of seed.scope_codes) {
      const store = storeByCode.get(code);
      if (!store) {
        continue;
      }
      scopedRows.push({ campaign_id: campaign.id, store_id: store.id });
    }
  }

  if (scopedRows.length > 0) {
    await db.insert(campaignStoresTable).values(scopedRows);
  }

  const campaignScopeMap = new Map<number, Set<number>>();
  for (const row of scopedRows) {
    const scope = campaignScopeMap.get(row.campaign_id);
    if (scope) {
      scope.add(row.store_id);
    } else {
      campaignScopeMap.set(row.campaign_id, new Set([row.store_id]));
    }
  }

  const campaignRows: CampaignRow[] = catalog.campaigns.map((campaign) => ({
    id: campaign.id,
    code: campaign.code,
    discount_type: campaign.discount_type,
    discount_value: Number(campaign.discount_value),
    min_order_total: Number(campaign.min_order_total),
    max_discount: campaign.max_discount ? Number(campaign.max_discount) : null,
    redemption_mode: campaign.redemption_mode,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    store_ids: campaignScopeMap.get(campaign.id) ?? new Set<number>(),
  }));

  const customers = await seedCustomers(stores, cashiersByStore);

  const book = await seedShifts(stores, workersByStore);

  await seedOrders({
    adminId: admin.id,
    book,
    stores,
    customers,
    services: catalog.services,
    products: catalog.products,
    paymentMethods: catalog.paymentMethods,
    campaigns: campaignRows,
    cashiersByStore,
    workersByStore,
    courierIds,
  });

  await db
    .update(usersTable)
    .set({
      password: await Bun.password.hash(ADMIN_PASSWORD),
    })
    .where(sql`${usersTable.username} = 'admin'`);
}
