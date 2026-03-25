import { Response, Router } from "express";
import ActionLog from "../models/ActionLog";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { logAction } from "../utils/logAction";

const router = Router();

// Helper — convert a YYYY-MM-DD date string to Manila start/end of day in UTC
const toManilaStart = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Manila is UTC+8, so midnight Manila = 16:00 UTC previous day
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
};
const toManilaEnd = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  // End of Manila day = 15:59:59.999 UTC
  return new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
};

// GET /api/action-logs
// Owner → all logs with full filtering | Staff → only their own
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { role, id: userId } = req.user!;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const byRole = req.query.role as string | undefined;
    const byStaffId = req.query.staffId as string | undefined;

    const filter: Record<string, unknown> = {};

    // Staff can only ever see their own logs — enforced server-side
    if (role === "staff") {
      filter["performedBy.userId"] = userId;
    } else {
      if (byRole) filter["performedBy.role"] = byRole;
      if (byStaffId) filter["performedBy.userId"] = byStaffId;
    }

    if (action) filter.action = action;

    // Use Manila timezone-aware date boundaries
    if (from || to) {
      const tsFilter: Record<string, unknown> = {};
      if (from) tsFilter["$gte"] = toManilaStart(from);
      if (to) tsFilter["$lte"] = toManilaEnd(to);
      filter.timestamp = tsFilter;
    }

    const [logs, total] = await Promise.all([
      ActionLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActionLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch action logs" });
  }
});

// POST /api/action-logs/logout
// Called by the frontend BEFORE the token is cleared
router.post("/logout", protect, async (req: AuthRequest, res: Response) => {
  try {
    await logAction({
      action: "logout",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `${req.user!.name} (${req.user!.role}) logged out`,
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

export default router;
