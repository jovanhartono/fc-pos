import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

export const orderPaymentStatus = pgEnum("order_payment_status", [
	"paid",
	"partial",
	"unpaid",
]);
export const userRole = pgEnum("user_role", ["admin", "cashier", "cleaner"]);

export const customers = pgTable(
	"customers",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "customers_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: varchar({ length: 255 }).notNull(),
		phoneNumber: varchar("phone_number", { length: 16 }).notNull(),
		email: varchar({ length: 255 }),
		address: text(),
		originStoreId: integer("origin_store_id").notNull(),
		createdAt: timestamp("created_at", { mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("customer_name_idx").using(
			"btree",
			table.name.asc().nullsLast().op("text_ops"),
		),
		index("customer_phone_idx").using(
			"btree",
			table.phoneNumber.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.originStoreId],
			foreignColumns: [stores.id],
			name: "customers_origin_store_id_stores_id_fk",
		}),
		unique("customers_phone_number_unique").on(table.phoneNumber),
		unique("customers_email_unique").on(table.email),
	],
);

export const categories = pgTable("categories", {
	id: integer()
		.primaryKey()
		.generatedByDefaultAsIdentity({
			name: "categories_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 2147483647,
			cache: 1,
		}),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	isActive: boolean("is_active").default(false).notNull(),
});

export const users = pgTable(
	"users",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "users_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		role: userRole().notNull(),
		name: varchar({ length: 255 }).notNull(),
		username: varchar({ length: 255 }).notNull(),
		password: varchar({ length: 255 }).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at", { mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [unique("users_username_unique").on(table.username)],
);

export const orders = pgTable(
	"orders",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "orders_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		code: varchar({ length: 12 }).notNull(),
		paymentStatus: orderPaymentStatus("payment_status")
			.default("unpaid")
			.notNull(),
		discount: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
		createdAt: timestamp("created_at", { mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "string" })
			.defaultNow()
			.notNull(),
		createdBy: integer("created_by").notNull(),
		updatedBy: integer("updated_by").notNull(),
		storeId: integer("store_id").notNull(),
		customerId: integer("customer_id").notNull(),
		paymentMethodId: integer("payment_method_id"),
		total: numeric({ precision: 12, scale: 2 }).default("0"),
	},
	(table) => [
		uniqueIndex("order_code_idx").using(
			"btree",
			table.code.asc().nullsLast().op("text_ops"),
		),
		index("order_customer_idx").using(
			"btree",
			table.customerId.asc().nullsLast().op("int4_ops"),
		),
		index("order_payment_status_idx").using(
			"btree",
			table.paymentStatus.asc().nullsLast().op("enum_ops"),
		),
		index("order_store_idx").using(
			"btree",
			table.storeId.asc().nullsLast().op("int4_ops"),
		),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "orders_created_by_users_id_fk",
		}),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "orders_updated_by_users_id_fk",
		}),
		foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "orders_store_id_stores_id_fk",
		}),
		foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "orders_customer_id_customers_id_fk",
		}),
		foreignKey({
			columns: [table.paymentMethodId],
			foreignColumns: [paymentMethods.id],
			name: "orders_payment_method_id_payment_methods_id_fk",
		}),
		unique("orders_code_unique").on(table.code),
		check("total_non_negative_check", sql`total >= (0)::numeric`),
		check("discount_non_negative_check", sql`discount >= (0)::numeric`),
		check("discount_valid_check", sql`total >= discount`),
	],
);

export const stores = pgTable(
	"stores",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "stores_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: varchar({ length: 255 }).notNull(),
		code: varchar({ length: 3 }).notNull(),
		phoneNumber: varchar("phone_number", { length: 16 }).notNull(),
		address: varchar({ length: 255 }).notNull(),
		latitude: numeric({ precision: 11, scale: 8 }).notNull(),
		longitude: numeric({ precision: 11, scale: 8 }).notNull(),
		isActive: boolean("is_active").default(false).notNull(),
		createdAt: timestamp("created_at", { mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("stores_code_unique").on(table.code),
		unique("stores_phone_number_unique").on(table.phoneNumber),
		check("code_len_check", sql`length(TRIM(BOTH FROM code)) = 3`),
	],
);

export const services = pgTable(
	"services",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "services_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: varchar({ length: 255 }).notNull(),
		code: varchar({ length: 4 }).notNull(),
		description: text(),
		isActive: boolean("is_active").default(false).notNull(),
		categoryId: integer("category_id").notNull(),
	},
	(table) => [
		index("service_code_idx").using(
			"btree",
			table.code.asc().nullsLast().op("text_ops"),
		),
		index("service_name_idx").using(
			"btree",
			table.name.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "services_category_id_categories_id_fk",
		}),
		unique("services_code_unique").on(table.code),
		check(
			"code_len_check",
			sql`(length(TRIM(BOTH FROM code)) >= 1) AND (length(TRIM(BOTH FROM code)) <= 4)`,
		),
	],
);

