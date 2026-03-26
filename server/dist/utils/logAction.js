"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
const ActionLog_1 = __importDefault(require("../models/ActionLog"));
async function logAction(params) {
    try {
        await ActionLog_1.default.create(params);
    }
    catch (err) {
        // Never let a logging failure crash the actual route
        console.error("[logAction] Failed to write action log:", err);
    }
}
