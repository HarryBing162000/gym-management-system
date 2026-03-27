"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOutMember = exports.checkInMember = exports.reactivateMember = exports.deactivateMember = exports.updateMember = exports.createMember = exports.getMemberByGymId = exports.getAtRiskMembers = exports.getMemberStats = exports.getMembers = void 0;
const Member_1 = __importDefault(require("../models/Member"));
const logAction_1 = require("../utils/logAction");
const paymentController_1 = require("./paymentController");
const MEMBER_SAFE_FIELDS = {
    _id: 0,
    gymId: 1,
    name: 1,
    email: 1,
    phone: 1,
    plan: 1,
    status: 1,
    expiresAt: 1,
    checkedIn: 1,
    lastCheckIn: 1,
    photoUrl: 1,
    isActive: 1,
    balance: 1,
    createdAt: 1,
};
const generateGymId = async () => {
    const lastMember = await Member_1.default.findOne({})
        .sort({ createdAt: -1 })
        .select("gymId");
    if (!lastMember?.gymId)
        return "GYM-1001";
    const lastNum = parseInt(lastMember.gymId.replace("GYM-", ""), 10);
    return `GYM-${String(lastNum + 1).padStart(4, "0")}`;
};
const autoExpireMembers = async () => {
    await Member_1.default.updateMany({ status: "active", expiresAt: { $lt: new Date() } }, { $set: { status: "expired" } });
};
// ─── GET /api/members ─────────────────────────────────────────────────────────
const getMembers = async (req, res) => {
    try {
        await autoExpireMembers();
        const { status, plan, search, checkedIn, page = "1", limit = "20", } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
        const skip = (pageNum - 1) * limitNum;
        const filter = { isActive: true };
        if (status && ["active", "inactive", "expired"].includes(status))
            filter.status = status;
        if (plan && plan.trim().length > 0)
            filter.plan = plan;
        if (checkedIn === "true")
            filter.checkedIn = true;
        if (search) {
            const safeSearch = String(search)
                .replace(/[.*+?^${}()|[\]\\]/g, "")
                .trim();
            if (safeSearch.length >= 1) {
                if (/^GYM/i.test(safeSearch)) {
                    filter.gymId = { $regex: `^${safeSearch.toUpperCase()}` };
                }
                else {
                    filter.$or = [
                        { name: { $regex: safeSearch, $options: "i" } },
                        { email: { $regex: safeSearch, $options: "i" } },
                    ];
                }
            }
        }
        const [members, total] = await Promise.all([
            Member_1.default.find(filter)
                .select(MEMBER_SAFE_FIELDS)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Member_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            success: true,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            members,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getMembers = getMembers;
// ─── GET /api/members/stats ───────────────────────────────────────────────────
const getMemberStats = async (_req, res) => {
    try {
        await autoExpireMembers();
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const [total, checkedIn, expiringSoon, withBalance] = await Promise.all([
            Member_1.default.countDocuments({ isActive: true }),
            Member_1.default.countDocuments({ isActive: true, checkedIn: true }),
            Member_1.default.countDocuments({
                isActive: true,
                status: "active",
                expiresAt: { $gte: now, $lte: in7Days },
            }),
            Member_1.default.countDocuments({ isActive: true, balance: { $gt: 0 } }),
        ]);
        return res
            .status(200)
            .json({ success: true, total, checkedIn, expiringSoon, withBalance });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getMemberStats = getMemberStats;
// ─── GET /api/members/at-risk ─────────────────────────────────────────────────
const getAtRiskMembers = async (_req, res) => {
    try {
        await autoExpireMembers();
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const expiring = await Member_1.default.find({
            isActive: true,
            status: "active",
            expiresAt: { $gte: now, $lte: in7Days },
        })
            .select(MEMBER_SAFE_FIELDS)
            .sort({ expiresAt: 1 })
            .limit(10);
        const overdue = await Member_1.default.find({ isActive: true, status: "expired" })
            .select(MEMBER_SAFE_FIELDS)
            .sort({ expiresAt: -1 })
            .limit(5);
        const atRisk = [
            ...expiring.map((m) => ({
                gymId: m.gymId,
                name: m.name,
                plan: m.plan,
                expiresAt: m.expiresAt,
                daysLeft: Math.ceil((new Date(m.expiresAt).getTime() - now.getTime()) / 86400000),
                status: "expiring",
            })),
            ...overdue.map((m) => ({
                gymId: m.gymId,
                name: m.name,
                plan: m.plan,
                expiresAt: m.expiresAt,
                daysLeft: Math.ceil((new Date(m.expiresAt).getTime() - now.getTime()) / 86400000),
                status: "overdue",
            })),
        ].slice(0, 10);
        return res.status(200).json({ success: true, atRisk });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getAtRiskMembers = getAtRiskMembers;
// ─── GET /api/members/:gymId ──────────────────────────────────────────────────
const getMemberByGymId = async (req, res) => {
    try {
        const { gymId } = req.params;
        const member = await Member_1.default.findOne({
            gymId: String(gymId).toUpperCase(),
        }).select(MEMBER_SAFE_FIELDS);
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        return res.status(200).json({ success: true, member });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.getMemberByGymId = getMemberByGymId;
// ─── POST /api/members ────────────────────────────────────────────────────────
const createMember = async (req, res) => {
    try {
        const { name, email, phone, plan, status, expiresAt } = req.body;
        const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const nameExists = await Member_1.default.findOne({
            name: { $regex: `^${escapedName}$`, $options: "i" },
        }).select("gymId name");
        if (nameExists) {
            return res.status(409).json({
                success: false,
                message: `A member named "${nameExists.name}" already exists (${nameExists.gymId}). Please check if they are already registered.`,
            });
        }
        if (email) {
            const emailExists = await Member_1.default.findOne({ email }).select("gymId name");
            if (emailExists)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: "This email is already registered. Please use a different email.",
                });
        }
        if (phone) {
            const normalizedPhone = phone.replace(/\s/g, "");
            const phoneExists = await Member_1.default.findOne({
                phone: {
                    $regex: normalizedPhone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                },
            }).select("gymId name");
            if (phoneExists)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: `This phone number is already registered to ${phoneExists.name} (${phoneExists.gymId}).`,
                });
        }
        let gymId = "";
        let attempts = 0;
        while (true) {
            gymId = await generateGymId();
            const collision = await Member_1.default.findOne({ gymId });
            if (!collision)
                break;
            attempts++;
            if (attempts > 5)
                return res
                    .status(500)
                    .json({
                    success: false,
                    message: "Failed to generate unique GYM-ID. Please try again.",
                });
        }
        const createPayload = {
            gymId,
            name,
            plan,
            status,
            expiresAt,
            isActive: true,
            checkedIn: false,
        };
        if (email)
            createPayload.email = email;
        if (phone)
            createPayload.phone = phone;
        const member = await Member_1.default.create(createPayload);
        await (0, logAction_1.logAction)({
            action: "member_created",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: `${req.user.name} registered new member ${member.name} (${member.gymId}) — plan: ${member.plan}`,
        });
        try {
            await (0, paymentController_1.autoLogPayment)({
                gymId: member.gymId,
                memberName: member.name,
                plan: member.plan,
                method: req.body.paymentMethod ?? "cash",
                type: "new_member",
                processedBy: req.user.id,
                amountPaid: req.body.amountPaid != null ? Number(req.body.amountPaid) : undefined,
            });
        }
        catch {
            /* non-critical */
        }
        return res.status(201).json({
            success: true,
            message: `Member ${gymId} registered successfully.`,
            member: {
                gymId: member.gymId,
                name: member.name,
                email: member.email,
                phone: member.phone,
                plan: member.plan,
                status: member.status,
                expiresAt: member.expiresAt,
                checkedIn: member.checkedIn,
                isActive: member.isActive,
                createdAt: member.createdAt,
            },
        });
    }
    catch (err) {
        if (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === 11000) {
            return res
                .status(409)
                .json({
                success: false,
                message: "A member with this information already exists.",
            });
        }
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.createMember = createMember;
// ─── PATCH /api/members/:gymId ────────────────────────────────────────────────
const updateMember = async (req, res) => {
    try {
        const { gymId } = req.params;
        const updates = req.body;
        const blocked = ["gymId", "_id"];
        for (const field of blocked) {
            if (field in updates)
                return res
                    .status(400)
                    .json({
                    success: false,
                    message: `Field "${field}" cannot be updated.`,
                });
        }
        const currentGymId = String(gymId).toUpperCase();
        if (updates.name) {
            const escapedName = updates.name
                .trim()
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const nameExists = await Member_1.default.findOne({
                name: { $regex: `^${escapedName}$`, $options: "i" },
                gymId: { $ne: currentGymId },
            }).select("gymId name");
            if (nameExists)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: `A member named "${nameExists.name}" already exists (${nameExists.gymId}).`,
                });
        }
        if (updates.email) {
            const emailExists = await Member_1.default.findOne({
                email: updates.email,
                gymId: { $ne: currentGymId },
            }).select("gymId name");
            if (emailExists)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: "This email is already registered to another member.",
                });
        }
        if (updates.phone) {
            const normalizedPhone = updates.phone.replace(/\s/g, "");
            const phoneExists = await Member_1.default.findOne({
                phone: {
                    $regex: normalizedPhone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                },
                gymId: { $ne: currentGymId },
            }).select("gymId name");
            if (phoneExists)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: `This phone number is already registered to ${phoneExists.name} (${phoneExists.gymId}).`,
                });
        }
        const setPayload = {};
        const allowedFields = [
            "name",
            "email",
            "phone",
            "plan",
            "status",
            "expiresAt",
            "photoUrl",
        ];
        for (const field of allowedFields) {
            if (field in updates && updates[field] !== undefined)
                setPayload[field] = updates[field];
        }
        if (Object.keys(setPayload).length === 0)
            return res
                .status(400)
                .json({
                success: false,
                message: "No valid fields provided for update.",
            });
        const oldMember = await Member_1.default.findOne({ gymId: currentGymId }).select("expiresAt");
        const oldExpiresAt = oldMember?.expiresAt;
        const member = await Member_1.default.findOneAndUpdate({ gymId: currentGymId }, { $set: setPayload }, { returnDocument: "after", runValidators: true }).select(MEMBER_SAFE_FIELDS);
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        const isRenewal = setPayload.expiresAt &&
            oldExpiresAt &&
            new Date(setPayload.expiresAt) > new Date(oldExpiresAt);
        await (0, logAction_1.logAction)({
            action: isRenewal ? "member_updated" : "member_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: isRenewal
                ? `${req.user.name} renewed ${member.name} (${member.gymId}) — plan: ${member.plan}`
                : `${req.user.name} updated ${member.name} (${member.gymId})`,
        });
        if (isRenewal) {
            try {
                await (0, paymentController_1.autoLogPayment)({
                    gymId: member.gymId,
                    memberName: member.name,
                    plan: String(setPayload.plan ?? member.plan),
                    method: req.body.paymentMethod ?? "cash",
                    type: "renewal",
                    processedBy: req.user.id,
                    amountPaid: req.body.amountPaid != null
                        ? Number(req.body.amountPaid)
                        : undefined,
                    totalAmountOverride: req.body.totalAmount != null
                        ? Number(req.body.totalAmount)
                        : undefined,
                });
            }
            catch {
                /* non-critical */
            }
        }
        return res
            .status(200)
            .json({ success: true, message: "Member updated successfully.", member });
    }
    catch (err) {
        if (typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === 11000) {
            return res
                .status(409)
                .json({
                success: false,
                message: "This information is already in use by another member.",
            });
        }
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.updateMember = updateMember;
// ─── PATCH /api/members/:gymId/deactivate ─────────────────────────────────────
const deactivateMember = async (req, res) => {
    try {
        const { gymId } = req.params;
        const member = await Member_1.default.findOneAndUpdate({ gymId: String(gymId).toUpperCase() }, { $set: { isActive: false, status: "inactive", checkedIn: false } }, { returnDocument: "after" }).select(MEMBER_SAFE_FIELDS);
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        await (0, logAction_1.logAction)({
            action: "member_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: `${req.user.name} deactivated member ${member.name} (${member.gymId})`,
        });
        return res
            .status(200)
            .json({
            success: true,
            message: `Member ${gymId} has been deactivated.`,
            member,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.deactivateMember = deactivateMember;
// ─── PATCH /api/members/:gymId/reactivate ────────────────────────────────────
const reactivateMember = async (req, res) => {
    try {
        const { gymId } = req.params;
        const upperGymId = String(gymId).toUpperCase();
        const existing = await Member_1.default.findOne({ gymId: upperGymId });
        if (!existing)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        const isExpired = new Date(existing.expiresAt) < new Date();
        const newStatus = isExpired ? "expired" : "active";
        const member = await Member_1.default.findOneAndUpdate({ gymId: upperGymId }, { $set: { isActive: true, status: newStatus } }, { returnDocument: "after" }).select(MEMBER_SAFE_FIELDS);
        await (0, logAction_1.logAction)({
            action: "member_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: upperGymId,
            targetName: existing.name,
            detail: `${req.user.name} reactivated member ${existing.name} (${upperGymId})`,
        });
        const message = isExpired
            ? `Member ${gymId} reactivated but membership is expired. Please renew their plan.`
            : `Member ${gymId} has been reactivated.`;
        return res.status(200).json({ success: true, message, member });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.reactivateMember = reactivateMember;
// ─── PATCH /api/members/:gymId/checkin ───────────────────────────────────────
const checkInMember = async (req, res) => {
    try {
        const { gymId } = req.params;
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        if (!member.isActive || member.status === "inactive")
            return res
                .status(403)
                .json({
                success: false,
                message: `${member.name}'s membership is inactive.`,
            });
        if (member.status === "expired")
            return res
                .status(403)
                .json({
                success: false,
                message: `${member.name}'s membership has expired.`,
            });
        if (member.checkedIn)
            return res
                .status(400)
                .json({
                success: false,
                message: `${member.name} is already checked in.`,
            });
        member.checkedIn = true;
        member.lastCheckIn = new Date();
        await member.save();
        await (0, logAction_1.logAction)({
            action: "check_in",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: `${req.user.name} checked in ${member.name} (${member.gymId})`,
        });
        return res.status(200).json({
            success: true,
            message: `${member.name} checked in successfully.`,
            member: { gymId: member.gymId, name: member.name, checkedIn: true },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.checkInMember = checkInMember;
// ─── PATCH /api/members/:gymId/checkout ──────────────────────────────────────
const checkOutMember = async (req, res) => {
    try {
        const { gymId } = req.params;
        const member = await Member_1.default.findOne({ gymId: String(gymId).toUpperCase() });
        if (!member)
            return res
                .status(404)
                .json({ success: false, message: `Member ${gymId} not found.` });
        if (!member.checkedIn)
            return res
                .status(400)
                .json({
                success: false,
                message: `${member.name} is not currently checked in.`,
            });
        member.checkedIn = false;
        await member.save();
        await (0, logAction_1.logAction)({
            action: "check_out",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            targetId: member.gymId,
            targetName: member.name,
            detail: `${req.user.name} checked out ${member.name} (${member.gymId})`,
        });
        return res.status(200).json({
            success: true,
            message: `${member.name} checked out successfully.`,
            member: { gymId: member.gymId, name: member.name, checkedIn: false },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Server error";
        return res.status(500).json({ success: false, message });
    }
};
exports.checkOutMember = checkOutMember;
