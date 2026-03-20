"use strict";
/**
 * Payment.ts
 * IronCore GMS — Payment Model
 *
 * Tracks all membership payments:
 *   - Auto-created on new member registration
 *   - Auto-created on member plan renewal
 *   - Manual payments logged by staff or owner
 *
 * Collection: "payments"
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
const PaymentSchema = new mongoose_1.Schema({
    gymId: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    memberName: {
        type: String,
        required: true,
        trim: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    method: {
        type: String,
        enum: ["cash", "online"],
        required: true,
    },
    type: {
        type: String,
        enum: ["new_member", "renewal", "manual", "balance_settlement"],
        required: true,
    },
    plan: {
        type: String,
        enum: ["Monthly", "Quarterly", "Annual", "Student"],
        required: true,
    },
    amountPaid: {
        type: Number,
        required: true,
        min: 0,
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
    },
    isPartial: {
        type: Boolean,
        default: false,
    },
    notes: {
        type: String,
        trim: true,
    },
    processedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, {
    timestamps: true,
    collection: "payments",
});
// Indexes for common queries
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ gymId: 1, createdAt: -1 });
PaymentSchema.index({ method: 1, createdAt: -1 });
PaymentSchema.index({ type: 1, createdAt: -1 });
exports.default = mongoose_1.default.models.Payment ||
    mongoose_1.default.model("Payment", PaymentSchema);
