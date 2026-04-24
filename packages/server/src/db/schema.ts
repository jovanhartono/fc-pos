import { type SQL, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "cashier", "worker"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const usersTable = pgTable(
  "users",
  {
    can_process_pickup: boolean("can_process_pickup").default(false).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean().default(true).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    password: varchar("password", {
      length: 255,
    }).notNull(),
    role: userRoleEnum("role").notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    username: varchar("username", { length: 255 }).notNull().unique(),
  },
  (table) => [
    check("username_len-check", sql`LENGTH(TRIM(${table.username})) >= 5`),
  ]
);

// store
export const storesTable = pgTable(
  "stores",
  {
    address: varchar("address", { length: 255 }).notNull(),
    code: varchar("code", { length: 3 }).unique().notNull(),
    created_at: timestamp().defaultNow().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean().default(false).notNull(),
    latitude: decimal("latitude", { precision: 11, scale: 8 }).notNull(),
    longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone_number: varchar("phone_number", { length: 16 }).unique().notNull(),
  },
  (table) => [check("code_len_check", sql`LENGTH(TRIM(${table.code})) = 3`)]
);

// customer
export const customersTable = pgTable(
  "customers",
  {
    address: text("address"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    created_by: integer("created_by")
      .references(() => usersTable.id)
      .notNull(),
    email: varchar("email", { length: 255 }).unique(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 255 }).notNull(),
    origin_store_id: integer("origin_store_id")
      .references(() => storesTable.id)
      .notNull(),
    phone_number: varchar("phone_number", { length: 16 }).notNull().unique(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updated_by: integer("updated_by")
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index("customer_name_idx").on(table.name),
    index("customer_phone_idx").on(table.phone_number),
  ]
);

export const categoriesTable = pgTable("categories", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  is_active: boolean("is_active").notNull().default(false),
});

export const productsTable = pgTable(
  "products",
  {
    category_id: integer("category_id")
      .references(() => categoriesTable.id)
      .notNull(),
    cogs: decimal("cogs", { precision: 12 }).default("0").notNull(),
    price: decimal("price", { precision: 12 }).default("0").notNull(),
    description: text("description"),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean("is_active").default(false).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 255 }).unique().notNull(),
    stock: integer("stock").default(0).notNull(),
    uom: varchar("uom", { length: 12 }).default("pcs").notNull(),
  },
  (table) => [
    index("product_name_idx").on(table.name),
    check("stock_non_negative_check", sql`${table.stock} >= 0`),
  ]
);

export const servicesTable = pgTable(
  "services",
  {
    category_id: integer("category_id")
      .references(() => categoriesTable.id)
      .notNull(),
    code: varchar("code", { length: 4 }).unique().notNull(),
    cogs: decimal("cogs", { precision: 12 }).default("0").notNull(),
    price: decimal("price", { precision: 12 }).default("0").notNull(),
    description: text("description"),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean("is_active").default(false).notNull(),
    is_priority: boolean("is_priority").default(false).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("service_name_idx").on(table.name),
    index("service_code_idx").on(table.code),
    index("service_priority_idx").on(table.is_priority),
    check(
      "code_len_check",
      sql`LENGTH(TRIM(${table.code})) >= 1 AND LENGTH(TRIM(${table.code})) <= 4`
    ),
  ]
);

