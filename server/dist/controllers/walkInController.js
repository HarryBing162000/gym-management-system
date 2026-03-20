"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kioskCheckOut = exports.getYesterdayRevenue = exports.getWalkInHistory = exports.getTodayWalkIns = exports.checkOutWalkIn = exports.registerWalkIn = void 0;
const WalkIn_1 = __importDefault(require("../models/WalkIn"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTodayDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const getPassAmount = (passType) => {
    const prices = {
        regular: 150,
        student: 100,
        couple: 250,
    };
    return prices[passType] ?? 150;
};
const generateWalkId = async () => {
    const today = getTodayDate();
    const last = await WalkIn_1.default.findOne({ date: today })
        .sort({ walkId: -1 })
        .select("walkId");
    if (!last)
        return "WALK-001";
    const lastNum = parseInt(last.walkId.replace("WALK-", ""));
    return `WALK-${String(lastNum + 1).padStart(3, "0")}`;
};
const calcDuration = (checkIn, checkOut) => {
    const mins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const buildSummary = (walkIns) => ({
    total: walkIns.length,
    revenue: walkIns.reduce((sum, w) => sum + w.amount, 0),
    regular: walkIns.filter((w) => w.passType === "regular").length,
    student: walkIns.filter((w) => w.passType === "student").length,
    couple: walkIns.filter((w) => w.passType === "couple").length,
    checkedOut: walkIns.filter((w) => w.isCheckedOut).length,
    stillInside: walkIns.filter((w) => !w.isCheckedOut).length,
});
// ─── POST /api/walkin/register ────────────────────────────────────────────────
const registerWalkIn = async (req, res) => {
    try {
        const { name, phone, passType } = req.body;
        const walkId = await generateWalkId();
        const today = getTodayDate();
        const amount = getPassAmount(passType);
        const walkIn = await WalkIn_1.default.create({
            walkId,
            name,
            phone,
            passType,
            amount,
            date: today,
            checkIn: new Date(),
            staffId: req.user.id,
            isCheckedOut: false,
        });
        return res.status(201).json({
            success: true,
            message: "Walk-in registered successfully",
            walkIn: {
                walkId: walkIn.walkId,
                name: walkIn.name,
                phone: walkIn.phone,
                passType: walkIn.passType,
                amount: walkIn.amount,
                checkIn: walkIn.checkIn,
                date: walkIn.date,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.registerWalkIn = registerWalkIn;
// ─── PATCH /api/walkin/checkout ───────────────────────────────────────────────
const checkOutWalkIn = async (req, res) => {
    try {
        const { walkId } = req.body;
        const today = getTodayDate();
        const walkIn = await WalkIn_1.default.findOne({ walkId, date: today });
        if (!walkIn) {
            return res.status(404).json({
                success: false,
                message: `${walkId} not found for today.`,
            });
        }
        if (walkIn.isCheckedOut) {
            return res.status(400).json({
                success: false,
                message: `${walkId} has already checked out.`,
            });
        }
        walkIn.checkOut = new Date();
        walkIn.isCheckedOut = true;
        await walkIn.save();
        return res.status(200).json({
            success: true,
            message: `Goodbye ${walkIn.name}! See you next time.`,
            walkIn: {
                walkId: walkIn.walkId,
                name: walkIn.name,
                passType: walkIn.passType,
                checkIn: walkIn.checkIn,
                checkOut: walkIn.checkOut,
                duration: calcDuration(walkIn.checkIn, walkIn.checkOut),
                isCheckedOut: true,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.checkOutWalkIn = checkOutWalkIn;
// ─── GET /api/walkin/today ────────────────────────────────────────────────────
const getTodayWalkIns = async (req, res) => {
    try {
        const today = getTodayDate();
        const walkIns = await WalkIn_1.default.find({ date: today })
            .populate("staffId", "name username")
            .sort({ checkIn: -1 });
        return res.status(200).json({
            success: true,
            date: today,
            summary: buildSummary(walkIns),
            walkIns,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getTodayWalkIns = getTodayWalkIns;
// ─── GET /api/walkin/history ──────────────────────────────────────────────────
// Owner only — view walk-ins for any past date or date range
// Query params: ?date=2026-03-18  OR  ?from=2026-03-01&to=2026-03-18
const getWalkInHistory = async (req, res) => {
    try {
        const { date, from, to, page = "1", limit = "50", } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
        const skip = (pageNum - 1) * limitNum;
        const filter = {};
        if (date) {
            // Single date
            filter.date = date;
        }
        else if (from || to) {
            // Date range
            const rangeFilter = {};
            if (from)
                rangeFilter.$gte = from;
            if (to)
                rangeFilter.$lte = to;
            filter.date = rangeFilter;
        }
        else {
            // Default — last 7 days (Manila time)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            filter.date = {
                $gte: new Intl.DateTimeFormat("en-CA", {
                    timeZone: "Asia/Manila",
                }).format(sevenDaysAgo),
            };
        }
        const [walkIns, total] = await Promise.all([
            WalkIn_1.default.find(filter)
                .populate("staffId", "name username")
                .sort({ date: -1, checkIn: -1 })
                .skip(skip)
                .limit(limitNum),
            WalkIn_1.default.countDocuments(filter),
        ]);
        // Summary for the filtered range
        const allForRange = await WalkIn_1.default.find(filter);
        return res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            summary: buildSummary(allForRange),
            walkIns,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getWalkInHistory = getWalkInHistory;
// ─── GET /api/walkin/yesterday-revenue ───────────────────────────────────────
// Returns yesterday's total revenue for comparison card.
const getYesterdayRevenue = async (req, res) => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Manila",
        }).format(yesterday);
        const walkIns = await WalkIn_1.default.find({ date: yesterdayStr });
        const revenue = walkIns.reduce((sum, w) => sum + w.amount, 0);
        const total = walkIns.length;
        return res
            .status(200)
            .json({ success: true, date: yesterdayStr, revenue, total });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getYesterdayRevenue = getYesterdayRevenue;
// ─── POST /api/walkin/kiosk-checkout (public) ─────────────────────────────────
const kioskCheckOut = async (req, res) => {
    try {
        const { walkId } = req.body;
        const today = getTodayDate();
        const walkIn = await WalkIn_1.default.findOne({
            walkId: walkId.toUpperCase(),
            date: today,
        });
        if (!walkIn) {
            return res.status(404).json({
                success: false,
                message: `ID "${walkId}" not found for today. Please see the front desk.`,
            });
        }
        if (walkIn.isCheckedOut) {
            return res.status(400).json({
                success: false,
                message: "You have already checked out. Have a great day! 👋",
            });
        }
        walkIn.checkOut = new Date();
        walkIn.isCheckedOut = true;
        await walkIn.save();
        const duration = calcDuration(walkIn.checkIn, walkIn.checkOut);
        return res.status(200).json({
            success: true,
            message: `Goodbye ${walkIn.name}! You spent ${duration} at IronCore. See you again! 💪`,
            walkIn: {
                walkId: walkIn.walkId,
                name: walkIn.name,
                passType: walkIn.passType,
                duration,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.kioskCheckOut = kioskCheckOut;
