import "@/utils/date";
import app from "@/app";
import { adminMiddleware } from "@/middlewares/admin";
import adminRoutes from "@/routes/admin";
import authRoutes from "@/routes/auth";
import internalRoutes from "@/routes/internal";
import publicRoutes from "@/routes/public";
import { errorHandler } from "@/utils/error-handler";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

app.use("/admin/*", adminMiddleware);

const router = app
  .route("/auth", authRoutes)
  .route("/admin", adminRoutes)
  .route("/public", publicRoutes)
  .route("/internal", internalRoutes);

router.onError(errorHandler);

export type AppType = typeof router;
export default {
  fetch: router.fetch,
  port: process.env.PORT ?? "8000",
};
