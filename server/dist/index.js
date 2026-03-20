"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ⚠️ MUST be first — loads .env before any other module reads process.env
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = __importDefault(require("./config/db"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const walkInRoutes_1 = __importDefault(require("./routes/walkInRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const kioskRoutes_1 = __importDefault(require("./routes/kioskRoutes"));
const memberRoutes_1 = __importDefault(require("./routes/memberRoutes"));
// Security middleware
const security_1 = require("./middleware/security");
const errorHandler_1 = require("./middleware/errorHandler");
const security_2 = require("./config/security");
const app = (0, express_1.default)();
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
app.use(security_1.helmetMiddleware);
// 2. CORS — only whitelisted origins
app.use((0, cors_1.default)(security_1.corsOptions));
// 3. Limit body size — prevent 100MB JSON bombs
app.use(express_1.default.json({ limit: security_2.SECURITY_CONFIG.MAX_BODY_SIZE }));
app.use(express_1.default.urlencoded({ extended: true, limit: security_2.SECURITY_CONFIG.MAX_BODY_SIZE }));
// 4. Strip NoSQL injection operators
app.use(security_1.mongoSanitizeMiddleware);
// 5. Prevent HTTP parameter pollution
app.use(security_1.hppMiddleware);
// 6. Strip XSS from inputs
app.use(security_1.sanitizeInput);
// 7. General rate limiter on all routes
app.use("/api", security_1.generalRateLimiter);
// 8. Security logger
app.use(security_1.securityLogger);
// ============================================================
// ROUTES
// ============================================================
app.use("/api/auth", authRoutes_1.default);
app.use("/api/walkin", walkInRoutes_1.default);
app.use("/api/payments", paymentRoutes_1.default);
app.use("/api/kiosk", kioskRoutes_1.default);
app.use("/api/members", memberRoutes_1.default); // member management — JWT protected // public kiosk terminal — machine-auth only
app.get("/api/health", (_req, res) => {
    res.json({ status: "Server is running ✅" });
});
// ============================================================
// ERROR HANDLING — Must be LAST
// ============================================================
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.globalErrorHandler);
// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, async () => {
    await (0, db_1.default)();
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔐 Security layers active`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
