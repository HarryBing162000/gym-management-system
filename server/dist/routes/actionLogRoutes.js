"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ActionLog_1 = __importDefault(require("../models/ActionLog"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const logAction_1 = require("../utils/logAction");
const router = (0, express_1.Router)();
// Helper — convert a YYYY-MM-DD date string to Manila start/end of day in UTC
const toManilaStart = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    // Manila is UTC+8, so midnight Manila = 16:00 UTC previous day
    return new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
};
const toManilaEnd = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    // End of Manila day = 15:59:59.999 UTC
    return new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
};
// GET /api/action-logs
// Owner → all logs with full filtering | Staff → only their own
router.get("/", authMiddleware_1.protect, async (req, res) => {
    try {
        const { role, id: userId } = req.user;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const skip = (page - 1) * limit;
        const action = req.query.action;
        const from = req.query.from;
        const to = req.query.to;
        const byRole = req.query.role;
        const byStaffId = req.query.staffId;
        const filter = {};
        // Staff can only ever see their own logs — enforced server-side
        if (role === "staff") {
            filter["performedBy.userId"] = userId;
        }
        else {
            if (byRole)
                filter["performedBy.role"] = byRole;
            if (byStaffId)
                filter["performedBy.userId"] = byStaffId;
        }
        if (action)
            filter.action = action;
        // Use Manila timezone-aware date boundaries
        if (from || to) {
            const tsFilter = {};
            if (from)
                tsFilter["$gte"] = toManilaStart(from);
            if (to)
                tsFilter["$lte"] = toManilaEnd(to);
            filter.timestamp = tsFilter;
        }
        const [logs, total] = await Promise.all([
            ActionLog_1.default.find(filter)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ActionLog_1.default.countDocuments(filter),
        ]);
        res.json({ logs, total, page, limit });
    }
    catch (err) {
        res.status(500).json({ message: "Failed to fetch action logs" });
    }
});
// POST /api/action-logs/logout
// Called by the frontend BEFORE the token is cleared
router.post("/logout", authMiddleware_1.protect, async (req, res) => {
    try {
        await (0, logAction_1.logAction)({
            action: "logout",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            detail: `${req.user.name} (${req.user.role}) logged out`,
        });
        res.json({ success: true });
    }
    catch (err) {
        res.json({ success: false });
    }
});
exports.default = router;
