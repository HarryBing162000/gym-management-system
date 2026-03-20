"use strict";
/**
 * paymentController.ts
 * IronCore GMS — Payment Route Handlers
 *
 * Supports partial payments — member gets access but balance is tracked.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoLogPayment = exports.settleBalance = exports.createPayment = exports.getPaymentSummary = exports.getPayments = void 0;
const Payment_1 = __importDefault(require("../models/Payment"));
const Member_1 = __importDefault(require("../models/Member"));
const PLAN_PRICES = {
    Monthly: 800,
    Quarterly: 2100,
    Annual: 7500,
    Student: 500,
};
const getDateRange = (range) => {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
    const now = new Date();
    const manilaToday = fmt.format(now);
    const [y, m, d] = manilaToday.split("-").map(Number);
    // Manila midnight = UTC 16:00 previous day (UTC+8 means midnight Manila = 16:00 UTC)
    const manilaStartOfDay = new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
    const manilaEndOfDay = new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
    if (range === "today") {
        return { from: manilaStartOfDay, to: manilaEndOfDay };
    }
    if (range === "week") {
        const dow = now.toLocaleDateString("en-PH", {
            timeZone: "Asia/Manila",
            weekday: "short",
        });
        const dayOffset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dow);
        const from = new Date(Date.UTC(y, m - 1, d - dayOffset, -8, 0, 0, 0));
        return { from, to: manilaEndOfDay };
    }
    if (range === "month") {
        const from = new Date(Date.UTC(y, m - 1, 1, -8, 0, 0, 0));
        return { from, to: manilaEndOfDay };
    }
    const from = new Date(Date.UTC(y, m - 1, d - 30, -8, 0, 0, 0));
    return { from, to: manilaEndOfDay };
};
const buildSummary = (payments) => {
    // Fall back to amount for older records that predate amountPaid field
    const paid = (p) => p.amountPaid ?? p.amount ?? 0;
    return {
        total: payments.length,
        revenue: payments.reduce((s, p) => s + paid(p), 0),
        cash: payments.filter((p) => p.method === "cash").length,
        online: payments.filter((p) => p.method === "online").length,
        cashRev: payments
            .filter((p) => p.method === "cash")
            .reduce((s, p) => s + paid(p), 0),
        onlineRev: payments
            .filter((p) => p.method === "online")
            .reduce((s, p) => s + paid(p), 0),
        partial: payments.filter((p) => p.isPartial).length,
        outstanding: payments
            .filter((p) => p.isPartial)
            .reduce((s, p) => s + (p.balance ?? 0), 0),
    };
};
// ─── GET /api/payments ────────────────────────────────────────────────────────
const getPayments = async (req, res) => {
    try {
        const { method, type, search, from, to, partial, page = "1", limit = "20", } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = (pageNum - 1) * limitNum;
        const filter = {};
        if (method && ["cash", "online"].includes(method))
            filter.method = method;
        if (type &&
            ["new_member", "renewal", "manual", "balance_settlement"].includes(type))
            filter.type = type;
        if (partial === "true")
            filter.isPartial = true;
        if (search) {
            const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "");
            filter.$or = [
                { memberName: { $regex: safe, $options: "i" } },
                { gymId: { $regex: safe, $options: "i" } },
            ];
        }
        if (from || to) {
            const toManilaStart = (dateStr) => {
                const [y, m, d] = dateStr.split("-").map(Number);
                return new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
            };
            const toManilaEnd = (dateStr) => {
                const [y, m, d] = dateStr.split("-").map(Number);
                return new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
            };
            const dateFilter = {};
            if (from)
                dateFilter.$gte = toManilaStart(from);
            if (to)
                dateFilter.$lte = toManilaEnd(to);
            filter.createdAt = dateFilter;
        }
        const [payments, total] = await Promise.all([
            Payment_1.default.find(filter)
                .populate("processedBy", "name username role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Payment_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            payments,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getPayments = getPayments;
// ─── GET /api/payments/summary ────────────────────────────────────────────────
const getPaymentSummary = async (req, res) => {
    try {
        const buildPeriod = async (from, to) => {
            const payments = await Payment_1.default.find({
                createdAt: { $gte: from, $lte: to },
            });
            return buildSummary(payments);
        };
        const [today, week, month] = await Promise.all([
            buildPeriod(...Object.values(getDateRange("today"))),
            buildPeriod(...Object.values(getDateRange("week"))),
            buildPeriod(...Object.values(getDateRange("month"))),
        ]);
        // Members with outstanding balance
        const withBalance = await Member_1.default.countDocuments({ balance: { $gt: 0 } });
        return res
            .status(200)
            .json({ success: true, today, week, month, withBalance });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getPaymentSummary = getPaymentSummary;
// ─── POST /api/payments ───────────────────────────────────────────────────────
// Manually log a payment — supports partial amount
const createPayment = async (req, res) => {
    try {
        const { gymId, method, type = "manual", amountPaid: rawAmount, notes, } = req.body;
        if (!gymId || !method) {
            return res
                .status(400)
                .json({ success: false, message: "gymId and method are required." });
        }
        if (!["cash", "online"].includes(method)) {
            return res
                .status(400)
                .json({ success: false, message: "Method must be cash or online." });
        }
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member) {
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        }
        const totalAmount = PLAN_PRICES[member.plan] ?? 0;
        const amountPaid = rawAmount != null
            ? Math.min(Number(rawAmount), totalAmount)
            : totalAmount;
        const balance = Math.max(0, totalAmount - amountPaid);
        const isPartial = balance > 0;
        // Update member's outstanding balance
        member.balance = balance;
        await member.save();
        const payment = await Payment_1.default.create({
            gymId: member.gymId,
            memberName: member.name,
            amount: amountPaid,
            amountPaid,
            totalAmount,
            balance,
            isPartial,
            method,
            type,
            plan: member.plan,
            notes,
            processedBy: req.user.id,
        });
        const populated = await payment.populate("processedBy", "name username role");
        return res.status(201).json({
            success: true,
            message: isPartial
                ? `Partial payment of ₱${amountPaid} logged. Remaining balance: ₱${balance}.`
                : `Full payment of ₱${amountPaid} logged for ${member.name}.`,
            payment: populated,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.createPayment = createPayment;
// ─── POST /api/payments/:gymId/settle ────────────────────────────────────────
// Settle the outstanding balance for a member
const settleBalance = async (req, res) => {
    try {
        const { gymId } = req.params;
        const { method, amountPaid: rawAmount } = req.body;
        if (!["cash", "online"].includes(method)) {
            return res
                .status(400)
                .json({ success: false, message: "Method must be cash or online." });
        }
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member) {
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        }
        if (member.balance <= 0) {
            return res.status(400).json({
                success: false,
                message: `${member.name} has no outstanding balance.`,
            });
        }
        // Guard against duplicate submissions within 3 seconds
        const recentSettle = await Payment_1.default.findOne({
            gymId: member.gymId,
            type: "balance_settlement",
            createdAt: { $gte: new Date(Date.now() - 3000) },
        });
        if (recentSettle) {
            return res.status(409).json({
                success: false,
                message: "Settlement already processed. Please wait a moment.",
            });
        }
        // Support partial settle — cap at outstanding balance
        const amountPaid = rawAmount && rawAmount > 0
            ? Math.min(rawAmount, member.balance)
            : member.balance;
        const totalAmount = PLAN_PRICES[member.plan] ?? 0;
        const remainingBalance = Math.max(0, member.balance - amountPaid);
        const isFullySettled = remainingBalance === 0;
        member.balance = remainingBalance;
        await member.save();
        // Mark ALL partial payments for this member as settled when fully paid
        if (isFullySettled) {
            await Payment_1.default.updateMany({ gymId: member.gymId, isPartial: true }, { $set: { isPartial: false, balance: 0 } });
        }
        const payment = await Payment_1.default.create({
            gymId: member.gymId,
            memberName: member.name,
            amount: amountPaid,
            amountPaid,
            totalAmount,
            balance: remainingBalance,
            isPartial: !isFullySettled,
            method,
            type: "balance_settlement",
            plan: member.plan,
            notes: isFullySettled
                ? `Balance fully settled — ₱${amountPaid} paid`
                : `Partial settlement — ₱${amountPaid} paid, ₱${remainingBalance} remaining`,
            processedBy: req.user.id,
        });
        const populated = await payment.populate("processedBy", "name username role");
        return res.status(200).json({
            success: true,
            message: isFullySettled
                ? `Balance of ₱${amountPaid} fully settled for ${member.name}.`
                : `₱${amountPaid} settled. Remaining balance: ₱${remainingBalance}.`,
            payment: populated,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.settleBalance = settleBalance;
// ─── Internal — auto-log payment on register/renewal ─────────────────────────
const autoLogPayment = async ({ gymId, memberName, plan, method, type, processedBy, amountPaid, }) => {
    const totalAmount = PLAN_PRICES[plan] ?? 0;
    const paid = amountPaid != null ? Math.min(amountPaid, totalAmount) : totalAmount;
    const balance = Math.max(0, totalAmount - paid);
    await Payment_1.default.create({
        gymId,
        memberName,
        amount: paid,
        amountPaid: paid,
        totalAmount,
        balance,
        isPartial: balance > 0,
        method,
        type,
        plan,
        processedBy,
    });
    // Update member balance
    if (balance > 0) {
        await Member_1.default.updateOne({ gymId }, { balance });
    }
};
exports.autoLogPayment = autoLogPayment;
