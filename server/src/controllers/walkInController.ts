import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import WalkIn from "../models/WalkIn";
import Settings from "../models/Settings";
import { logAction } from "../utils/logAction";
import { WalkInInput, WalkInCheckOutInput } from "../middleware/authSchemas";

const getTodayDate = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

const getPassAmount = async (
  passType: "regular" | "student" | "couple",
): Promise<number> => {
  const fallback: Record<string, number> = {
    regular: 150,
    student: 100,
    couple: 250,
  };
  try {
    const settings = await Settings.findOne({}).select("walkInPrices").lean();
    if (settings?.walkInPrices)
      return (
        (settings.walkInPrices as any)[passType] ?? fallback[passType] ?? 150
      );
  } catch {
    /* fall through */
  }
  return fallback[passType] ?? 150;
};

const generateWalkId = async (today: string): Promise<string> => {
  // Sort by createdAt descending — more reliable than string sort on walkId
  const last = await WalkIn.findOne({ date: today })
    .sort({ createdAt: -1 })
    .select("walkId")
    .lean();
  if (!last) return "WALK-001";
  const lastNum = parseInt(last.walkId.replace("WALK-", ""), 10) || 0;
  return `WALK-${String(lastNum + 1).padStart(3, "0")}`;
};

const calcDuration = (checkIn: Date, checkOut: Date): string => {
  const mins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const buildSummary = (walkIns: (typeof WalkIn.prototype)[]) => ({
  total: walkIns.length,
  revenue: walkIns.reduce((sum, w) => sum + w.amount, 0),
  regular: walkIns.filter((w) => w.passType === "regular").length,
  student: walkIns.filter((w) => w.passType === "student").length,
  couple: walkIns.filter((w) => w.passType === "couple").length,
  checkedOut: walkIns.filter((w) => w.isCheckedOut).length,
  stillInside: walkIns.filter((w) => !w.isCheckedOut).length,
});

// ─── POST /api/walkin/register ────────────────────────────────────────────────
export const registerWalkIn = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, passType }: WalkInInput = req.body;
    const today = getTodayDate();

    // ── Duplicate check: same name registered today ──────────────────────────
    const existing = await WalkIn.findOne({
      date: today,
      name: {
        $regex: new RegExp(
          `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${name} is already registered today (${existing.walkId}). Check if this is a different person.`,
      });
    }

    const walkId = await generateWalkId(today);
    const amount = await getPassAmount(passType);

    let walkIn;
    try {
      walkIn = await WalkIn.create({
        walkId,
        name,
        phone,
        passType,
        amount,
        date: today,
        checkIn: new Date(),
        staffId: req.user!.id,
        isCheckedOut: false,
      });
    } catch (createErr: unknown) {
      // MongoDB unique index violation on walkId — two requests raced
      const mongoErr = createErr as { code?: number };
      if (mongoErr.code === 11000) {
        // Retry once with a fresh walkId
        const retryWalkId = await generateWalkId(today);
        walkIn = await WalkIn.create({
          walkId: retryWalkId,
          name,
          phone,
          passType,
          amount,
          date: today,
          checkIn: new Date(),
          staffId: req.user!.id,
          isCheckedOut: false,
        });
      } else {
        throw createErr;
      }
    }

    await logAction({
      action: "walk_in_created",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      targetId: walkIn.walkId,
      targetName: walkIn.name,
      detail: `${req.user!.name} registered walk-in ${walkIn.name} (${walkIn.walkId}) — ${walkIn.passType} pass, ₱${walkIn.amount}`,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── PATCH /api/walkin/checkout ───────────────────────────────────────────────
export const checkOutWalkIn = async (req: AuthRequest, res: Response) => {
  try {
    const { walkId }: WalkInCheckOutInput = req.body;
    const today = getTodayDate();

    const walkIn = await WalkIn.findOne({ walkId, date: today });
    if (!walkIn)
      return res
        .status(404)
        .json({ success: false, message: `${walkId} not found for today.` });
    if (walkIn.isCheckedOut)
      return res.status(400).json({
        success: false,
        message: `${walkId} has already checked out.`,
      });

    walkIn.checkOut = new Date();
    walkIn.isCheckedOut = true;
    await walkIn.save();

    await logAction({
      action: "walk_in_checkout",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      targetId: walkIn.walkId,
      targetName: walkIn.name,
      detail: `${req.user!.name} checked out walk-in ${walkIn.name} (${walkIn.walkId}) — duration: ${calcDuration(walkIn.checkIn, walkIn.checkOut)}`,
    });

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── GET /api/walkin/today ────────────────────────────────────────────────────
export const getTodayWalkIns = async (req: AuthRequest, res: Response) => {
  try {
    const today = getTodayDate();
    const walkIns = await WalkIn.find({ date: today })
      .populate("staffId", "name username")
      .sort({ checkIn: -1 });
    return res.status(200).json({
      success: true,
      date: today,
      summary: buildSummary(walkIns),
      walkIns,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── GET /api/walkin/history ──────────────────────────────────────────────────
export const getWalkInHistory = async (req: AuthRequest, res: Response) => {
  try {
    const {
      date,
      from,
      to,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = {};

    if (date) {
      filter.date = date;
    } else if (from || to) {
      const rangeFilter: Record<string, string> = {};
      if (from) rangeFilter.$gte = from;
      if (to) rangeFilter.$lte = to;
      filter.date = rangeFilter;
    } else {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filter.date = {
        $gte: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
        }).format(sevenDaysAgo),
      };
    }

    const [walkIns, total, allForRange] = await Promise.all([
      WalkIn.find(filter)
        .populate("staffId", "name username")
        .sort({ date: -1, checkIn: -1 })
        .skip(skip)
        .limit(limitNum),
      WalkIn.countDocuments(filter),
      WalkIn.find(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      summary: buildSummary(allForRange),
      walkIns,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── GET /api/walkin/yesterday-revenue ───────────────────────────────────────
export const getYesterdayRevenue = async (req: AuthRequest, res: Response) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(yesterday);

    const walkIns = await WalkIn.find({ date: yesterdayStr });
    const revenue = walkIns.reduce((sum, w) => sum + w.amount, 0);
    const total = walkIns.length;

    return res
      .status(200)
      .json({ success: true, date: yesterdayStr, revenue, total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};

// ─── POST /api/walkin/kiosk-checkout (public) ─────────────────────────────────
// No logAction here — kiosk is public, no authenticated user
export const kioskCheckOut = async (req: AuthRequest, res: Response) => {
  try {
    const { walkId }: WalkInCheckOutInput = req.body;
    const today = getTodayDate();

    const walkIn = await WalkIn.findOne({
      walkId: walkId.toUpperCase(),
      date: today,
    });
    if (!walkIn)
      return res.status(404).json({
        success: false,
        message: `ID "${walkId}" not found for today. Please see the front desk.`,
      });
    if (walkIn.isCheckedOut)
      return res.status(400).json({
        success: false,
        message: "You have already checked out. Have a great day! 👋",
      });

    walkIn.checkOut = new Date();
    walkIn.isCheckedOut = true;
    await walkIn.save();

    const duration = calcDuration(walkIn.checkIn, walkIn.checkOut);

    return res.status(200).json({
      success: true,
      message: `Goodbye ${walkIn.name}! You spent ${duration} at the gym. See you again! 💪`,
      walkIn: {
        walkId: walkIn.walkId,
        name: walkIn.name,
        passType: walkIn.passType,
        duration,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};
