import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import GymClient from "../models/GymClient";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: "owner" | "staff";
    name: string;
    ownerId: string; // always the gym owner's User._id
    // owner → same as id; staff → their User.ownerId
  };
}

// ─── protect ─────────────────────────────────────────────────────────────────
// Verifies JWT then does two live DB checks per request:
//
// Check 1 — isActive (existing behaviour):
//   Staff deactivated by owner  → isActive = false → 401 → kicked out
//
// Check 2 — Gym suspension (new):
//   Owner: looks up GymClient where ownerId = owner's own _id
//   Staff: looks up GymClient where ownerId = staff.ownerId (set at creation)
//   If GymClient.status === "suspended" → 401 → existing api.ts interceptor
//   auto-logouts and redirects to /login — no frontend changes needed.
//
// Existing staff with no ownerId (created before this fix): ownerIdToCheck
// will be null → suspension check is skipped safely. No crashes, no lockout.
//
// Two DB lookups add ~2–10ms per request. Fine at this scale.

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No token provided.",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      role: "owner" | "staff";
      name: string;
    };

    // ── Check 1: isActive ─────────────────────────────────────────────────────
    // Also select ownerId so staff can be traced to their gym below.
    const user = await User.findById(decoded.id)
      .select("isActive ownerId")
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Account not found.",
      });
    }
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message:
          decoded.role === "owner"
            ? "Your gym account has been suspended. Please contact support."
            : "Your account has been deactivated. Please contact the gym owner.",
      });
    }

    // ── Check 2: Gym suspension ───────────────────────────────────────────────
    // Owner  → their own _id is the GymClient's ownerId
    // Staff  → their ownerId field points to the owner's _id
    const ownerIdToCheck =
      decoded.role === "owner"
        ? decoded.id
        : ((user as any).ownerId?.toString() ?? null);

    if (ownerIdToCheck) {
      const suspendedGym = await GymClient.findOne({
        ownerId: ownerIdToCheck,
        status: "suspended",
      })
        .select("_id")
        .lean();

      if (suspendedGym) {
        // Use 401 (not 403) so the existing api.ts response interceptor
        // handles it automatically — no frontend changes needed.
        return res.status(401).json({
          success: false,
          message:
            "Your gym account has been suspended. Please contact support.",
        });
      }
    }

    // ownerId = the gym owner's User._id.
    // For owners: same as their own id.
    // For staff: their User.ownerId field (set at creation).
    // Every controller uses req.user.ownerId to scope DB queries to one gym.
    const ownerId =
      decoded.role === "owner"
        ? decoded.id
        : ((user as any).ownerId?.toString() ?? decoded.id);

    req.user = {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name,
      ownerId,
    };
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Token invalid or expired.",
    });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};
