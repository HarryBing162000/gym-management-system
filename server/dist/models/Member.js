"use strict";
/**
 * Member.ts
 * IronCore GMS — Gym Member Model
 *
 * Separate from the User model (which handles owner/staff auth).
 * Members are gym clients — they have membership data, not login accounts.
 *
 * Collection: "members"
 * Identifier: gymId (e.g. "GYM-1001") — never expose MongoDB _id publicly
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
const mongoose_1 = __importStar(require("mongoose"));
const MemberSchema = new mongoose_1.Schema({
    gymId: {
        type: String,
        required: [true, "GYM-ID is required"],
        unique: true,
        trim: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true,
        index: true, // indexed for fast name search
    },
    email: {
        type: String,
        unique: true,
        sparse: true, // allows multiple documents with no email
        lowercase: true,
        trim: true,
    },
    phone: {
        type: String,
        unique: true,
        sparse: true, // allows multiple documents with no phone
        trim: true,
    },
    plan: {
        type: String,
        required: [true, "Plan is required"],
        trim: true,
    },
    status: {
        type: String,
        enum: ["active", "inactive", "expired"],
        default: "active",
    },
    expiresAt: {
        type: Date,
        required: [true, "Expiry date is required"],
    },
    checkedIn: {
        type: Boolean,
        default: false,
    },
    lastCheckIn: {
        type: Date,
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
    },
    photoUrl: {
        type: String,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true, // auto createdAt + updatedAt
    collection: "members", // explicit collection name
});
// ── Indexes ────────────────────────────────────────────────────────────────────
// Compound text index for search by name or email
MemberSchema.index({ name: "text", email: "text" });
// Index for expiry queries (at-risk members, expired reports)
MemberSchema.index({ expiresAt: 1, status: 1 });
// Index for check-in status queries
MemberSchema.index({ checkedIn: 1, isActive: 1 });
exports.default = mongoose_1.default.models.Member ||
    mongoose_1.default.model("Member", MemberSchema);
