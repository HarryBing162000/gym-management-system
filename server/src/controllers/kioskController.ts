/**
 * kioskController.ts
 * IronCore GMS — Public Kiosk Route Handlers
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
import User from "../models/User";
import WalkIn from "../models/WalkIn";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayDate = (): string => new Date().toISOString().split("T")[0];

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
// Search members by name or GYM-ID.
// Returns array — UI must handle multiple results for name disambiguation.

export const kioskSearch = async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.q ?? "").trim();

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Search query is required.",
      });
    }

    const q = sanitizeSearchQuery(raw);

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters.",
      });
    }

    let members;

    // GYM-ID exact match
    if (/^GYM-\d+$/i.test(q)) {
      members = await User.find({
        gymId: q.toUpperCase(),
        role: "member",
      }).select(MEMBER_PROJECTION);
    } else {
      // Name search — case-insensitive partial match
      // Capped at 5 results to prevent full-list scraping
      members = await User.find({
        name: { $regex: q, $options: "i" },
        role: "member",
      })
        .select(MEMBER_PROJECTION)
        .limit(5);
    }

    if (!members.length) {
      return res.status(404).json({
        success: false,
        message: "No member found. Please check your name or GYM-ID.",
      });
    }

    return res.status(200).json({
      success: true,
      members,
    });
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

    const member = await User.findOne({
      gymId: String(gymId).toUpperCase(),
      role: "member",
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
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

    const member = await User.findOne({
      gymId: String(gymId).toUpperCase(),
      role: "member",
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
    const today = getTodayDate();

    if (!walkId) {
      return res.status(400).json({
        success: false,
        message: "Walk-in ID is required.",
      });
    }

    const walkIn = await WalkIn.findOne({ walkId, date: today });

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

    const today = getTodayDate();
    const walkIn = await WalkIn.findOne({
      walkId: String(walkId).toUpperCase(),
      date: today,
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
      message: `Goodbye ${walkIn.name}! You spent ${duration} at IronCore. See you again! 💪`,
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
