// ⚠️ MUST be first — loads .env before any other module reads process.env
import "./config/env";

import express from "express";
import cors from "cors";
import connectDB from "./config/db";
import Settings, { DEFAULT_PLANS } from "./models/Settings";
import authRoutes from "./routes/authRoutes";
import walkInRoutes from "./routes/walkInRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import kioskRoutes from "./routes/kioskRoutes";
import memberRoutes from "./routes/memberRoutes";

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
// Without this, all requests appear to come from the proxy IP
// and everyone shares one rate limit bucket
app.set("trust proxy", 1);

// ============================================================
// SECURITY LAYERS — ORDER MATTERS ⚠️
// Apply security before routes so every request is filtered
// ============================================================

// 1. Secure HTTP headers
app.use(helmetMiddleware);

// 2. CORS — only whitelisted origins
app.use(cors(corsOptions));

// 3. Limit body size — prevent 100MB JSON bombs
app.use(express.json({ limit: SECURITY_CONFIG.MAX_BODY_SIZE }));
app.use(
  express.urlencoded({ extended: true, limit: SECURITY_CONFIG.MAX_BODY_SIZE }),
);

// 4. Strip NoSQL injection operators
app.use(mongoSanitizeMiddleware);

// 5. Prevent HTTP parameter pollution
app.use(hppMiddleware);

// 6. Strip XSS from inputs
app.use(sanitizeInput);

// 7. General rate limiter on all routes
app.use("/api", generalRateLimiter);

// 8. Security logger
app.use(securityLogger);

// ============================================================
// ROUTES
// ============================================================
app.use("/api/auth", authRoutes);
app.use("/api/walkin", walkInRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/kiosk", kioskRoutes);
app.use("/api/members", memberRoutes); // member management — JWT protected // public kiosk terminal — machine-auth only

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

  // ── Ensure Settings document exists with defaults ──────────────────────────
  const existingSettings = await Settings.findOne({});
  if (!existingSettings) {
    await Settings.create({
      gymName: process.env.GYM_NAME || "IronCore Gym",
      gymAddress: process.env.GYM_ADDRESS || "Cebu City, Philippines",
      plans: DEFAULT_PLANS,
    });
    console.log("⚙️  Settings initialized with defaults (including plans)");
  } else if (!existingSettings.plans || existingSettings.plans.length === 0) {
    // Migrate existing settings — add default plans if missing
    existingSettings.plans = DEFAULT_PLANS as any;
    await existingSettings.save();
    console.log("⚙️  Default plans added to existing settings");
  }

  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Security layers active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