export const ordersServices = pgTable(
	"orders_services",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "orders_services_table_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		orderId: integer("order_id"),
		serviceId: integer("service_id"),
		qty: integer().default(1).notNull(),
		price: numeric({ precision: 12, scale: 2 }).default("0"),
		discount: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
		subtotal: numeric({ precision: 12, scale: 2 }).generatedAlwaysAs(
			sql`((price * (qty)::numeric) - discount)`,
		),
		notes: text(),
	},
	(table) => [
		index("order_services_order_idx").using(
			"btree",
			table.orderId.asc().nullsLast().op("int4_ops"),
		),
		index("order_services_order_service_idx").using(
			"btree",
			table.orderId.asc().nullsLast().op("int4_ops"),
			table.serviceId.asc().nullsLast().op("int4_ops"),
		),
		index("order_services_service_idx").using(
			"btree",
			table.serviceId.asc().nullsLast().op("int4_ops"),
		),
		foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "orders_services_table_order_id_orders_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "orders_services_table_service_id_services_id_fk",
		}).onDelete("cascade"),
		check("price_non_negative_check", sql`price >= (0)::numeric`),
		check("qty_positive_check", sql`qty > 0`),
		check("discount_valid_check", sql`(price * (qty)::numeric) >= discount`),
	],
);

export const storeServicePrices = pgTable(
	"store_service_prices",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "store_service_prices_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		price: integer().notNull(),
		storeId: integer("store_id"),
		serviceId: integer("service_id"),
	},
	(table) => [
		uniqueIndex("store_service_idx").using(
			"btree",
			table.storeId.asc().nullsLast().op("int4_ops"),
			table.serviceId.asc().nullsLast().op("int4_ops"),
		),
		foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "store_service_prices_store_id_stores_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "store_service_prices_service_id_services_id_fk",
		}).onDelete("cascade"),
		check("price_non_negative_check", sql`price >= 0`),
	],
);

export const ordersProducts = pgTable(
	"orders_products",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "orders_products_table_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		orderId: integer("order_id"),
		productId: integer("product_id"),
		qty: integer().default(1).notNull(),
		price: numeric({ precision: 12, scale: 2 }).default("0"),
		discount: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
		subtotal: numeric({ precision: 12, scale: 2 }).generatedAlwaysAs(
			sql`((price * (qty)::numeric) - discount)`,
		),
		notes: text(),
	},
	(table) => [
		index("order_products_order_idx").using(
			"btree",
			table.orderId.asc().nullsLast().op("int4_ops"),
		),
		index("order_products_order_product_idx").using(
			"btree",
			table.orderId.asc().nullsLast().op("int4_ops"),
			table.productId.asc().nullsLast().op("int4_ops"),
		),
		index("order_products_product_idx").using(
			"btree",
			table.productId.asc().nullsLast().op("int4_ops"),
		),
		foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "orders_products_table_order_id_orders_id_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "orders_products_table_product_id_products_id_fk",
		}).onDelete("cascade"),
		check("price_non_negative_check", sql`price >= (0)::numeric`),
		check("qty_positive_check", sql`qty > 0`),
		check("discount_valid_check", sql`(price * (qty)::numeric) >= discount`),
	],
);

export const products = pgTable(
	"products",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "products_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: varchar({ length: 255 }).notNull(),
		categoryId: integer("category_id").notNull(),
		sku: varchar({ length: 255 }).notNull(),
		stock: integer().default(0).notNull(),
		uom: varchar({ length: 12 }).default("pcs").notNull(),
		description: text(),
		isActive: boolean("is_active").default(false).notNull(),
	},
	(table) => [
		index("product_name_idx").using(
			"btree",
			table.name.asc().nullsLast().op("text_ops"),
		),
		foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "products_category_id_categories_id_fk",
		}),
		unique("products_sku_unique").on(table.sku),
		check("stock_non_negative_check", sql`stock >= 0`),
	],
);

export const paymentMethods = pgTable(
	"payment_methods",
	{
		id: integer()
			.primaryKey()
			.generatedAlwaysAsIdentity({
				name: "payment_methods_id_seq",
				startWith: 1,
				increment: 1,
				minValue: 1,
				maxValue: 2147483647,
				cache: 1,
			}),
		name: varchar({ length: 255 }).notNull(),
		code: varchar({ length: 6 }).notNull(),
		isActive: boolean("is_active").default(false).notNull(),
		createdAt: timestamp("created_at", { mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [unique("payment_methods_code_unique").on(table.code)],
);
