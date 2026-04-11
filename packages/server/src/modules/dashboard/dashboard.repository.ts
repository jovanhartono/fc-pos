import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function getEntityCounts() {
  const result = await db.execute<{
    customers: number;
    users: number;
    stores: number;
    categories: number;
    services: number;
    products: number;
    payment_methods: number;
    orders: number;
    campaigns: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM customers) AS customers,
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM stores) AS stores,
      (SELECT COUNT(*)::int FROM categories) AS categories,
      (SELECT COUNT(*)::int FROM services) AS services,
      (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COUNT(*)::int FROM payment_methods) AS payment_methods,
      (SELECT COUNT(*)::int FROM orders) AS orders,
      (SELECT COUNT(*)::int FROM campaigns) AS campaigns
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to fetch dashboard counts");
  }

  return {
    customers: Number(row.customers),
    users: Number(row.users),
    stores: Number(row.stores),
    categories: Number(row.categories),
    services: Number(row.services),
    products: Number(row.products),
    paymentMethods: Number(row.payment_methods),
    orders: Number(row.orders),
    campaigns: Number(row.campaigns),
  };
}
