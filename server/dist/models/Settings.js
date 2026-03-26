"use strict";
/**
 * Settings.ts
 * IronCore GMS — Gym Settings Model
 *
 * Stores gym-level configuration that the owner can update at runtime.
 * Uses a singleton pattern — only one settings document ever exists.
 *
 * The plans array is the SINGLE SOURCE OF TRUTH for membership pricing.
 * All frontend pages and backend logic read from here — no hardcoded prices.
 *
 * Collection: "settings"
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_WALKIN_PRICES = exports.DEFAULT_PLANS = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PlanSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: [true, "Plan name is required"],
        trim: true,
        maxlength: [30, "Plan name too long"],
    },
    price: {
        type: Number,
        required: [true, "Price is required"],
        min: [0, "Price cannot be negative"],
    },
    durationMonths: {
        type: Number,
        required: [true, "Duration is required"],
        min: [1, "Duration must be at least 1 month"],
        max: [24, "Duration cannot exceed 24 months"],
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isDefault: {
        type: Boolean,
        default: false,
    },
}, { _id: true });
const SettingsSchema = new mongoose_1.Schema({
    gymName: {
        type: String,
        required: [true, "Gym name is required"],
        trim: true,
        maxlength: [100, "Gym name too long"],
    },
    gymAddress: {
        type: String,
        required: [true, "Gym address is required"],
        trim: true,
        maxlength: [200, "Address too long"],
    },
    logoUrl: {
        type: String,
        default: null,
    },
    logoPublicId: {
        type: String,
        default: null,
    },
    plans: {
        type: [PlanSchema],
        default: [],
    },
    walkInPrices: {
        regular: { type: Number, default: 150, min: 0 },
        student: { type: Number, default: 100, min: 0 },
        couple: { type: Number, default: 250, min: 0 },
    },
}, { timestamps: true });
// ── Default plans — seeded on first boot ──────────────────────────────────────
exports.DEFAULT_PLANS = [
    {
        name: "Monthly",
        price: 800,
        durationMonths: 1,
        isActive: true,
        isDefault: true,
    },
    {
        name: "Quarterly",
        price: 2100,
        durationMonths: 3,
        isActive: true,
        isDefault: true,
    },
    {
        name: "Annual",
        price: 7500,
        durationMonths: 12,
        isActive: true,
        isDefault: true,
    },
    {
        name: "Student",
        price: 500,
        durationMonths: 1,
        isActive: true,
        isDefault: true,
    },
];
exports.DEFAULT_WALKIN_PRICES = {
    regular: 150,
    student: 100,
    couple: 250,
};
exports.default = mongoose_1.default.models.Settings ||
    mongoose_1.default.model("Settings", SettingsSchema);
