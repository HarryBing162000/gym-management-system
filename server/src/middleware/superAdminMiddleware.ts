/**
 * superAdminMiddleware.ts
 * LakasGMS — Super Admin Auth Middleware
 *
 * Verifies the super admin JWT using SUPER_JWT_SECRET — completely
 * separate from the owner/staff JWT_SECRET. A super admin token
 * cannot access owner routes and vice versa.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface SuperAdminRequest extends Request {
  superAdmin?: { email: string };
}

export const protectSuperAdmin = (
  req: SuperAdminRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Not authorized — no token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.SUPER_JWT_SECRET as string,
    ) as { email: string };

    req.superAdmin = { email: decoded.email };
    return next();
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Not authorized — invalid token" });
  }
};
