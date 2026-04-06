import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/authMiddleware";
import Payment, { IPayment } from "../models/Payment";
import Member from "../models/Member";
import Settings from "../models/Settings";
import { logAction } from "../utils/logAction";

export type PaymentMethod = "cash" | "online";
export type PaymentType =
  | "new_member"
  | "renewal"
  | "manual"
  | "balance_settlement";

const FALLBACK_PRICES: Record<string, number> = {
  Monthly: 800,
  Quarterly: 2100,
  Annual: 7500,
  Student: 500,
};
const FALLBACK_DURATIONS: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  Annual: 12,
  Student: 1,
};

// FIX: removed {} fallback — if ownerId is falsy we return null instead of
// the first gym's settings, preventing cross-gym plan price leakage.
const getPlanPrice = async (
  planName: string,
  settingsCache?: any,
  ownerId?: string,
): Promise<number> => {
  const settings =
    settingsCache ??
    (ownerId
      ? await Settings.findOne({ ownerId }).select("plans").lean()
      : null);
  const plan = settings?.plans?.find(
    (p: any) => p.name === planName && p.isActive,
  );
  return plan?.price ?? FALLBACK_PRICES[planName] ?? 0;
};

// FIX: removed {} fallback — same reason as getPlanPrice above.
const getPlanDuration = async (
  planName: string,
  settingsCache?: any,
  ownerId?: string,
): Promise<number> => {
  const settings =
    settingsCache ??
    (ownerId
      ? await Settings.findOne({ ownerId }).select("plans").lean()
      : null);
  const plan = settings?.plans?.find(
    (p: any) => p.name === planName && p.isActive,
  );
  return plan?.durationMonths ?? FALLBACK_DURATIONS[planName] ?? 1;
};

const getDateRange = (
  range: string,
  timezone: string,
): { from: Date; to: Date } => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const todayStr = fmt.format(now);
  const [y, m, d] = todayStr.split("-").map(Number);

  // Compute timezone offset in ms (handles half-hour zones like UTC+5:30)
  const utcMs = new Date(
    now.toLocaleString("en-US", { timeZone: "UTC" }),
  ).getTime();
  const tzMs = new Date(
    now.toLocaleString("en-US", { timeZone: timezone }),
  ).getTime();
  const offsetMs = tzMs - utcMs;

  // Midnight in the target timezone as a UTC Date
  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMs);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (range === "today") return { from: startOfDay, to: endOfDay };
  if (range === "week") {
    const dow = now.toLocaleDateString("en-PH", {
      timeZone: timezone,
      weekday: "short",
    });
    const dayOffset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      dow,
    );
    const from = new Date(
      Date.UTC(y, m - 1, d - dayOffset, 0, 0, 0, 0) - offsetMs,
    );
    return { from, to: endOfDay };
  }
  if (range === "month") {
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - offsetMs);
    return { from, to: endOfDay };
  }
  const from = new Date(Date.UTC(y, m - 1, d - 30, 0, 0, 0, 0) - offsetMs);
  return { from, to: endOfDay };
};

// FIX: helper that converts a YYYY-MM-DD date string to a UTC Date
// representing midnight/end-of-day in the gym's actual timezone.
// Replaces the old hardcoded toManilaStart/toManilaEnd (-8 offset).
const buildTzDateBounds = (
  dateStr: string,
  timezone: string,
): { start: Date; end: Date } => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const now = new Date();
  const utcMs = new Date(
    now.toLocaleString("en-US", { timeZone: "UTC" }),
  ).getTime();
  const tzMs = new Date(
    now.toLocaleString("en-US", { timeZone: timezone }),
  ).getTime();
  const offsetMs = tzMs - utcMs;
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

