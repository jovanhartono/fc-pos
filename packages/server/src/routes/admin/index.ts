import { Hono } from "hono";
import campaignsRoutes from "@/routes/admin/campaigns";
import categoriesRoutes from "@/routes/admin/categories";
import customerRoutes from "@/routes/admin/customer";
import dashboardRoutes from "@/routes/admin/dashboard";
import orderServiceImagesRoutes from "@/routes/admin/order-service-images";
import ordersRoutes from "@/routes/admin/orders";
import paymentMethodsRoutes from "@/routes/admin/payment-methods";
import productsRoutes from "@/routes/admin/products";
import reportsRoutes from "@/routes/admin/reports";
import servicesRoutes from "@/routes/admin/services";
import shiftsRoutes from "@/routes/admin/shifts";
import storeRoutes from "@/routes/admin/stores";
import usersRoutes from "@/routes/admin/users";

const app = new Hono()
  .route("/stores", storeRoutes)
  .route("/customers", customerRoutes)
  .route("/users", usersRoutes)
  .route("/services", servicesRoutes)
  .route("/products", productsRoutes)
  .route("/categories", categoriesRoutes)
  .route("/campaigns", campaignsRoutes)
  .route("/payment-methods", paymentMethodsRoutes)
  .route("/orders", ordersRoutes)
  .route("/order-service-images", orderServiceImagesRoutes)
  .route("/shifts", shiftsRoutes)
  .route("/reports", reportsRoutes)
  .route("/dashboard", dashboardRoutes);

export default app;
