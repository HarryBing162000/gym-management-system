import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: "owner" | "staff";
    name: string;
  };
}

// ─── protect ─────────────────────────────────────────────────────────────────
// Verifies JWT then does a live DB check on isActive.
//
// This means:
//   - If Super Admin suspends a gym  → owner isActive = false
//     → every subsequent owner request returns 401 immediately
//     → frontend catches 401 → clears authStore → redirects to /login
//
//   - If owner deactivates a staff   → staff isActive = false
//     → same flow — staff is kicked out on their next request
//
// The DB check adds ~1-5ms per request. Acceptable at this scale.

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

    // ── Live DB check — catches suspend and deactivate in real time ───────────
    const user = await User.findById(decoded.id).select("isActive").lean();
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

    req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
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
