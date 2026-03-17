import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import authRoutes from "./routes/authRoutes";
import walkInRoutes from "./routes/walkInRoutes";

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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Security layers active`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
