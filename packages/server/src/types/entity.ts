import type { InferSelectModel } from "drizzle-orm";
import type {
  customersTable,
  itemsTable,
  ordersServicesTable,
  productsTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";

export type User = InferSelectModel<typeof usersTable>;
export type Store = InferSelectModel<typeof storesTable>;
export type Product = InferSelectModel<typeof productsTable>;
export type Service = InferSelectModel<typeof servicesTable>;
export type Customer = InferSelectModel<typeof customersTable>;
export type Item = InferSelectModel<typeof itemsTable>;
export type OrderService = InferSelectModel<typeof ordersServicesTable>;
