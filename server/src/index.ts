// ⚠️ MUST be first — loads .env before any other module reads process.env
import "./config/env";
import superAdminRoutes from "./routes/superAdminRoutes";
import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import authRoutes from "./routes/authRoutes";
import walkInRoutes from "./routes/walkInRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import kioskRoutes from "./routes/kioskRoutes";
import memberRoutes from "./routes/memberRoutes";
import actionLogsRouter from "./routes/actionLogRoutes";
import { initAutoCheckoutCron } from "./utils/autoCheckout";
// Security middleware
import {
  helmetMiddleware,
  generalRateLimiter,
  mongoSanitizeMiddleware,
  hppMiddleware,
  corsOptions,
  sanitizeInput,
  securityLogger,
} from "./middleware/security";
import { globalErrorHandler, notFound } from "./middleware/errorHandler";
import { SECURITY_CONFIG } from "./config/security";

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Render, Railway, Nginx, Cloudflare)
app.set("trust proxy", 1);

// ============================================================
// SECURITY LAYERS — ORDER MATTERS ⚠️
// ============================================================
app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(express.json({ limit: SECURITY_CONFIG.MAX_BODY_SIZE }));
app.use(
  express.urlencoded({ extended: true, limit: SECURITY_CONFIG.MAX_BODY_SIZE }),
);
app.use(mongoSanitizeMiddleware);
app.use(hppMiddleware);
app.use(sanitizeInput);
app.use("/api", generalRateLimiter);
app.use(securityLogger);

// ============================================================
// ROUTES
// ============================================================
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/walkin", walkInRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/kiosk", kioskRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/action-logs", actionLogsRouter);
app.get("/api/health", (_req, res) => {
  res.json({ status: "Server is running ✅" });
});

// ============================================================
// ERROR HANDLING — Must be LAST
// ============================================================
app.use(notFound);
app.use(globalErrorHandler);

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, async () => {
  await connectDB();

  // ── Settings are now per-gym, created by Super Admin on gym onboarding ──
  // The old singleton Settings.create() block has been removed.
  // Each gym gets its own Settings document with ownerId when Super Admin
  // creates the gym. No global default Settings document is needed.

  // ── Auto walk-out cron — runs daily at each gym's closing time ────────────
  await initAutoCheckoutCron();

  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Security layers active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
