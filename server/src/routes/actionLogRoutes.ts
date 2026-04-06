import { Response, Router } from "express";
import ActionLog from "../models/ActionLog";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { logAction } from "../utils/logAction";

const router = Router();

// Helper — convert a YYYY-MM-DD date string to Manila start/end of day in UTC
const toManilaStart = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0, 0));
};
const toManilaEnd = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -8, 0, 0, -1));
};

// GET /api/action-logs
// Owner → all logs for their gym | Staff → only their own logs within their gym
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { role, id: userId, ownerId } = req.user!;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const byRole = req.query.role as string | undefined;
    const byStaffId = req.query.staffId as string | undefined;

    // Always scope to the gym — ownerId is the gym owner's User._id
    const filter: Record<string, unknown> = { ownerId };

    // Staff can only ever see their own logs — enforced server-side
    if (role === "staff") {
      filter["performedBy.userId"] = userId;
    } else {
      // Owner can filter by role or specific staff member
      if (byRole) filter["performedBy.role"] = byRole;
      if (byStaffId) filter["performedBy.userId"] = byStaffId;
    }

    if (action) filter.action = action;

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
      ownerId: req.user!.ownerId,
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
