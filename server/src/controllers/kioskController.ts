/**
 * kioskController.ts
 * LakasGMS — Public Kiosk Route Handlers
 *
 * All routes are protected by kioskAuth middleware (X-Kiosk-Token),
 * NOT by JWT. These are machine-level auth routes, not user-level.
 *
 * Routes handled:
 *   GET  /api/kiosk/search?q=          member search by name or GYM-ID
 *   POST /api/kiosk/member/checkin      check in by gymId
 *   POST /api/kiosk/member/checkout     check out by gymId
 *   GET  /api/kiosk/walkin/:walkId      walk-in lookup
 *   POST /api/kiosk/walkin/checkout     walk-in self-checkout
 */

import { Request, Response } from "express";
import Member from "../models/Member";
import User from "../models/User"; // still needed for staff auth context if required
import WalkIn from "../models/WalkIn";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayDate = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

// Strip regex metacharacters to prevent ReDoS / injection via search query
const sanitizeSearchQuery = (q: string): string =>
  q.replace(/[.*+?^${}()|[\]\\]/g, "").trim();

// Safe member projection — never expose password, _id, or internal fields
const MEMBER_PROJECTION = {
  _id: 0, // never expose MongoDB _id to public kiosk surface
  gymId: 1,
  name: 1,
  plan: 1,
  status: 1,
  expiresAt: 1,
  checkedIn: 1,
  photoUrl: 1,
};

// ─── GET /api/kiosk/search?q= ─────────────────────────────────────────────────
// Search members by name or GYM-ID, and walk-ins by name or WALK-ID.
// Returns members array + walkIns array for the UI to handle.

export const kioskSearch = async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.q ?? "").trim();

    if (!raw) {
      return res
        .status(400)
        .json({ success: false, message: "Search query is required." });
    }

    const q = sanitizeSearchQuery(raw);

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters.",
      });
    }

    const today = getTodayDate();
    let members: (typeof Member.prototype)[] = [];
    let walkIns: (typeof WalkIn.prototype)[] = [];

    if (/^GYM-\d+$/i.test(q)) {
      // Exact GYM-ID match
      members = await Member.find({ gymId: q.toUpperCase() }).select(
        MEMBER_PROJECTION,
      );
    } else if (/^WALK-?\d*/i.test(q)) {
      // Partial WALK-ID match — search today's walk-ins
      walkIns = await WalkIn.find({
        walkId: { $regex: `^${q.toUpperCase()}` },
        date: today,
      })
        .select("walkId name passType checkIn isCheckedOut date")
        .limit(5);
    } else {
      // Name search — members + today's walk-ins
      [members, walkIns] = await Promise.all([
        Member.find({ name: { $regex: q, $options: "i" } })
          .select(MEMBER_PROJECTION)
          .limit(5),
        WalkIn.find({ name: { $regex: q, $options: "i" }, date: today })
          .select("walkId name passType checkIn isCheckedOut date")
          .limit(3),
      ]);
    }

    if (!members.length && !walkIns.length) {
      return res.status(404).json({
        success: false,
        message: "No results found. Please check your name or ID.",
      });
    }

    return res.status(200).json({ success: true, members, walkIns });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/kiosk/member/checkin ───────────────────────────────────────────
// Check in a member by gymId.
// Blocks: inactive, expired, already checked in.

