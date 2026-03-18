/**
 * kioskAuth.ts
 * IronCore GMS — Kiosk Authentication Middleware
 *
 * Protects all /api/kiosk/* routes from unauthorized access.
 * Public kiosk terminal must send the X-Kiosk-Token header on every request.
 * The token is validated against KIOSK_SECRET in your .env file.
 *
 * Usage:
 *   import { kioskAuth } from "../middleware/kioskAuth";
 *   router.use(kioskAuth);
 *
 * This middleware is intentionally separate from jwtAuth — kiosk routes
 * are public-facing (no user login) but still need machine-level auth.
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const KIOSK_TOKEN_HEADER = "x-kiosk-token";
const MIN_SECRET_LENGTH = 32;

// ─── Startup validation ───────────────────────────────────────────────────────

const KIOSK_SECRET = process.env.KIOSK_SECRET;

if (!KIOSK_SECRET) {
  throw new Error(
    "[kioskAuth] KIOSK_SECRET is not set in environment variables. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

if (KIOSK_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `[kioskAuth] KIOSK_SECRET is too short (${KIOSK_SECRET.length} chars). ` +
      `Minimum length is ${MIN_SECRET_LENGTH} characters.`,
  );
}

// ─── Timing-safe comparison ───────────────────────────────────────────────────
// Prevents timing attacks that could be used to brute-force the token
// by measuring response time differences.

function safeCompare(a: string, b: string): boolean {
  // Strings must be same byte length for timingSafeEqual
  // We hash both to normalize length without leaking info
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function kioskAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.headers[KIOSK_TOKEN_HEADER];

  // Header missing entirely
  if (!token) {
    res.status(401).json({
      error: "KIOSK_AUTH_REQUIRED",
      message: "Missing X-Kiosk-Token header.",
    });
    return;
  }

  // Header present but wrong type (should be a string, not string[])
  if (Array.isArray(token)) {
    res.status(401).json({
      error: "KIOSK_AUTH_INVALID",
      message: "Malformed X-Kiosk-Token header.",
    });
    return;
  }

  // Timing-safe token comparison
  const isValid = safeCompare(token, KIOSK_SECRET!);

  if (!isValid) {
    // Generic message — don't hint whether token exists or not
    res.status(401).json({
      error: "KIOSK_AUTH_FAILED",
      message: "Invalid kiosk token.",
    });
    return;
  }

  next();
}
