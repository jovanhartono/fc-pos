import "@/utils/date";
import app from "@/app";
import { adminMiddleware } from "@/middlewares/admin";
import { isMockGatewayEnabled } from "@/modules/payments/gateways/mock";
import adminRoutes from "@/routes/admin";
import authRoutes from "@/routes/auth";
import healthRoutes from "@/routes/health";
import internalRoutes from "@/routes/internal";
import mockGatewayRoutes from "@/routes/mock-gateway";
import publicRoutes from "@/routes/public";
import webhookRoutes from "@/routes/webhooks";
import { errorHandler } from "@/utils/error-handler";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

app.use("/admin/*", adminMiddleware);

// Outside the typed router on purpose: the dashboard never calls it.
if (isMockGatewayEnabled()) {
  app.route("/mock-gateway", mockGatewayRoutes);
}

const router = app
  .route("/auth", authRoutes)
  .route("/admin", adminRoutes)
  .route("/public", publicRoutes)
  .route("/internal", internalRoutes)
  .route("/webhooks", webhookRoutes)
  .route("/health", healthRoutes);

router.onError(errorHandler);

export type AppType = typeof router;
export default {
  fetch: router.fetch,
  port: process.env.PORT ?? "8000",
};
