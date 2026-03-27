"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoLogPayment = exports.settleBalance = exports.createPayment = exports.getPaymentSummary = exports.getPayments = void 0;
const Payment_1 = __importDefault(require("../models/Payment"));
const Member_1 = __importDefault(require("../models/Member"));
const Settings_1 = __importDefault(require("../models/Settings"));
const logAction_1 = require("../utils/logAction");
const FALLBACK_PRICES = {
    Monthly: 800,
    Quarterly: 2100,
    Annual: 7500,
    Student: 500,
};
const FALLBACK_DURATIONS = {
    Monthly: 1,
    Quarterly: 3,
    Annual: 12,
    Student: 1,
};
const getPlanPrice = async (planName, settingsCache) => {
    const settings = settingsCache ?? (await Settings_1.default.findOne({}).select("plans").lean());
    const plan = settings?.plans?.find((p) => p.name === planName && p.isActive);
    return plan?.price ?? FALLBACK_PRICES[planName] ?? 0;
};
const getPlanDuration = async (planName, settingsCache) => {
    const settings = settingsCache ?? (await Settings_1.default.findOne({}).select("plans").lean());
    const plan = settings?.plans?.find((p) => p.name === planName && p.isActive);
    return plan?.durationMonths ?? FALLBACK_DURATIONS[planName] ?? 1;
};
const getDateRange = (range) => {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
    const now = new Date();
    const manilaToday = fmt.format(now);
    const [y, m, d] = manilaToday.split("-").map(Number);
    const manilaStartOfDay = new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
    const manilaEndOfDay = new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
    if (range === "today")
        return { from: manilaStartOfDay, to: manilaEndOfDay };
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
        const [payments, total, grandTotalResult] = await Promise.all([
            Payment_1.default.find(filter)
                .populate("processedBy", "name username role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Payment_1.default.countDocuments(filter),
            Payment_1.default.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: null,
                        grandTotal: { $sum: { $ifNull: ["$amountPaid", "$amount"] } },
                    },
                },
            ]),
        ]);
        const grandTotal = grandTotalResult[0]?.grandTotal ?? 0;
        return res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            grandTotal,
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
const createPayment = async (req, res) => {
    try {
        const { gymId, method, type = "manual", amountPaid: rawAmount, totalAmount: clientTotal, notes, plan: newPlan, renewExpiry, } = req.body;
        if (!gymId || !method)
            return res
                .status(400)
                .json({ success: false, message: "gymId and method are required." });
        if (!["cash", "online"].includes(method))
            return res
                .status(400)
                .json({ success: false, message: "Method must be cash or online." });
        if (rawAmount != null && Number(rawAmount) <= 0)
            return res
                .status(400)
                .json({ success: false, message: "Amount must be greater than zero." });
        // Cache settings once for this request
        const settingsCache = await Settings_1.default.findOne({}).select("plans").lean();
        if (newPlan) {
            const validPlan = settingsCache?.plans?.some((p) => p.name === newPlan && p.isActive);
            if (!validPlan)
                return res
                    .status(400)
                    .json({
                    success: false,
                    message: `Plan "${newPlan}" is not available.`,
                });
        }
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        if (!member.isActive)
            return res
                .status(400)
                .json({
                success: false,
                message: `${member.name} is deactivated. Reactivate the member first.`,
            });
        // 10-second duplicate guard
        const recentPayment = await Payment_1.default.findOne({
            gymId: member.gymId,
            type,
            createdAt: { $gte: new Date(Date.now() - 10000) },
        });
        if (recentPayment)
            return res
                .status(409)
                .json({
                success: false,
                message: "Payment already processed. Please wait a moment.",
            });
        const previousPlan = member.plan;
        const effectivePlan = newPlan || member.plan;
        if (newPlan && newPlan !== member.plan)
            member.plan = newPlan;
        const totalAmount = clientTotal != null && clientTotal > 0
            ? clientTotal
            : await getPlanPrice(effectivePlan, settingsCache);
        const amountPaid = rawAmount != null
            ? Math.min(Number(rawAmount), totalAmount)
            : totalAmount;
        const balance = Math.max(0, totalAmount - amountPaid);
        const isPartial = balance > 0;
        if (type === "manual") {
            member.balance = (member.balance ?? 0) + balance;
        }
        else {
            member.balance = balance;
        }
        if (renewExpiry) {
            const months = await getPlanDuration(effectivePlan, settingsCache);
            // FIX: Extend from the member's current expiry date if still active,
            // or from today if already expired — never blindly from today.
            const now = new Date();
            const currentExpiry = member.expiresAt ? new Date(member.expiresAt) : now;
            const baseDate = currentExpiry > now ? currentExpiry : now;
            baseDate.setMonth(baseDate.getMonth() + months);
            member.expiresAt = baseDate;
            member.status = "active";
        }
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
            // Use the provided type, but override to renewal if renewExpiry is set
            type: renewExpiry ? "renewal" : type,
            plan: effectivePlan,
            notes,
            processedBy: req.user.id,
        });
        const populated = await payment.populate("processedBy", "name username role");
        // Build audit detail — include plan change if it happened
        const planChangedNote = newPlan && newPlan !== previousPlan
            ? ` (plan changed: ${previousPlan} → ${newPlan})`
            : "";
        await (0, logAction_1.logAction)({
            action: "payment_created",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: isPartial
                ? `${req.user.name} logged partial payment ₱${amountPaid} for ${member.name} (${member.gymId}) — balance: ₱${balance}${planChangedNote}`
                : `${req.user.name} logged full payment ₱${amountPaid} for ${member.name} (${member.gymId})${planChangedNote}`,
        });
        let msg = isPartial
            ? `Partial payment of ₱${amountPaid} logged. Remaining balance: ₱${balance}.`
            : `Full payment of ₱${amountPaid} logged for ${member.name}.`;
        if (renewExpiry)
            msg += ` Membership extended to ${member.expiresAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}.`;
        return res.status(201).json({
            success: true,
            message: msg,
            payment: populated,
            member: {
                gymId: member.gymId,
                plan: member.plan,
                status: member.status,
                expiresAt: member.expiresAt,
                balance: member.balance,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.createPayment = createPayment;
// ─── POST /api/payments/:gymId/settle ────────────────────────────────────────
const settleBalance = async (req, res) => {
    try {
        const { gymId } = req.params;
        const { method, amountPaid: rawAmount } = req.body;
        if (!["cash", "online"].includes(method))
            return res
                .status(400)
                .json({ success: false, message: "Method must be cash or online." });
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        if (member.balance <= 0)
            return res
                .status(400)
                .json({
                success: false,
                message: `${member.name} has no outstanding balance.`,
            });
        // 10-second duplicate guard
        const recentSettle = await Payment_1.default.findOne({
            gymId: member.gymId,
            type: "balance_settlement",
            createdAt: { $gte: new Date(Date.now() - 10000) },
        });
        if (recentSettle)
            return res
                .status(409)
                .json({
                success: false,
                message: "Settlement already processed. Please wait a moment.",
            });
        const outstandingBalance = member.balance;
        const amountPaid = rawAmount && rawAmount > 0
            ? Math.min(rawAmount, outstandingBalance)
            : outstandingBalance;
        const remainingBalance = Math.max(0, outstandingBalance - amountPaid);
        const isFullySettled = remainingBalance === 0;
        member.balance = remainingBalance;
        await member.save();
        if (isFullySettled) {
            await Payment_1.default.updateMany({ gymId: member.gymId, isPartial: true }, { $set: { isPartial: false, balance: 0 } });
        }
        // FIX: totalAmount is the outstanding balance being settled, not the plan price
        const payment = await Payment_1.default.create({
            gymId: member.gymId,
            memberName: member.name,
            amount: amountPaid,
            amountPaid,
            totalAmount: outstandingBalance,
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
        await (0, logAction_1.logAction)({
            action: "payment_created",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: isFullySettled
                ? `${req.user.name} fully settled balance of ₱${amountPaid} for ${member.name} (${member.gymId})`
                : `${req.user.name} partially settled ₱${amountPaid} for ${member.name} (${member.gymId}) — ₱${remainingBalance} remaining`,
        });
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
const autoLogPayment = async ({ gymId, memberName, plan, method, type, processedBy, amountPaid, totalAmountOverride, }) => {
    try {
        const settingsCache = await Settings_1.default.findOne({}).select("plans").lean();
        const totalAmount = totalAmountOverride != null && totalAmountOverride > 0
            ? totalAmountOverride
            : await getPlanPrice(plan, settingsCache);
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
        const member = await Member_1.default.findOne({ gymId });
        if (member) {
            member.balance = (member.balance ?? 0) + balance;
            await member.save();
        }
    }
    catch (err) {
        console.error("[autoLogPayment] Failed:", err);
    }
};
exports.autoLogPayment = autoLogPayment;
