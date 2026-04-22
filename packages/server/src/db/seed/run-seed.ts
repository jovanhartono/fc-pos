import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignStoresTable,
  campaignsTable,
  categoriesTable,
  customersTable,
  orderCampaignsTable,
  orderCountersTable,
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceHandlerLogsTable,
  orderServiceStatusLogsTable,
  orderServicesImagesTable,
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
const ORDER_COUNT = 180;
const ORDER_LOOKBACK_DAYS = 45;

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
  { key: "core", name: "Core Cleaning" },
  { key: "restoration", name: "Restoration" },
  { key: "protection", name: "Protection & Finishing" },
  { key: "retail", name: "Retail Product" },
] as const;

const SERVICE_PRESETS = [
  { code: "DCB", name: "Deep Clean Basic", categoryKey: "core" },
  { code: "DCP", name: "Deep Clean Premium", categoryKey: "core" },
  { code: "EXP", name: "Express Cleaning", categoryKey: "core" },
  { code: "RPT", name: "Repaint Touch-up", categoryKey: "restoration" },
  { code: "RPF", name: "Repaint Full", categoryKey: "restoration" },
  { code: "GLU", name: "Reglue Service", categoryKey: "restoration" },
  { code: "WPR", name: "Water Repellent Coating", categoryKey: "protection" },
  { code: "UVT", name: "Unyellowing Treatment", categoryKey: "protection" },
  { code: "DST", name: "Deodorizing Sterilization", categoryKey: "protection" },
  { code: "LCE", name: "Lace Replacement", categoryKey: "restoration" },
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
  | "ready_for_pickup"
  | "picked_up"
  | "refunded"
  | "cancelled";

type ServiceScenario =
  | "created"
  | "processing"
  | "ready_for_pickup"
  | "completed"
  | "refunded"
  | "product_only";

type DiscountSource = "none" | "manual" | "campaign";

interface StoreRow {
  id: number;
  code: string;
  name: string;
}

interface CampaignRow {
  id: number;
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  min_order_total: number;
  max_discount: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  store_ids: Set<number>;
}

interface DraftStatusLog {
  from_status: OrderServiceStatus | null;
  to_status: OrderServiceStatus;
  changed_by: number;
  created_at: Date;
  note: string | null;
}

interface DraftHandlerLog {
  from_handler_id: number | null;
  to_handler_id: number | null;
  changed_by: number;
  created_at: Date;
  note: string | null;
}

interface DraftServiceLine {
  item_code: string;
  service_id: number;
  price: number;
  cogs: number;
  status: OrderServiceStatus;
  handler_id: number | null;
  brand: string;
  color: string;
  model: string;
  size: string;
  notes: string | null;
  status_logs: DraftStatusLog[];
  handler_logs: DraftHandlerLog[];
  photos: Array<{
    created_at: Date;
    note: string | null;
    uploaded_by: number | null;
  }>;
}

interface DraftProductLine {
  product_id: number;
  price: number;
  cogs: number;
  qty: number;
  notes: string | null;
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

const STATUS_PATHS: Partial<Record<OrderServiceStatus, OrderServiceStatus[]>> =
  {
    queued: [],
    processing: ["processing"],
    quality_check: ["processing", "quality_check"],
    ready_for_pickup: ["processing", "quality_check", "ready_for_pickup"],
    picked_up: ["processing", "quality_check", "ready_for_pickup", "picked_up"],
    refunded: ["processing", "quality_check", "ready_for_pickup", "refunded"],
  };

function buildStatusPath(
  finalStatus: OrderServiceStatus
): OrderServiceStatus[] {
  const fixed = STATUS_PATHS[finalStatus];
  const base: OrderServiceStatus[] = fixed
    ? [...fixed]
    : [
        ...faker.helpers.arrayElement<OrderServiceStatus[]>([
          ["cancelled"],
          ["processing", "cancelled"],
          ["processing", "quality_check", "cancelled"],
        ]),
      ];

  const qcIdx = base.indexOf("quality_check");
  if (qcIdx !== -1 && chance(0.15)) {
    const loopCount = chance(0.25) ? 2 : 1;
    const loop: OrderServiceStatus[] = [];
    for (let i = 0; i < loopCount; i++) {
      loop.push("processing", "quality_check");
    }
    base.splice(qcIdx + 1, 0, ...loop);
  }
  return base;
}

function pickScenario(): ServiceScenario {
  return pickWeighted<ServiceScenario>([
    { item: "created", weight: 12 },
    { item: "processing", weight: 25 },
    { item: "ready_for_pickup", weight: 15 },
    { item: "completed", weight: 35 },
    { item: "refunded", weight: 8 },
    { item: "product_only", weight: 5 },
  ]);
}

function pickFinalServiceStatuses(
  scenario: ServiceScenario,
  count: number
): OrderServiceStatus[] {
  if (count === 0) {
    return [];
  }

  if (scenario === "created") {
    return Array.from({ length: count }, () => "queued");
  }

  if (scenario === "processing") {
    return Array.from({ length: count }, () =>
      faker.helpers.arrayElement([
        "queued",
        "processing",
        "quality_check",
        "ready_for_pickup",
      ] as const)
    );
  }

  if (scenario === "ready_for_pickup") {
    return Array.from({ length: count }, () =>
      chance(0.15) ? "picked_up" : "ready_for_pickup"
    );
  }

  if (scenario === "completed") {
    return Array.from({ length: count }, () =>
      chance(0.12) ? "cancelled" : "picked_up"
    );
  }

  if (scenario === "refunded") {
    const statuses: OrderServiceStatus[] = Array.from({ length: count }, () =>
      chance(0.18) ? "cancelled" : "picked_up"
    );
    statuses[0] = "refunded";
    return faker.helpers.shuffle(statuses);
  }

  return [];
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
  const dateStr = dayjs(createdAt).format("DDMMYYYY");
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
      "order_services_images",
      "order_pickup_events",
      "orders_products",
      "orders_services",
      "order_campaigns",
      "orders",
      "order_counters",
      "shifts",
      "campaign_stores",
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
    role: "admin" | "cashier" | "worker";
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
        cogs: asMoney(randInt(14_000, 65_000)),
        price: asMoney(randInt(40_000, 180_000)),
        is_active: true,
      }))
    )
    .returning({
      id: servicesTable.id,
      code: servicesTable.code,
      price: servicesTable.price,
      cogs: servicesTable.cogs,
      is_active: servicesTable.is_active,
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
      scope_codes: ["BKS"],
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
    });

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

