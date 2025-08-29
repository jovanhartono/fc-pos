import { relations, type SQL, sql } from 'drizzle-orm';
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
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'cashier',
  'worker',
]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const usersTable = pgTable(
  'users',
  {
    created_at: timestamp('created_at').defaultNow().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean().default(true).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    password: varchar('password', {
      length: 255,
    }).notNull(),
    role: userRoleEnum('role').notNull(),
    updated_at: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    username: varchar('username', { length: 255 }).notNull().unique(),
  },
  (table) => [
    check('username_len-check', sql`LENGTH(TRIM(${table.username})) >= 5`),
  ]
);
export const usersRelations = relations(usersTable, ({ many }) => ({
  orderServices: many(ordersServicesTable),
  orders: many(ordersTable),
}));

// store
export const storesTable = pgTable(
  'stores',
  {
    address: varchar('address', { length: 255 }).notNull(),
    code: varchar('code', { length: 3 }).unique().notNull(),
    created_at: timestamp().defaultNow().notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean().default(false).notNull(),
    latitude: decimal('latitude', { precision: 11, scale: 8 }).notNull(),
    longitude: decimal('longitude', { precision: 11, scale: 8 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone_number: varchar('phone_number', { length: 16 }).unique().notNull(),
  },
  (table) => [check('code_len_check', sql`LENGTH(TRIM(${table.code})) = 3`)]
);
export const storesRelations = relations(storesTable, ({ many }) => ({
  customers: many(customersTable),
  orders: many(ordersTable),
  servicePrices: many(storeServicePricesTable),
}));

// customer
export const customersTable = pgTable(
  'customers',
  {
    address: text('address'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    created_by: integer('created_by')
      .references(() => usersTable.id)
      .notNull(),
    email: varchar('email', { length: 255 }).unique(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar('name', { length: 255 }).notNull(),
    origin_store_id: integer('origin_store_id')
      .references(() => storesTable.id)
      .notNull(),
    phone_number: varchar('phone_number', { length: 16 }).notNull().unique(),
    updated_at: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updated_by: integer('updated_by')
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index('customer_name_idx').on(table.name),
    index('customer_phone_idx').on(table.phone_number),
  ]
);
export const customersRelations = relations(
  customersTable,
  ({ one, many }) => ({
    createdBy: one(usersTable, {
      fields: [customersTable.created_by],
      references: [usersTable.id],
    }),
    orders: many(ordersTable),
    originStore: one(storesTable, {
      fields: [customersTable.origin_store_id],
      references: [storesTable.id],
    }),
    updatedBy: one(usersTable, {
      fields: [customersTable.updated_by],
      references: [usersTable.id],
    }),
  })
);

export const categoriesTable = pgTable('categories', {
  description: text('description'),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  is_active: boolean('is_active').notNull().default(false),
  name: varchar('name', { length: 255 }).notNull(),
});

export const productsTable = pgTable(
  'products',
  {
    category_id: integer('category_id')
      .references(() => categoriesTable.id)
      .notNull(),
    cogs: decimal('cogs', { precision: 12, scale: 2 }).default('0').notNull(),
    description: text('description'),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean('is_active').default(false).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 255 }).unique().notNull(),
    stock: integer('stock').default(0).notNull(),
    uom: varchar('uom', { length: 12 }).default('pcs').notNull(),
  },
  (table) => [
    index('product_name_idx').on(table.name),
    check('stock_non_negative_check', sql`${table.stock} >= 0`),
  ]
);
export const productsRelations = relations(productsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [productsTable.category_id],
    references: [categoriesTable.id],
  }),
  orderProducts: many(ordersProductsTable),
}));

export const servicesTable = pgTable(
  'services',
  {
    category_id: integer('category_id')
      .references(() => categoriesTable.id)
      .notNull(),
    code: varchar('code', { length: 4 }).unique().notNull(),
    cogs: decimal('cogs', { precision: 12, scale: 2 }).default('0').notNull(),
    description: text('description'),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    is_active: boolean('is_active').default(false).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
  },
  (table) => [
    index('service_name_idx').on(table.name),
    index('service_code_idx').on(table.code),
    check(
      'code_len_check',
      sql`LENGTH(TRIM(${table.code})) >= 1 AND LENGTH(TRIM(${table.code})) <= 4`
    ),
  ]
);
export const servicesRelations = relations(servicesTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [servicesTable.category_id],
    references: [categoriesTable.id],
  }),
  orders: many(ordersServicesTable),
  servicePrices: many(storeServicePricesTable),
}));

