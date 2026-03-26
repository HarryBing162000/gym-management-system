"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ⚠️ MUST be first — loads .env before any other module reads process.env
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = __importDefault(require("./config/db"));
const Settings_1 = __importStar(require("./models/Settings"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const walkInRoutes_1 = __importDefault(require("./routes/walkInRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const kioskRoutes_1 = __importDefault(require("./routes/kioskRoutes"));
const memberRoutes_1 = __importDefault(require("./routes/memberRoutes"));
const actionLogRoutes_1 = __importDefault(require("./routes/actionLogRoutes"));
// Security middleware
const security_1 = require("./middleware/security");
const errorHandler_1 = require("./middleware/errorHandler");
const security_2 = require("./config/security");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Trust reverse proxy (Render, Railway, Nginx, Cloudflare)
app.set("trust proxy", 1);
// ============================================================
// SECURITY LAYERS — ORDER MATTERS ⚠️
// ============================================================
app.use(security_1.helmetMiddleware);
app.use((0, cors_1.default)(security_1.corsOptions));
app.use(express_1.default.json({ limit: security_2.SECURITY_CONFIG.MAX_BODY_SIZE }));
app.use(express_1.default.urlencoded({ extended: true, limit: security_2.SECURITY_CONFIG.MAX_BODY_SIZE }));
app.use(security_1.mongoSanitizeMiddleware);
app.use(security_1.hppMiddleware);
app.use(security_1.sanitizeInput);
app.use("/api", security_1.generalRateLimiter);
app.use(security_1.securityLogger);
// ============================================================
// ROUTES
// ============================================================
app.use("/api/auth", authRoutes_1.default);
app.use("/api/walkin", walkInRoutes_1.default);
app.use("/api/payments", paymentRoutes_1.default);
app.use("/api/kiosk", kioskRoutes_1.default);
app.use("/api/members", memberRoutes_1.default);
app.use("/api/action-logs", actionLogRoutes_1.default);
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
    const existingSettings = await Settings_1.default.findOne({});
    if (!existingSettings) {
        await Settings_1.default.create({
            gymName: process.env.GYM_NAME || "Gym",
            gymAddress: process.env.GYM_ADDRESS || "Cebu City, Philippines",
            plans: Settings_1.DEFAULT_PLANS,
            walkInPrices: Settings_1.DEFAULT_WALKIN_PRICES,
        });
        console.log("⚙️  Settings initialized with defaults");
    }
    else {
        let migrated = false;
        if (!existingSettings.plans || existingSettings.plans.length === 0) {
            existingSettings.plans = Settings_1.DEFAULT_PLANS;
            migrated = true;
        }
        if (!existingSettings.walkInPrices ||
            !existingSettings.walkInPrices.regular) {
            existingSettings.walkInPrices = Settings_1.DEFAULT_WALKIN_PRICES;
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