async function seedShifts(
  stores: StoreRow[],
  workersByStore: Map<number, number[]>
) {
  const shiftRows: Array<{
    user_id: number;
    store_id: number;
    clock_in_at: Date;
    clock_out_at: Date | null;
  }> = [];

  for (const store of stores) {
    const workers = workersByStore.get(store.id) ?? [];
    for (const workerId of workers) {
      for (let offset = 1; offset <= 30; offset++) {
        const day = dayjs().subtract(offset, "day");
        if (day.day() === 0) {
          continue;
        }
        if (chance(0.1)) {
          continue;
        }
        const clockInHour = randInt(7, 9);
        const clockInMinute = randInt(0, 59);
        const shiftHours = randInt(7, 9);
        const clockIn = day
          .hour(clockInHour)
          .minute(clockInMinute)
          .second(0)
          .millisecond(0)
          .subtract(7, "hour")
          .toDate();
        const clockOut = dayjs(clockIn).add(shiftHours, "hour").toDate();
        shiftRows.push({
          user_id: workerId,
          store_id: store.id,
          clock_in_at: clockIn,
          clock_out_at: clockOut,
        });
      }
    }
  }

  if (shiftRows.length > 0) {
    await db.insert(shiftsTable).values(shiftRows);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: realistic seeded order flow needs multiple transactional branches.
async function seedOrders(params: {
  stores: StoreRow[];
  customers: Array<{ id: number; origin_store_id: number }>;
  services: Array<{
    id: number;
    price: string;
    cogs: string;
    is_active: boolean;
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
}) {
  const activeServices = params.services.filter((service) => service.is_active);
  const activeProducts = params.products.filter((product) => product.is_active);
  const activePaymentMethods = params.paymentMethods.filter(
    (method) => method.is_active
  );

  const customersByStore = new Map<number, number[]>();
  for (const customer of params.customers) {
    const items = customersByStore.get(customer.origin_store_id);
    if (items) {
      items.push(customer.id);
    } else {
      customersByStore.set(customer.origin_store_id, [customer.id]);
    }
  }

  const storeWeights = params.stores.map((store) => {
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

  const orderCounters = new Map<string, number>();

  for (let index = 0; index < ORDER_COUNT; index++) {
    const storeId = pickWeighted(storeWeights);
    const store = params.stores.find((item) => item.id === storeId);
    if (!store) {
      continue;
    }

    const cashiers = params.cashiersByStore.get(store.id) ?? [];
    const workers = params.workersByStore.get(store.id) ?? [];
    const createdBy = faker.helpers.arrayElement(cashiers);

    const createdAt = dayjs()
      .subtract(randInt(0, ORDER_LOOKBACK_DAYS), "day")
      .startOf("day")
      .add(randInt(9 * 60, 20 * 60), "minute")
      .toDate();

    const orderCode = createOrderCode(store.code, createdAt, orderCounters);

    const scenario = pickScenario();
    const serviceCount = scenario === "product_only" ? 0 : randInt(1, 3);
    let productCount = randInt(0, 2);
    if (scenario === "product_only") {
      productCount = randInt(1, 3);
    }
    if (serviceCount === 0 && productCount === 0) {
      productCount = 1;
    }

    const serviceStatuses = pickFinalServiceStatuses(scenario, serviceCount);
    const orderStatus = resolveOrderStatus(serviceStatuses, productCount);

    const localCustomers =
      customersByStore.get(store.id) ??
      params.customers.map((customer) => customer.id);
    const customerId = faker.helpers.arrayElement(localCustomers);

    const draftServices: DraftServiceLine[] = [];

    for (let serviceIndex = 0; serviceIndex < serviceCount; serviceIndex++) {
      const service = faker.helpers.arrayElement(activeServices);
      const finalStatus = serviceStatuses[serviceIndex] ?? "queued";
      const path = buildStatusPath(finalStatus);
      const itemCode = `${orderCode}-S${String(serviceIndex + 1).padStart(3, "0")}`;
      const handlerId =
        workers.length > 0 && path.length > 0
          ? faker.helpers.arrayElement(workers)
          : null;

      const statusLogs: DraftStatusLog[] = [];
      const handlerLogs: DraftHandlerLog[] = [];
      const photos: DraftServiceLine["photos"] = [];

      let currentStatus: OrderServiceStatus = "queued";
      let eventAt = dayjs(createdAt).add(randInt(10, 45), "minute").toDate();

      if (handlerId !== null) {
        handlerLogs.push({
          from_handler_id: null,
          to_handler_id: handlerId,
          changed_by: handlerId,
          created_at: dayjs(createdAt).add(randInt(3, 25), "minute").toDate(),
          note: "Claimed by worker",
        });
      }

      for (const nextStatus of path) {
        eventAt = dayjs(eventAt).add(randInt(25, 120), "minute").toDate();
        statusLogs.push({
          from_status: currentStatus,
          to_status: nextStatus,
          changed_by: handlerId ?? createdBy,
          created_at: eventAt,
          note: createStatusNote(nextStatus),
        });
        currentStatus = nextStatus;
      }

      photos.push({
        created_at: dayjs(createdAt).add(randInt(1, 12), "minute").toDate(),
        note: chance(0.3)
          ? faker.helpers.arrayElement([
              "Outsole cracked, inform customer",
              "Heel shows mild yellowing",
              "Tongue discolored — cleaning requested",
              null,
            ])
          : null,
        uploaded_by: createdBy,
      });

      if (statusLogs.length >= 2) {
        const midLog = statusLogs[Math.floor((statusLogs.length - 1) / 2)];
        photos.push({
          created_at: dayjs(midLog.created_at)
            .add(randInt(1, 7), "minute")
            .toDate(),
          note: null,
          uploaded_by: handlerId ?? createdBy,
        });
      }

      draftServices.push({
        item_code: itemCode,
        service_id: service.id,
        price: Number(service.price),
        cogs: Number(service.cogs),
        status: finalStatus,
        handler_id: handlerId,
        brand: faker.helpers.arrayElement(BRANDS),
        color: faker.color.human(),
        model: faker.helpers.arrayElement([
          "Classic",
          "Sport",
          "Premium",
          "Traveler",
          "Urban",
        ]),
        size: faker.helpers.arrayElement(SIZES),
        notes: chance(0.35)
          ? faker.helpers.arrayElement(SERVICE_NOTE_POOL)
          : null,
        status_logs: statusLogs,
        handler_logs: handlerLogs,
        photos,
      });
    }

    const draftProducts: DraftProductLine[] = Array.from(
      { length: productCount },
      () => {
        const product = faker.helpers.arrayElement(activeProducts);
        const qty = randInt(1, 3);
        return {
          product_id: product.id,
          price: Number(product.price),
          cogs: Number(product.cogs),
          qty,
          notes: chance(0.2) ? faker.commerce.productDescription() : null,
        };
      }
    );

    const serviceGross = draftServices.reduce(
      (sum, line) => sum + line.price,
      0
    );
    const productGross = draftProducts.reduce(
      (sum, line) => sum + line.price * line.qty,
      0
    );
    const grossTotal = serviceGross + productGross;

    const discountRes = chooseDiscount(
      grossTotal,
      createdAt,
      store.id,
      params.campaigns
    );
    const discount = Math.min(discountRes.discount, grossTotal);
    const netTotal = Math.max(0, grossTotal - discount);

    let paid = chance(0.35);
    if (orderStatus === "completed") {
      paid = chance(0.9);
    } else if (orderStatus === "processing") {
      paid = chance(0.6);
    }

    const paymentMethod = paid
      ? faker.helpers.arrayElement(activePaymentMethods)
      : null;
    let paidAmount = paid ? netTotal : 0;
    let paidAt = paid
      ? dayjs(createdAt).add(randInt(5, 220), "minute").toDate()
      : null;

    const refundedLines = draftServices.filter(
      (line) => line.status === "refunded"
    );
    let refundedAmount = 0;

    if (refundedLines.length > 0 && paidAmount <= 0) {
      paidAmount = netTotal;
      paidAt = dayjs(createdAt).add(randInt(30, 150), "minute").toDate();
    }

    let completedAt: Date | null = null;
    if (orderStatus === "completed") {
      const allLogTimes = draftServices.flatMap((line) =>
        line.status_logs.map((log) => log.created_at)
      );
      completedAt =
        allLogTimes.length > 0
          ? allLogTimes.reduce((max, at) => (at > max ? at : max), createdAt)
          : dayjs(createdAt).add(randInt(15, 50), "minute").toDate();
    }

    const updatedAtCandidates = [
      createdAt,
      ...(paidAt ? [paidAt] : []),
      ...(completedAt ? [completedAt] : []),
      ...draftServices.flatMap((line) => [
        ...line.status_logs.map((log) => log.created_at),
        ...line.handler_logs.map((log) => log.created_at),
        ...line.photos.map((photo) => photo.created_at),
      ]),
    ];

    const updatedAt = updatedAtCandidates.reduce(
      (max, at) => (at > max ? at : max),
      createdAt
    );

    const hasDropoffPhoto = draftServices.length > 0 && chance(0.7);
    const dropoffPhotoPath = hasDropoffPhoto
      ? `seed/orders/${sanitizeForS3(orderCode)}/dropoff/handover.jpg`
      : null;
    const dropoffPhotoUploadedAt = hasDropoffPhoto
      ? dayjs(createdAt).add(randInt(1, 10), "minute").toDate()
      : null;

    const [order] = await db
      .insert(ordersTable)
      .values({
        code: orderCode,
        customer_id: customerId,
        store_id: store.id,
        discount_source: discountRes.discount_source,
        discount: asMoney(discount),
        dropoff_photo_path: dropoffPhotoPath,
        dropoff_photo_uploaded_at: dropoffPhotoUploadedAt,
        dropoff_photo_uploaded_by: hasDropoffPhoto ? createdBy : null,
        payment_status: paidAmount > 0 ? "paid" : "unpaid",
        payment_method_id: paidAmount > 0 ? (paymentMethod?.id ?? null) : null,
        paid_amount: asMoney(paidAmount),
        paid_at: paidAt,
        refunded_amount: "0",
        status: orderStatus,
        total: asMoney(grossTotal),
        notes: chance(0.2) ? faker.lorem.sentence() : null,
        completed_at: completedAt,
        cancelled_at: null,
        created_by: createdBy,
        updated_by: createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      .returning({ id: ordersTable.id });

    if (discountRes.campaign_id !== null && discount > 0) {
      const campaign = params.campaigns.find(
        (item) => item.id === discountRes.campaign_id
      );
      if (campaign) {
        await db.insert(orderCampaignsTable).values({
          order_id: order.id,
          campaign_id: campaign.id,
          discount_type: campaign.discount_type,
          discount_value: asMoney(campaign.discount_value),
          max_discount:
            campaign.max_discount === null
              ? null
              : asMoney(campaign.max_discount),
          applied_amount: asMoney(discount),
          created_at: createdAt,
        });
      }
    }

    const insertedServices = draftServices.length
      ? await db
          .insert(ordersServicesTable)
          .values(
            draftServices.map((line) => ({
              order_id: order.id,
              service_id: line.service_id,
              item_code: line.item_code,
              price: asMoney(line.price),
              cogs_snapshot: asMoney(line.cogs),
              discount: "0",
              notes: line.notes,
              brand: line.brand,
              color: line.color,
              model: line.model,
              size: line.size,
              // seed picked_up as ready_for_pickup; the pickup event insert
              // below flips it in place so the CHECK constraint holds.
              status:
                line.status === "picked_up" ? "ready_for_pickup" : line.status,
              handler_id: line.handler_id,
            }))
          )
          .returning({
            id: ordersServicesTable.id,
            item_code: ordersServicesTable.item_code,
          })
      : [];

    const pickedUpDraftLines = draftServices.filter(
      (line) => line.status === "picked_up"
    );

    if (pickedUpDraftLines.length > 0) {
      const pickupCashier =
        params.cashiersByStore.get(store.id)?.[0] ??
        params.workersByStore.get(store.id)?.[0] ??
        createdBy;

      const pickupCreatedAt =
        pickedUpDraftLines
          .flatMap((line) => line.status_logs.map((log) => log.created_at))
          .reduce<Date | null>(
            (max, at) => (max && at < max ? max : at),
            null
          ) ?? dayjs(createdAt).add(randInt(60, 240), "minute").toDate();

      const [pickupEvent] = await db
        .insert(orderPickupEventsTable)
        .values({
          order_id: order.id,
          image_path: `seed/orders/${sanitizeForS3(orderCode)}/pickup/event-1.jpg`,
          picked_up_by: pickupCashier,
          picked_up_at: pickupCreatedAt,
          created_at: pickupCreatedAt,
        })
        .returning({ id: orderPickupEventsTable.id });

      const pickedUpItemCodes = new Set(
        pickedUpDraftLines.map((line) => line.item_code)
      );
      const pickedUpServiceIds = insertedServices
        .filter((row) => row.item_code && pickedUpItemCodes.has(row.item_code))
        .map((row) => row.id);

      if (pickedUpServiceIds.length > 0) {
        await db
          .update(ordersServicesTable)
          .set({
            status: "picked_up",
            pickup_event_id: pickupEvent.id,
          })
          .where(
            sql`${ordersServicesTable.id} IN (${sql.join(
              pickedUpServiceIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
      }
    }

    if (draftProducts.length > 0) {
      await db.insert(ordersProductsTable).values(
        draftProducts.map((line) => ({
          order_id: order.id,
          product_id: line.product_id,
          price: asMoney(line.price),
          cogs_snapshot: asMoney(line.cogs * line.qty),
          qty: line.qty,
          discount: "0",
          notes: line.notes,
        }))
      );
    }

    const serviceIdByItemCode = new Map(
      insertedServices
        .filter((line) => !!line.item_code)
        .map((line) => [line.item_code as string, line.id])
    );

    const statusLogRows = draftServices.flatMap((line) =>
      line.status_logs.map((log) => ({
        order_service_id: serviceIdByItemCode.get(line.item_code) ?? 0,
        from_status: log.from_status,
        to_status: log.to_status,
        changed_by: log.changed_by,
        created_at: log.created_at,
        note: log.note,
      }))
    );

    const handlerLogRows = draftServices.flatMap((line) =>
      line.handler_logs.map((log) => ({
        order_service_id: serviceIdByItemCode.get(line.item_code) ?? 0,
        from_handler_id: log.from_handler_id,
        to_handler_id: log.to_handler_id,
        changed_by: log.changed_by,
        created_at: log.created_at,
        note: log.note,
      }))
    );

    const safeOrderCode = sanitizeForS3(orderCode);
    const photoRows = draftServices.flatMap((line) =>
      line.photos.map((photo, photoIndex) => {
        const safeItem = sanitizeForS3(line.item_code);
        const imagePath = `seed/orders/${safeOrderCode}/${safeItem}/item-${photoIndex + 1}.jpg`;
        return {
          order_service_id: serviceIdByItemCode.get(line.item_code) ?? 0,
          image_path: imagePath,
          note: photo.note,
          uploaded_by: photo.uploaded_by,
          created_at: photo.created_at,
          updated_at: photo.created_at,
        };
      })
    );

    if (statusLogRows.length > 0) {
      await db
        .insert(orderServiceStatusLogsTable)
        .values(statusLogRows.filter((row) => row.order_service_id > 0));
    }

    if (handlerLogRows.length > 0) {
      await db
        .insert(orderServiceHandlerLogsTable)
        .values(handlerLogRows.filter((row) => row.order_service_id > 0));
    }

    if (photoRows.length > 0) {
      await db
        .insert(orderServicesImagesTable)
        .values(photoRows.filter((row) => row.order_service_id > 0));
    }

    if (refundedLines.length > 0) {
      const items = refundedLines
        .map((line) => {
          const allocatedDiscount =
            grossTotal > 0
              ? Math.floor((line.price / grossTotal) * discount)
              : 0;
          const amount = Math.max(0, line.price - allocatedDiscount);
          return {
            order_service_id: serviceIdByItemCode.get(line.item_code) ?? 0,
            amount,
            reason: faker.helpers.arrayElement([
              "damaged",
              "cannot_process",
              "lost",
              "other",
            ] as const),
            note: chance(0.15) ? faker.lorem.sentence() : null,
          };
        })
        .filter((item) => item.order_service_id > 0 && item.amount > 0);

      const totalRefund = items.reduce((sum, item) => sum + item.amount, 0);
      const boundedRefund = Math.min(totalRefund, paidAmount);

      if (items.length > 0 && boundedRefund > 0) {
        const [refund] = await db
          .insert(orderRefundsTable)
          .values({
            order_id: order.id,
            refunded_by: createdBy,
            total_amount: asMoney(boundedRefund),
            note: faker.lorem.sentence(),
            created_at: dayjs(updatedAt).add(randInt(5, 45), "minute").toDate(),
          })
          .returning({ id: orderRefundsTable.id });

        await db.insert(orderRefundItemsTable).values(
          items.map((item) => ({
            order_refund_id: refund.id,
            order_service_id: item.order_service_id,
            amount: asMoney(item.amount),
            reason: item.reason,
            note:
              item.reason === "other"
                ? (item.note ?? faker.lorem.sentence())
                : item.note,
          }))
        );

        refundedAmount = boundedRefund;

        await db
          .update(ordersTable)
          .set({
            refunded_amount: asMoney(refundedAmount),
            paid_amount: asMoney(paidAmount),
            payment_status: paidAmount > 0 ? "paid" : "unpaid",
            updated_by: createdBy,
          })
          .where(sql`${ordersTable.id} = ${order.id}`);
      }
    }
  }

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
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
    store_ids: campaignScopeMap.get(campaign.id) ?? new Set<number>(),
  }));

  const customers = await seedCustomers(stores, cashiersByStore);

  await seedShifts(stores, workersByStore);

  await seedOrders({
    stores,
    customers,
    services: catalog.services,
    products: catalog.products,
    paymentMethods: catalog.paymentMethods,
    campaigns: campaignRows,
    cashiersByStore,
    workersByStore,
  });

  await db
    .update(usersTable)
    .set({
      password: await Bun.password.hash(ADMIN_PASSWORD),
    })
    .where(sql`${usersTable.username} = 'admin'`);
}