export const kioskMemberCheckIn = async (req: Request, res: Response) => {
  try {
    const { gymId } = req.body;

    if (!gymId) {
      return res.status(400).json({
        success: false,
        message: "gymId is required.",
      });
    }

    const member = await Member.findOne({
      gymId: String(gymId).toUpperCase(),
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    // Auto-expire if past expiresAt but status not yet updated
    if (member.status === "active" && member.expiresAt < new Date()) {
      member.status = "expired";
      await member.save();
    }

    // Status enforcement — backend is the source of truth, not the UI
    if (member.status === "expired") {
      return res.status(403).json({
        success: false,
        error: "MEMBERSHIP_EXPIRED",
        message: "Membership has expired. Please see the front desk.",
      });
    }

    if (member.status === "inactive") {
      return res.status(403).json({
        success: false,
        error: "MEMBERSHIP_INACTIVE",
        message: "Membership is inactive. Please see the front desk.",
      });
    }

    if (member.checkedIn) {
      return res.status(409).json({
        success: false,
        error: "ALREADY_CHECKED_IN",
        message: "Already checked in. See staff if this is an error.",
      });
    }

    member.checkedIn = true;
    member.lastCheckIn = new Date();
    await member.save();

    return res.status(200).json({
      success: true,
      message: `Welcome, ${member.name}! Have a great workout! 💪`,
      member: {
        gymId: member.gymId,
        name: member.name,
        plan: member.plan,
        checkedIn: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/kiosk/member/checkout ──────────────────────────────────────────
// Check out a member by gymId.
// Blocks: not currently checked in.

export const kioskMemberCheckOut = async (req: Request, res: Response) => {
  try {
    const { gymId } = req.body;

    if (!gymId) {
      return res.status(400).json({
        success: false,
        message: "gymId is required.",
      });
    }

    const member = await Member.findOne({
      gymId: String(gymId).toUpperCase(),
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    if (!member.checkedIn) {
      return res.status(409).json({
        success: false,
        error: "NOT_CHECKED_IN",
        message: "Not currently checked in. See staff if this is an error.",
      });
    }

    member.checkedIn = false;
    await member.save();

    return res.status(200).json({
      success: true,
      message: `See you next time, ${member.name}! 👋`,
      member: {
        gymId: member.gymId,
        name: member.name,
        checkedIn: false,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/kiosk/walkin/:walkId ────────────────────────────────────────────
// Look up a walk-in by WALK-XXX ID for today.
// Used by kiosk to display pass details before checkout.

export const kioskWalkInLookup = async (req: Request, res: Response) => {
  try {
    const walkId = String(req.params.walkId ?? "").toUpperCase();

    if (!walkId) {
      return res.status(400).json({
        success: false,
        message: "Walk-in ID is required.",
      });
    }

    // walkId is per-gym since multi-tenant fix; search by isCheckedOut: false
    // to avoid needing a gym timezone to determine "today"
    const walkIn = await WalkIn.findOne({ walkId, isCheckedOut: false });

    if (!walkIn) {
      return res.status(404).json({
        success: false,
        message: `${walkId} not found for today. Please see the front desk.`,
      });
    }

    return res.status(200).json({
      success: true,
      walkIn: {
        walkId: walkIn.walkId,
        name: walkIn.name,
        passType: walkIn.passType,
        checkIn: walkIn.checkIn,
        isCheckedOut: walkIn.isCheckedOut,
        date: walkIn.date,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/kiosk/walkin/checkout ──────────────────────────────────────────
// Walk-in self-checkout via kiosk.
// Replaces the old /api/walkin/kiosk-checkout endpoint.
// Double-checkout is blocked here AND was already blocked in walkInController.

export const kioskWalkInCheckOut = async (req: Request, res: Response) => {
  try {
    const { walkId } = req.body;

    if (!walkId) {
      return res.status(400).json({
        success: false,
        message: "walkId is required.",
      });
    }

    // walkId is per-gym since multi-tenant fix; search by isCheckedOut: false
    // to avoid needing a gym timezone to determine "today"
    const walkIn = await WalkIn.findOne({
      walkId: String(walkId).toUpperCase(),
      isCheckedOut: false,
    });

    if (!walkIn) {
      return res.status(404).json({
        success: false,
        message: `ID "${walkId}" not found for today. Please see the front desk.`,
      });
    }

    if (walkIn.isCheckedOut) {
      return res.status(409).json({
        success: false,
        error: "ALREADY_CHECKED_OUT",
        message: "You have already checked out. Have a great day! 👋",
      });
    }

    walkIn.checkOut = new Date();
    walkIn.isCheckedOut = true;
    await walkIn.save();

    // Duration calculation
    const durationMs = walkIn.checkOut.getTime() - walkIn.checkIn.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return res.status(200).json({
      success: true,
      message: `Goodbye ${walkIn.name}! You spent ${duration} at the gym. See you again! 💪`,
      walkIn: {
        walkId: walkIn.walkId,
        name: walkIn.name,
        passType: walkIn.passType,
        duration,
        isCheckedOut: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
