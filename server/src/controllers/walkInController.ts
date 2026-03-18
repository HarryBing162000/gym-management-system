import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware";
import WalkIn from "../models/WalkIn";
import { WalkInInput, WalkInCheckOutInput } from "../middleware/authSchemas";

// Helper — get today's date as "YYYY-MM-DD"
const getTodayDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

// Helper — get today's pass price
const getPassAmount = (passType: "regular" | "student" | "couple"): number => {
  const prices: Record<string, number> = {
    regular: 150,
    student: 100,
    couple: 250,
  };
  return prices[passType] ?? 150;
};

// Helper — generate next WALK-XXX ID for today
// Resets daily — finds highest WALK number for today then increments
const generateWalkId = async (): Promise<string> => {
  const today = getTodayDate();

  const last = await WalkIn.findOne({ date: today })
    .sort({ walkId: -1 })
    .select("walkId");

  if (!last) return "WALK-001"; // first walk-in of the day

  const lastNum = parseInt(last.walkId.replace("WALK-", ""));
  return `WALK-${String(lastNum + 1).padStart(3, "0")}`;
};

// =================== REGISTER WALK-IN ===================
// POST /api/walkin/register
// Only staff and owner can register a walk-in
export const registerWalkIn = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, passType }: WalkInInput = req.body;

    const walkId = await generateWalkId();
    const today = getTodayDate();
    const amount = getPassAmount(passType);

    const walkIn = await WalkIn.create({
      walkId,
      name,
      phone,
      passType,
      amount,
      date: today,
      checkIn: new Date(),
      staffId: req.user!.id, // records which staff processed it
      isCheckedOut: false,
    });

    return res.status(201).json({
      success: true,
      message: `Walk-in registered successfully`,
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
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== CHECK OUT WALK-IN ===================
// PATCH /api/walkin/checkout
// Can be done by staff OR by walk-in themselves via kiosk
export const checkOutWalkIn = async (req: AuthRequest, res: Response) => {
  try {
    const { walkId }: WalkInCheckOutInput = req.body;
    const today = getTodayDate();

    // Find today's walk-in with this ID
    const walkIn = await WalkIn.findOne({ walkId, date: today });

    if (!walkIn) {
      return res.status(404).json({
        success: false,
        message: `${walkId} not found for today. Make sure the ID is correct.`,
      });
    }

    if (walkIn.isCheckedOut) {
      return res.status(400).json({
        success: false,
        message: `${walkId} has already checked out.`,
      });
    }

    // Record checkout time
    walkIn.checkOut = new Date();
    walkIn.isCheckedOut = true;
    await walkIn.save();

    // Calculate time spent in gym
    const durationMs = walkIn.checkOut.getTime() - walkIn.checkIn.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return res.status(200).json({
      success: true,
      message: `Goodbye ${walkIn.name}! See you next time.`,
      walkIn: {
        walkId: walkIn.walkId,
        name: walkIn.name,
        passType: walkIn.passType,
        checkIn: walkIn.checkIn,
        checkOut: walkIn.checkOut,
        duration, // e.g. "1h 23m"
        isCheckedOut: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== GET TODAY'S WALK-INS ===================
// GET /api/walkin/today
// Staff and owner can view today's walk-ins
export const getTodayWalkIns = async (req: AuthRequest, res: Response) => {
  try {
    const today = getTodayDate();
    const walkIns = await WalkIn.find({ date: today })
      .populate("staffId", "name username") // show staff name instead of just ID
      .sort({ checkIn: -1 }); // newest first

    // Calculate today's revenue summary
    const totalRevenue = walkIns.reduce((sum, w) => sum + w.amount, 0);
    const regularCount = walkIns.filter((w) => w.passType === "regular").length;
    const studentCount = walkIns.filter((w) => w.passType === "student").length;
    const checkedOutCount = walkIns.filter((w) => w.isCheckedOut).length;
    const stillInsideCount = walkIns.filter((w) => !w.isCheckedOut).length;

    return res.status(200).json({
      success: true,
      date: today,
      summary: {
        total: walkIns.length,
        revenue: totalRevenue,
        regular: regularCount,
        student: studentCount,
        checkedOut: checkedOutCount,
        stillInside: stillInsideCount,
      },
      walkIns,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== KIOSK CHECKOUT ===================
// POST /api/walkin/kiosk-checkout
// Public endpoint — no auth needed (walk-in uses kiosk to check out)
export const kioskCheckOut = async (req: any, res: Response) => {
  try {
    const { walkId }: WalkInCheckOutInput = req.body;
    const today = getTodayDate();

    const walkIn = await WalkIn.findOne({
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
        message: `You have already checked out. Have a great day! 👋`,
      });
    }

    walkIn.checkOut = new Date();
    walkIn.isCheckedOut = true;
    await walkIn.save();

    const durationMs = walkIn.checkOut.getTime() - walkIn.checkIn.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

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
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
