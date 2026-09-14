import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { JWTPayload } from "@/types";
import type { AdminEnv } from "@/types/hono";
import { errorHandler } from "@/utils/error-handler";

mock.module("@/modules/services/service.service", () => ({
  createService: () => Promise.resolve({ id: 1, code: "AB" }),
  getServiceById: () => Promise.resolve({ id: 1, code: "AB" }),
  getServices: () => Promise.resolve([]),
  updateService: () => Promise.resolve({ id: 1, code: "AB" }),
}));

mock.module("@/modules/products/product.service", () => ({
  createProduct: () => Promise.resolve({ id: 1, sku: "SKU1" }),
  getProductById: () => Promise.resolve({ id: 1, sku: "SKU1" }),
  getProducts: () => Promise.resolve([]),
  updateProduct: () => Promise.resolve({ id: 1, sku: "SKU1" }),
}));

mock.module("@/modules/categories/category.service", () => ({
  createCategory: () => Promise.resolve({ id: 1, name: "Footwear" }),
  getCategoryById: () => Promise.resolve({ id: 1, name: "Footwear" }),
  getCategories: () => Promise.resolve([]),
  updateCategory: () => Promise.resolve({ id: 1, name: "Footwear" }),
}));

mock.module("@/modules/payment-methods/payment-method.service", () => ({
  createPaymentMethod: () => Promise.resolve({ id: 1, name: "Cash" }),
  getPaymentMethodById: () => Promise.resolve({ id: 1, name: "Cash" }),
  getPaymentMethods: () => Promise.resolve([]),
  updatePaymentMethod: () => Promise.resolve({ id: 1, name: "Cash" }),
}));

const servicesRoutes = (await import("@/routes/admin/services")).default;
const productsRoutes = (await import("@/routes/admin/products")).default;
const categoriesRoutes = (await import("@/routes/admin/categories")).default;
const paymentMethodsRoutes = (await import("@/routes/admin/payment-methods"))
  .default;

const cashier: JWTPayload = {
  id: 1,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

const admin: JWTPayload = {
  id: 2,
  name: "Bu Admin",
  username: "admin",
  role: "admin",
  can_process_pickup: false,
};

// Every catalog table (Service, Product, Category, Payment method) is edited
// from the same admin settings screen, so the write gate is one rule tested
// once per table rather than four bespoke suites.
const CATALOG_ROUTERS = [
  {
    name: "services",
    routes: servicesRoutes,
    postBody: {
      category_id: 1,
      code: "AB",
      cogs: "10000",
      price: "20000",
      name: "Deep clean",
      is_active: true,
    },
  },
  {
    name: "products",
    routes: productsRoutes,
    postBody: {
      name: "Suede protector",
      sku: "SKU1",
      uom: "pcs",
      stock: 10,
      category_id: 1,
      cogs: "10000",
      price: "20000",
      is_active: true,
    },
  },
  {
    name: "categories",
    routes: categoriesRoutes,
    postBody: { name: "Footwear", is_active: true },
  },
  {
    name: "payment-methods",
    routes: paymentMethodsRoutes,
    postBody: { name: "Cash", code: "CASH", is_active: true },
  },
];

const appFor = (routes: Hono<AdminEnv>, user: JWTPayload) => {
  const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
    .use("*", async (c, next) => {
      c.set("jwtPayload", user);
      await next();
    })
    .route("/catalog", routes);

  app.onError(errorHandler);
  return app;
};

const postJson = (routes: Hono<AdminEnv>, user: JWTPayload, body: unknown) =>
  appFor(routes, user).request("/catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const putJson = (routes: Hono<AdminEnv>, user: JWTPayload, body: unknown) =>
  appFor(routes, user).request("/catalog/1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const getList = (routes: Hono<AdminEnv>, user: JWTPayload) =>
  appFor(routes, user).request("/catalog");

describe.each(CATALOG_ROUTERS)(
  "admin-only catalog writes — $name",
  ({ routes, postBody }) => {
    it("refuses a cashier's create", async () => {
      const res = await postJson(routes, cashier, postBody);
      expect(res.status).toBe(403);
    });

    it("lets an admin create", async () => {
      const res = await postJson(routes, admin, postBody);
      expect(res.status).toBe(201);
    });

    it("refuses a cashier's edit", async () => {
      const res = await putJson(routes, cashier, {});
      expect(res.status).toBe(403);
    });

    it("lets an admin edit", async () => {
      const res = await putJson(routes, admin, {});
      expect(res.status).toBe(200);
    });

    it("still lists for a cashier", async () => {
      const res = await getList(routes, cashier);
      expect(res.status).toBe(200);
    });
  }
);