const buildSummary = (payments: IPayment[]) => {
  const paid = (p: IPayment) => p.amountPaid ?? p.amount ?? 0;
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
export const getPayments = async (req: AuthRequest, res: Response) => {
  try {
    const {
      method,
      type,
      search,
      from,
      to,
      partial,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(req.user!.ownerId),
    };
    if (method && ["cash", "online"].includes(method)) filter.method = method;
    if (
      type &&
      ["new_member", "renewal", "manual", "balance_settlement"].includes(type)
    )
      filter.type = type;
    if (partial === "true") filter.isPartial = true;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "");
      filter.$or = [
        { memberName: { $regex: safe, $options: "i" } },
        { gymId: { $regex: safe, $options: "i" } },
      ];
    }

    // FIX: date filter now reads the gym's actual timezone from Settings
    // instead of hardcoding Manila's -8 UTC offset.
    if (from || to) {
      const settingsDoc = await Settings.findOne({ ownerId: req.user!.ownerId })
        .select("timezone")
        .lean();
      const tz = (settingsDoc as any)?.timezone ?? "Asia/Manila";

      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = buildTzDateBounds(from, tz).start;
      if (to) dateFilter.$lte = buildTzDateBounds(to, tz).end;
      filter.createdAt = dateFilter;
    }

    const [payments, total, aggregateResult] = await Promise.all([
      Payment.find(filter)
        .populate("processedBy", "name username role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Payment.countDocuments(filter),
      Payment.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            grandTotal: { $sum: { $ifNull: ["$amountPaid", "$amount"] } },
            cashTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$method", "cash"] },
                  { $ifNull: ["$amountPaid", "$amount"] },
                  0,
                ],
              },
            },
            onlineTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$method", "online"] },
                  { $ifNull: ["$amountPaid", "$amount"] },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const grandTotal = aggregateResult[0]?.grandTotal ?? 0;
    const cashTotal = aggregateResult[0]?.cashTotal ?? 0;
    const onlineTotal = aggregateResult[0]?.onlineTotal ?? 0;

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      grandTotal,
      cashTotal,
      onlineTotal,
      payments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── GET /api/payments/summary ────────────────────────────────────────────────
export const getPaymentSummary = async (req: AuthRequest, res: Response) => {
  try {
    const ownerId = new mongoose.Types.ObjectId(req.user!.ownerId);

    const settingsDoc = await Settings.findOne({ ownerId })
      .select("timezone")
      .lean();
    const timezone = (settingsDoc as any)?.timezone ?? "Asia/Manila";

    const buildPeriod = async (from: Date, to: Date) => {
      const payments = await Payment.find({
        ownerId,
        createdAt: { $gte: from, $lte: to },
      });
      return buildSummary(payments);
    };

    const [today, week, month] = await Promise.all([
      buildPeriod(
        ...(Object.values(getDateRange("today", timezone)) as [Date, Date]),
      ),
      buildPeriod(
        ...(Object.values(getDateRange("week", timezone)) as [Date, Date]),
      ),
      buildPeriod(
        ...(Object.values(getDateRange("month", timezone)) as [Date, Date]),
      ),
    ]);

    const withBalance = await Member.countDocuments({
      ownerId: new mongoose.Types.ObjectId(req.user!.ownerId),
      balance: { $gt: 0 },
    });

    return res
      .status(200)
      .json({ success: true, today, week, month, withBalance });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── POST /api/payments ───────────────────────────────────────────────────────
export const createPayment = async (req: AuthRequest, res: Response) => {
  try {
    const {
      gymId,
      method,
      type = "manual",
      amountPaid: rawAmount,
      totalAmount: clientTotal,
      notes,
      plan: newPlan,
      renewExpiry,
    } = req.body as {
      gymId: string;
      method: PaymentMethod;
      type?: PaymentType;
      amountPaid?: number;
      totalAmount?: number;
      notes?: string;
      plan?: string;
      renewExpiry?: boolean;
    };

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

    // Cache settings once for this request — scoped to this gym's ownerId
    const settingsCache = await Settings.findOne({ ownerId: req.user!.ownerId })
      .select("plans")
      .lean();

    if (newPlan) {
      const validPlan = settingsCache?.plans?.some(
        (p: any) => p.name === newPlan && p.isActive,
      );
      if (!validPlan)
        return res.status(400).json({
          success: false,
          message: `Plan "${newPlan}" is not available.`,
        });
    }

    const member = await Member.findOne({
      ownerId: req.user!.ownerId,
      gymId: String(gymId).toUpperCase(),
    });
    if (!member)
      return res
        .status(404)
        .json({ success: false, message: `Member ${gymId} not found.` });
    if (!member.isActive)
      return res.status(400).json({
        success: false,
        message: `${member.name} is deactivated. Reactivate the member first.`,
      });

    // 10-second duplicate guard — scoped to ownerId
    const recentPayment = await Payment.findOne({
      ownerId: req.user!.ownerId,
      gymId: member.gymId,
      type,
      createdAt: { $gte: new Date(Date.now() - 10000) },
    });
    if (recentPayment)
      return res.status(409).json({
        success: false,
        message: "Payment already processed. Please wait a moment.",
      });

    const previousPlan = member.plan;
    const effectivePlan = newPlan || member.plan;
    if (newPlan && newPlan !== member.plan)
      member.plan = newPlan as typeof member.plan;

    // FIX: pass ownerId as third arg so if settingsCache is null for any reason,
    // getPlanPrice fetches THIS gym's settings — not the first gym's.
    const totalAmount =
      clientTotal != null && clientTotal > 0
        ? clientTotal
        : await getPlanPrice(effectivePlan, settingsCache, req.user!.ownerId);
    const amountPaid =
      rawAmount != null
        ? Math.min(Number(rawAmount), totalAmount)
        : totalAmount;
    const balance = Math.max(0, totalAmount - amountPaid);
    const isPartial = balance > 0;

    if (type === "manual") {
      member.balance = (member.balance ?? 0) + balance;
    } else {
      member.balance = balance;
    }

    if (renewExpiry) {
      // FIX: pass ownerId as third arg for same reason as getPlanPrice above
      const months = await getPlanDuration(
        effectivePlan,
        settingsCache,
        req.user!.ownerId,
      );

      // Extend from the member's current expiry date if still active,
      // or from today if already expired — never blindly from today.
      const now = new Date();
      const currentExpiry = member.expiresAt ? new Date(member.expiresAt) : now;
      const baseDate = currentExpiry > now ? currentExpiry : now;
      baseDate.setMonth(baseDate.getMonth() + months);

      member.expiresAt = baseDate;
      member.status = "active";
    }

    await member.save();

    const payment = await Payment.create({
      ownerId: new mongoose.Types.ObjectId(req.user!.ownerId),
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
      processedBy: new mongoose.Types.ObjectId(req.user!.id),
    });

    const populated = await payment.populate(
      "processedBy",
      "name username role",
    );

    // Build audit detail — include plan change if it happened
    const planChangedNote =
      newPlan && newPlan !== previousPlan
        ? ` (plan changed: ${previousPlan} → ${newPlan})`
        : "";

    await logAction({
      ownerId: req.user!.ownerId,
      action: "payment_created",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      targetId: member.gymId,
      targetName: member.name,
      detail: isPartial
        ? `${req.user!.name} logged partial payment ₱${amountPaid} for ${member.name} (${member.gymId}) — balance: ₱${balance}${planChangedNote}`
        : `${req.user!.name} logged full payment ₱${amountPaid} for ${member.name} (${member.gymId})${planChangedNote}`,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── POST /api/payments/:gymId/settle ────────────────────────────────────────
export const settleBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { gymId } = req.params;
    const { method, amountPaid: rawAmount } = req.body as {
      method: PaymentMethod;
      amountPaid?: number;
    };

    if (!["cash", "online"].includes(method))
      return res
        .status(400)
        .json({ success: false, message: "Method must be cash or online." });

    const member = await Member.findOne({
      ownerId: req.user!.ownerId,
      gymId: String(gymId).toUpperCase(),
    });
    if (!member)
      return res
        .status(404)
        .json({ success: false, message: `Member ${gymId} not found.` });
    if (member.balance <= 0)
      return res.status(400).json({
        success: false,
        message: `${member.name} has no outstanding balance.`,
      });

    // 10-second duplicate guard — scoped to ownerId
    const recentSettle = await Payment.findOne({
      ownerId: req.user!.ownerId,
      gymId: member.gymId,
      type: "balance_settlement",
      createdAt: { $gte: new Date(Date.now() - 10000) },
    });
    if (recentSettle)
      return res.status(409).json({
        success: false,
        message: "Settlement already processed. Please wait a moment.",
      });

    const outstandingBalance = member.balance;
    const amountPaid =
      rawAmount && rawAmount > 0
        ? Math.min(rawAmount, outstandingBalance)
        : outstandingBalance;
    const remainingBalance = Math.max(0, outstandingBalance - amountPaid);
    const isFullySettled = remainingBalance === 0;

    member.balance = remainingBalance;
    await member.save();

    if (isFullySettled) {
      await Payment.updateMany(
        { ownerId: req.user!.ownerId, gymId: member.gymId, isPartial: true },
        { $set: { isPartial: false, balance: 0 } },
      );
    }

    const payment = await Payment.create({
      ownerId: new mongoose.Types.ObjectId(req.user!.ownerId),
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
      processedBy: new mongoose.Types.ObjectId(req.user!.id),
    });

    const populated = await payment.populate(
      "processedBy",
      "name username role",
    );

    await logAction({
      ownerId: req.user!.ownerId,
      action: "payment_created",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      targetId: member.gymId,
      targetName: member.name,
      detail: isFullySettled
        ? `${req.user!.name} fully settled balance of ₱${amountPaid} for ${member.name} (${member.gymId})`
        : `${req.user!.name} partially settled ₱${amountPaid} for ${member.name} (${member.gymId}) — ₱${remainingBalance} remaining`,
    });

    return res.status(200).json({
      success: true,
      message: isFullySettled
        ? `Balance of ₱${amountPaid} fully settled for ${member.name}.`
        : `₱${amountPaid} settled. Remaining balance: ₱${remainingBalance}.`,
      payment: populated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── Internal — auto-log payment on register/renewal ─────────────────────────
export const autoLogPayment = async ({
  ownerId,
  gymId,
  memberName,
  plan,
  method,
  type,
  processedBy,
  amountPaid,
  totalAmountOverride,
}: {
  ownerId: string;
  gymId: string;
  memberName: string;
  plan: string;
  method: PaymentMethod;
  type: PaymentType;
  processedBy: string;
  amountPaid?: number;
  totalAmountOverride?: number;
}): Promise<void> => {
  try {
    // FIX: removed {} fallback — always fetch this gym's settings by ownerId.
    // Previously Settings.findOne(ownerId ? { ownerId } : {}) could return
    // the first gym's settings if ownerId was somehow falsy.
    const settingsCache = await Settings.findOne({ ownerId })
      .select("plans")
      .lean();

    const totalAmount =
      totalAmountOverride != null && totalAmountOverride > 0
        ? totalAmountOverride
        : await getPlanPrice(plan, settingsCache, ownerId);
    const paid =
      amountPaid != null ? Math.min(amountPaid, totalAmount) : totalAmount;
    const balance = Math.max(0, totalAmount - paid);

    await Payment.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
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
      // FIX: cast processedBy to ObjectId so populate("processedBy") works
      // correctly. Previously this was passed as a plain string, causing
      // silent populate failures on auto-logged payments.
      processedBy: new mongoose.Types.ObjectId(processedBy),
    });

    const member = await Member.findOne({ ownerId, gymId });
    if (member) {
      member.balance = (member.balance ?? 0) + balance;
      await member.save();
    }
  } catch (err) {
    console.error("[autoLogPayment] Failed:", err);
  }
};
