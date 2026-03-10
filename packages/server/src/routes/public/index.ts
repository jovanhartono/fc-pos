import { Hono } from "hono";
import publicOrdersRoutes from "@/routes/public/orders";

const app = new Hono().route("/orders", publicOrdersRoutes);

export default app;