// order
export const paymentMethodsTable = pgTable("payment_methods", {
  code: varchar("code", { length: 6 }).notNull().unique(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  is_active: boolean("is_active").default(false).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
});

export const orderPaymentStatusEnum = pgEnum("order_payment_status", [
  "paid",
  "unpaid",
]);
export const orderStatusEnum = pgEnum("order_status_enum", [
  "created",
  "processing",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);
export const discountSourceEnum = pgEnum("discount_source_enum", [
  "none",
  "manual",
  "campaign",
]);
export const campaignDiscountTypeEnum = pgEnum("campaign_discount_type_enum", [
  "fixed",
  "percentage",
]);
export const orderServiceStatusEnum = pgEnum("order_service_status_enum", [
  "queued",
  "processing",
  "quality_check",
  "qc_reject",
  "ready_for_pickup",
  "picked_up",
  "refunded",
  "cancelled",
]);
export const refundReasonEnum = pgEnum("refund_reason_enum", [
  "damaged",
  "cannot_process",
  "lost",
  "other",
  "customer_cancelled",
]);

export const campaignsTable = pgTable(
  "campaigns",
  {
    code: varchar("code", { length: 32 }).notNull().unique(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    created_by: integer("created_by")
      .references(() => usersTable.id)
      .notNull(),
    discount_type: campaignDiscountTypeEnum("discount_type").notNull(),
    discount_value: decimal("discount_value", { precision: 12 })
      .default("0")
      .notNull(),
    ends_at: timestamp("ends_at"),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean("is_active").default(true).notNull(),
    max_discount: decimal("max_discount", { precision: 12 }),
    min_order_total: decimal("min_order_total", { precision: 12 })
      .default("0")
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    starts_at: timestamp("starts_at"),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updated_by: integer("updated_by")
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index("campaign_code_idx").on(table.code),
    index("campaign_name_idx").on(table.name),
    index("campaign_active_idx").on(table.is_active),
    check(
      "campaign_discount_value_non_negative_check",
      sql`${table.discount_value} >= 0`
    ),
    check(
      "campaign_min_order_total_non_negative_check",
      sql`${table.min_order_total} >= 0`
    ),
    check(
      "campaign_max_discount_non_negative_check",
      sql`${table.max_discount} >= 0`
    ),
    check(
      "campaign_period_valid_check",
      sql`${table.ends_at} IS NULL OR ${table.starts_at} IS NULL OR ${table.ends_at} >= ${table.starts_at}`
    ),
    check(
      "campaign_percentage_discount_limit_check",
      sql`${table.discount_type} != 'percentage' OR (${table.discount_value} >= 0 AND ${table.discount_value} <= 100)`
    ),
  ]
);

export const campaignStoresTable = pgTable(
  "campaign_stores",
  {
    campaign_id: integer("campaign_id")
      .references(() => campaignsTable.id, { onDelete: "cascade" })
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    store_id: integer("store_id")
      .references(() => storesTable.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("campaign_stores_campaign_idx").on(table.campaign_id),
    index("campaign_stores_store_idx").on(table.store_id),
    uniqueIndex("campaign_stores_campaign_store_uidx").on(
      table.campaign_id,
      table.store_id
    ),
  ]
);

export const userStoresTable = pgTable(
  "user_stores",
  {
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    store_id: integer("store_id")
      .references(() => storesTable.id, { onDelete: "cascade" })
      .notNull(),
    user_id: integer("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("user_stores_user_idx").on(table.user_id),
    index("user_stores_store_idx").on(table.store_id),
    uniqueIndex("user_stores_user_store_uidx").on(
      table.user_id,
      table.store_id
    ),
  ]
);

export const shiftsTable = pgTable(
  "shifts",
  {
    clock_in_at: timestamp("clock_in_at").defaultNow().notNull(),
    clock_out_at: timestamp("clock_out_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    store_id: integer("store_id")
      .references(() => storesTable.id, { onDelete: "restrict" })
      .notNull(),
    updated_at: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    user_id: integer("user_id")
      .references(() => usersTable.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("shifts_user_clock_in_idx").on(table.user_id, table.clock_in_at),
    index("shifts_store_clock_in_idx").on(table.store_id, table.clock_in_at),
    uniqueIndex("shifts_user_open_uidx")
      .on(table.user_id)
      .where(sql`${table.clock_out_at} IS NULL`),
    check(
      "shifts_clock_out_after_clock_in_check",
      sql`${table.clock_out_at} IS NULL OR ${table.clock_out_at} >= ${table.clock_in_at}`
    ),
  ]
);

export const ordersTable = pgTable(
  "orders",
  {
    cancelled_at: timestamp("cancelled_at"),
    code: varchar("code", { length: 32 }).notNull().unique(),

    completed_at: timestamp("completed_at"),

    created_at: timestamp("created_at").notNull().defaultNow(),

    // cashier
    created_by: integer("created_by")
      .references(() => usersTable.id)
      .notNull(),
    customer_id: integer("customer_id")
      .references(() => customersTable.id)
      .notNull(),
    dropoff_photo_path: varchar("dropoff_photo_path", { length: 512 }),
    dropoff_photo_uploaded_at: timestamp("dropoff_photo_uploaded_at"),
    dropoff_photo_uploaded_by: integer("dropoff_photo_uploaded_by").references(
      () => usersTable.id
    ),
    discount_source: discountSourceEnum("discount_source")
      .default("none")
      .notNull(),
    discount: decimal("discount", { precision: 12 }).default("0").notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    notes: text("notes"),

    payment_method_id: integer("payment_method_id").references(
      () => paymentMethodsTable.id
    ),
    payment_status: orderPaymentStatusEnum("payment_status")
      .default("unpaid")
      .notNull(),
    paid_amount: decimal("paid_amount", { precision: 12 })
      .default("0")
      .notNull(),
    paid_at: timestamp("paid_at"),

    pickup_code: varchar("pickup_code", { length: 6 })
      .notNull()
      .default(sql`lpad(floor(random() * 1000000)::text, 6, '0')`),

    refunded_amount: decimal("refunded_amount", { precision: 12 })
      .default("0")
      .notNull(),
    status: orderStatusEnum("status").default("created").notNull(),

    store_id: integer("store_id")
      .references(() => storesTable.id)
      .notNull(),

    // snapshot
    total: decimal("total", { precision: 12 }).default("0"),
    updated_at: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updated_by: integer("updated_by")
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index("order_store_idx").on(table.store_id),
    index("order_store_created_at_idx").on(table.store_id, table.created_at),
    index("order_customer_idx").on(table.customer_id),
    index("order_payment_status_idx").on(table.payment_status),
    index("order_status_idx").on(table.status),
    index("order_created_at_idx").on(table.created_at),
    uniqueIndex("order_code_idx").on(table.code),
    check("total_non_negative_check", sql`${table.total} >= 0`),
    check("paid_amount_non_negative_check", sql`${table.paid_amount} >= 0`),
    check(
      "refunded_amount_non_negative_check",
      sql`${table.refunded_amount} >= 0`
    ),
    check("discount_non_negative_check", sql`${table.discount} >= 0`),
    check("discount_valid_check", sql`(${table.total}) >= ${table.discount}`),
    check(
      "paid_amount_valid_check",
      sql`${table.paid_amount} <= ${table.total}`
    ),
    check(
      "refunded_amount_valid_check",
      sql`${table.refunded_amount} <= ${table.paid_amount}`
    ),
  ]
);

export const orderCountersTable = pgTable(
  "order_counters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    store_code: varchar("store_code", { length: 10 }).notNull(),
    date_str: varchar("date_str", { length: 8 }).notNull(), // e.g. 05102025
    last_number: integer("last_number").notNull().default(0),
  },
  (table) => [
    uniqueIndex("order_counter_store_date_uidx").on(
      table.store_code,
      table.date_str
    ),
  ]
);

export const orderCampaignsTable = pgTable(
  "order_campaigns",
  {
    applied_amount: decimal("applied_amount", { precision: 12 })
      .default("0")
      .notNull(),
    campaign_id: integer("campaign_id")
      .references(() => campaignsTable.id, { onDelete: "restrict" })
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    discount_type: campaignDiscountTypeEnum("discount_type").notNull(),
    discount_value: decimal("discount_value", { precision: 12 })
      .default("0")
      .notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    max_discount: decimal("max_discount", { precision: 12 }),
    order_id: integer("order_id")
      .references(() => ordersTable.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("order_campaigns_order_idx").on(table.order_id),
    index("order_campaigns_campaign_idx").on(table.campaign_id),
    uniqueIndex("order_campaigns_order_campaign_uidx").on(
      table.order_id,
      table.campaign_id
    ),
    check(
      "order_campaigns_applied_amount_non_negative_check",
      sql`${table.applied_amount} >= 0`
    ),
  ]
);

export const ordersServicesTable = pgTable(
  "orders_services",
  {
    discount: decimal("discount", { precision: 12 }).default("0").notNull(),

    cancel_reason: text("cancel_reason"),
    handler_id: integer("handler_id").references(() => usersTable.id),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_priority: boolean("is_priority").default(false).notNull(),
    item_code: varchar("item_code", { length: 64 }),
    notes: text("notes"),
    order_id: integer("order_id").references(() => ordersTable.id, {
      onDelete: "cascade",
    }),

    pickup_event_id: integer("pickup_event_id").references(
      () => orderPickupEventsTable.id,
      { onDelete: "set null" }
    ),

    // snapshot
    price: decimal("price", { precision: 12 }).default("0"),
    cogs_snapshot: decimal("cogs_snapshot", { precision: 12 })
      .default("0")
      .notNull(),

    brand: varchar("brand", { length: 255 }),
    color: varchar("color", { length: 255 }),
    model: varchar("model", { length: 255 }),
    size: varchar("size", { length: 64 }),
    service_id: integer("service_id").references(() => servicesTable.id, {
      onDelete: "cascade",
    }),

    status: orderServiceStatusEnum("status").default("queued").notNull(),

    subtotal: decimal("subtotal", {
      precision: 12,
    }).generatedAlwaysAs(
      (): SQL =>
        sql`${ordersServicesTable.price} - ${ordersServicesTable.discount}`
    ),
  },
  (table) => [
    index("order_services_order_idx").on(table.order_id),
    index("order_services_service_idx").on(table.service_id),
    index("order_services_order_service_idx").on(
      table.order_id,
      table.service_id
    ),
    index("order_services_handler_status_idx").on(
      table.handler_id,
      table.status
    ),
    index("order_services_priority_idx").on(table.is_priority),
    index("order_services_item_code_idx").on(table.item_code),
    index("order_services_pickup_event_idx").on(table.pickup_event_id),
    uniqueIndex("order_services_item_code_uidx").on(table.item_code),
    check("price_non_negative_check", sql`${table.price} >= 0`),
    check("discount_valid_check", sql`${table.price} >= ${table.discount}`),
    check(
      "order_services_pickup_event_terminal_check",
      sql`${table.pickup_event_id} IS NULL OR ${table.status} IN ('picked_up', 'refunded')`
    ),
  ]
);

export const orderPickupEventsTable = pgTable(
  "order_pickup_events",
  {
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    image_path: varchar("image_path", { length: 512 }).notNull(),
    order_id: integer("order_id")
      .references(() => ordersTable.id, { onDelete: "cascade" })
      .notNull(),
    picked_up_at: timestamp("picked_up_at").defaultNow().notNull(),
    picked_up_by: integer("picked_up_by")
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index("order_pickup_events_order_idx").on(table.order_id),
    index("order_pickup_events_picked_up_by_idx").on(table.picked_up_by),
  ]
);

export const orderServicesImagesTable = pgTable("order_services_images", {
  created_at: timestamp("created_at").defaultNow().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  image_path: varchar("image_path", { length: 512 }).notNull(),
  note: text("note"),
  order_service_id: integer("order_service_id").references(
    () => ordersServicesTable.id,
    { onDelete: "cascade" }
  ),
  uploaded_by: integer("uploaded_by").references(() => usersTable.id),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const orderServiceStatusLogsTable = pgTable(
  "order_service_status_logs",
  {
    changed_by: integer("changed_by")
      .references(() => usersTable.id)
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    from_status: orderServiceStatusEnum("from_status"),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    note: text("note"),
    order_service_id: integer("order_service_id")
      .references(() => ordersServicesTable.id, { onDelete: "cascade" })
      .notNull(),
    to_status: orderServiceStatusEnum("to_status").notNull(),
  },
  (table) => [
    index("order_service_status_logs_service_idx").on(table.order_service_id),
    index("order_service_status_logs_changed_by_idx").on(table.changed_by),
    index("order_service_status_logs_processing_idx")
      .on(table.to_status, table.from_status, table.created_at)
      .where(sql`${table.to_status} = 'processing'`),
  ]
);

export const orderServiceHandlerLogsTable = pgTable(
  "order_service_handler_logs",
  {
    changed_by: integer("changed_by")
      .references(() => usersTable.id)
      .notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    from_handler_id: integer("from_handler_id").references(() => usersTable.id),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    note: text("note"),
    order_service_id: integer("order_service_id")
      .references(() => ordersServicesTable.id, { onDelete: "cascade" })
      .notNull(),
    to_handler_id: integer("to_handler_id").references(() => usersTable.id),
  },
  (table) => [
    index("order_service_handler_logs_service_idx").on(table.order_service_id),
    index("order_service_handler_logs_changed_by_idx").on(table.changed_by),
  ]
);

export const orderRefundsTable = pgTable(
  "order_refunds",
  {
    created_at: timestamp("created_at").defaultNow().notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    note: text("note"),
    order_id: integer("order_id")
      .references(() => ordersTable.id, { onDelete: "cascade" })
      .notNull(),
    refunded_by: integer("refunded_by")
      .references(() => usersTable.id)
      .notNull(),
    total_amount: decimal("total_amount", { precision: 12 })
      .default("0")
      .notNull(),
  },
  (table) => [
    index("order_refunds_order_idx").on(table.order_id),
    index("order_refunds_refunded_by_idx").on(table.refunded_by),
    check(
      "order_refunds_total_amount_non_negative_check",
      sql`${table.total_amount} >= 0`
    ),
  ]
);

export const orderRefundItemsTable = pgTable(
  "order_refund_items",
  {
    amount: decimal("amount", { precision: 12 }).default("0").notNull(),
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    note: text("note"),
    order_refund_id: integer("order_refund_id")
      .references(() => orderRefundsTable.id, { onDelete: "cascade" })
      .notNull(),
    order_service_id: integer("order_service_id")
      .references(() => ordersServicesTable.id)
      .notNull(),
    reason: refundReasonEnum("reason").notNull(),
  },
  (table) => [
    index("order_refund_items_refund_idx").on(table.order_refund_id),
    index("order_refund_items_service_idx").on(table.order_service_id),
    check(
      "order_refund_items_amount_non_negative_check",
      sql`${table.amount} >= 0`
    ),
    check(
      "order_refund_items_other_reason_requires_note_check",
      sql`${table.reason} != 'other' OR (${table.note} IS NOT NULL AND LENGTH(TRIM(${table.note})) > 0)`
    ),
  ]
);

export const ordersProductsTable = pgTable(
  "orders_products",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    discount: decimal("discount", { precision: 12 }).default("0").notNull(),
    notes: text("notes"),
    order_id: integer("order_id").references(() => ordersTable.id, {
      onDelete: "cascade",
    }),

    // snapshot
    price: decimal("price", { precision: 12 }).default("0"),
    cogs_snapshot: decimal("cogs_snapshot", { precision: 12 })
      .default("0")
      .notNull(),
    product_id: integer("product_id").references(() => productsTable.id, {
      onDelete: "cascade",
    }),

    qty: smallint("qty").notNull().default(1),

    subtotal: decimal("subtotal", {
      precision: 12,
    }).generatedAlwaysAs(
      (): SQL =>
        sql`(${ordersProductsTable.price} * ${ordersProductsTable.qty}) - ${ordersProductsTable.discount}`
    ),
  },
  (table) => [
    index("order_products_order_idx").on(table.order_id),
    index("order_products_product_idx").on(table.product_id),
    index("order_products_order_product_idx").on(
      table.order_id,
      table.product_id
    ),
    check("price_non_negative_check", sql`${table.price} >= 0`),
    check("qty_positive_check", sql`${table.qty} > 0`),
    check(
      "discount_valid_check",
      sql`(${table.price} * ${table.qty}) >= ${table.discount}`
    ),
  ]
);
