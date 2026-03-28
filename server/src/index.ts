// ⚠️ MUST be first — loads .env before any other module reads process.env
import "./config/env";
import superAdminRoutes from "./routes/superAdminRoutes";
import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import Settings, {
  DEFAULT_PLANS,
  DEFAULT_WALKIN_PRICES,
} from "./models/Settings";
import authRoutes from "./routes/authRoutes";
import walkInRoutes from "./routes/walkInRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import kioskRoutes from "./routes/kioskRoutes";
import memberRoutes from "./routes/memberRoutes";
import actionLogsRouter from "./routes/actionLogRoutes";

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

  const existingSettings = await Settings.findOne({});
  if (!existingSettings) {
    await Settings.create({
      gymName: process.env.GYM_NAME || "Gym",
      gymAddress: process.env.GYM_ADDRESS || "Cebu City, Philippines",
      plans: DEFAULT_PLANS,
      walkInPrices: DEFAULT_WALKIN_PRICES,
    });
    console.log("⚙️  Settings initialized with defaults");
  } else {
    let migrated = false;
    if (!existingSettings.plans || existingSettings.plans.length === 0) {
      existingSettings.plans = DEFAULT_PLANS as any;
      migrated = true;
    }
    if (
      !existingSettings.walkInPrices ||
      !existingSettings.walkInPrices.regular
    ) {
      existingSettings.walkInPrices = DEFAULT_WALKIN_PRICES;
      migrated = true;
    }
    if (migrated) {
      await existingSettings.save();
      console.log("⚙️  Settings migrated with missing defaults");
    }
  }

  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Security layers active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
