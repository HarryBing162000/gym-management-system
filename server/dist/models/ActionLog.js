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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const ActionLogSchema = new mongoose_1.Schema({
    action: {
        type: String,
        enum: [
            "member_created",
            "member_updated",
            "member_deleted",
            "check_in",
            "check_out",
            "walk_in_created",
            "walk_in_checkout",
            "payment_created",
            "settings_updated",
            "login",
            "logout",
        ],
        required: true,
    },
    performedBy: {
        userId: { type: String, required: true },
        name: { type: String, required: true },
        role: { type: String, enum: ["owner", "staff"], required: true },
    },
    targetId: { type: String },
    targetName: { type: String },
    detail: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
});
ActionLogSchema.index({ timestamp: -1 });
ActionLogSchema.index({ "performedBy.userId": 1, timestamp: -1 });
exports.default = mongoose_1.default.model("ActionLog", ActionLogSchema);