export const storeServicePricesTable = pgTable(
  'store_service_prices',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    service_id: integer('service_id').references(() => servicesTable.id, {
      onDelete: 'cascade',
    }),
    store_id: integer('store_id').references(() => storesTable.id, {
      onDelete: 'cascade',
    }),
  },
  (table) => [
    uniqueIndex('store_service_idx').on(table.store_id, table.service_id),
    check('price_non_negative_check', sql`${table.price} >= 0`),
  ]
);
export const storeServicePricesRelations = relations(
  storeServicePricesTable,
  ({ one }) => ({
    service: one(servicesTable, {
      fields: [storeServicePricesTable.service_id],
      references: [servicesTable.id],
    }),
    store: one(storesTable, {
      fields: [storeServicePricesTable.store_id],
      references: [storesTable.id],
    }),
  })
);

// order
export const paymentMethodsTable = pgTable('payment_methods', {
  code: varchar('code', { length: 6 }).notNull().unique(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  is_active: boolean('is_active').default(false).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
});
export const paymentMethodsRelations = relations(
  paymentMethodsTable,
  ({ many }) => ({
    orders: many(ordersTable),
  })
);

export const orderPaymentStatusEnum = pgEnum('order_payment_status', [
  'paid',
  'partial',
  'unpaid',
]);
export const orderStatusEnum = pgEnum('order_status_enum', [
  'created',
  'processing',
  'completed',
  'cancelled',
]);
export const ordersTable = pgTable(
  'orders',
  {
    cancelled_at: timestamp('cancelled_at'),
    code: varchar('code', { length: 12 }).notNull().unique(),

    completed_at: timestamp('completed_at'),

    created_at: timestamp('created_at').notNull().defaultNow(),

    // cashier
    created_by: integer('created_by')
      .references(() => usersTable.id)
      .notNull(),
    customer_id: integer('customer_id')
      .references(() => customersTable.id)
      .notNull(),
    discount: decimal('discount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    notes: text('notes'),

    payment_method_id: integer('payment_method_id').references(
      () => paymentMethodsTable.id
    ),
    payment_status: orderPaymentStatusEnum('payment_status')
      .default('unpaid')
      .notNull(),

    status: orderStatusEnum('status').default('created').notNull(),

    store_id: integer('store_id')
      .references(() => storesTable.id)
      .notNull(),

    // snapshot
    total: decimal('total', { precision: 12, scale: 2 }).default('0'),
    updated_at: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updated_by: integer('updated_by')
      .references(() => usersTable.id)
      .notNull(),
  },
  (table) => [
    index('order_store_idx').on(table.store_id),
    index('order_customer_idx').on(table.customer_id),
    index('order_payment_status_idx').on(table.payment_status),
    uniqueIndex('order_code_idx').on(table.code),
    check('total_non_negative_check', sql`${table.total} >= 0`),
    check('discount_non_negative_check', sql`${table.discount} >= 0`),
    check('discount_valid_check', sql`(${table.total}) >= ${table.discount}`),
  ]
);
export const ordersRelations = relations(ordersTable, ({ one, many }) => ({
  createdBy: one(usersTable, {
    fields: [ordersTable.created_by],
    references: [usersTable.id],
  }),
  customer: one(customersTable, {
    fields: [ordersTable.customer_id],
    references: [customersTable.id],
  }),
  paymentMethod: one(paymentMethodsTable, {
    fields: [ordersTable.payment_method_id],
    references: [paymentMethodsTable.id],
  }),
  products: many(ordersProductsTable),
  services: many(ordersServicesTable),
  store: one(storesTable, {
    fields: [ordersTable.store_id],
    references: [storesTable.id],
  }),
  updatedBy: one(usersTable, {
    fields: [ordersTable.updated_by],
    references: [usersTable.id],
  }),
}));

export const ordersServicesTable = pgTable(
  'orders_services',
  {
    discount: decimal('discount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),

    handler_id: integer('handler_id').references(() => usersTable.id),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    notes: text('notes'),
    order_id: integer('order_id').references(() => ordersTable.id, {
      onDelete: 'cascade',
    }),

    // snapshot
    price: decimal('price', { precision: 12, scale: 2 }).default('0'),

    qty: smallint('qty').notNull().default(1),
    service_id: integer('service_id').references(() => servicesTable.id, {
      onDelete: 'cascade',
    }),

    subtotal: decimal('subtotal', {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(
      (): SQL =>
        sql`(${ordersServicesTable.price} * ${ordersServicesTable.qty}) - ${ordersServicesTable.discount}`
    ),
  },
  (table) => [
    index('order_services_order_idx').on(table.order_id),
    index('order_services_service_idx').on(table.service_id),
    index('order_services_order_service_idx').on(
      table.order_id,
      table.service_id
    ),
    check('price_non_negative_check', sql`${table.price} >= 0`),
    check('qty_positive_check', sql`${table.qty} > 0`),
    check(
      'discount_valid_check',
      sql`(${table.price} * ${table.qty}) >= ${table.discount}`
    ),
  ]
);
export const ordersServicesRelations = relations(
  ordersServicesTable,
  ({ one, many }) => ({
    handler: one(usersTable, {
      fields: [ordersServicesTable.handler_id],
      references: [usersTable.id],
    }),
    images: many(orderServicesImagesTable),
    order: one(ordersTable, {
      fields: [ordersServicesTable.order_id],
      references: [ordersTable.id],
    }),
    service: one(servicesTable, {
      fields: [ordersServicesTable.service_id],
      references: [servicesTable.id],
    }),
  })
);

export const orderServicesImagesTable = pgTable('order_services_images', {
  created_at: timestamp('created_at').defaultNow().notNull(),
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  image_url: varchar('image_url', { length: 255 }).notNull(),
  order_service_id: integer('order_service_id').references(
    () => ordersServicesTable.id,
    { onDelete: 'cascade' }
  ),
  updated_at: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export const orderServicesImagesRelations = relations(
  orderServicesImagesTable,
  ({ one }) => ({
    orderService: one(ordersServicesTable, {
      fields: [orderServicesImagesTable.order_service_id],
      references: [ordersServicesTable.id],
    }),
  })
);

export const ordersProductsTable = pgTable(
  'orders_products',
  {
    discount: decimal('discount', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    notes: text('notes'),
    order_id: integer('order_id').references(() => ordersTable.id, {
      onDelete: 'cascade',
    }),

    // snapshot
    price: decimal('price', { precision: 12, scale: 2 }).default('0'),
    product_id: integer('product_id').references(() => productsTable.id, {
      onDelete: 'cascade',
    }),

    qty: smallint('qty').notNull().default(1),

    subtotal: decimal('subtotal', {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(
      (): SQL =>
        sql`(${ordersProductsTable.price} * ${ordersProductsTable.qty}) - ${ordersProductsTable.discount}`
    ),
  },
  (table) => [
    index('order_products_order_idx').on(table.order_id),
    index('order_products_product_idx').on(table.product_id),
    index('order_products_order_product_idx').on(
      table.order_id,
      table.product_id
    ),
    check('price_non_negative_check', sql`${table.price} >= 0`),
    check('qty_positive_check', sql`${table.qty} > 0`),
    check(
      'discount_valid_check',
      sql`(${table.price} * ${table.qty}) >= ${table.discount}`
    ),
  ]
);
export const ordersProductsRelations = relations(
  ordersProductsTable,
  ({ one }) => ({
    order: one(ordersTable, {
      fields: [ordersProductsTable.order_id],
      references: [ordersTable.id],
    }),
    product: one(productsTable, {
      fields: [ordersProductsTable.product_id],
      references: [productsTable.id],
    }),
  })
);
