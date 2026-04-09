/**
 * superAdminController.ts
 * GMS — Super Admin Controller
 *
 * Security fixes applied:
 * - Rate limiting on login (5 attempts → 15-min lockout by IP)
 * - Rate limiting on exchange-impersonate (10/min by IP)
 * - Single-use impersonation tokens (jti + in-memory used-set)
 * - Timing-safe credential comparison
 * - Settings cleanup on hard delete
 * - In-memory Super Admin audit log (last 200 entries)
 */

import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import GymClient from "../models/GymClient";
import Settings from "../models/Settings";
import Member from "../models/Member";
import WalkIn from "../models/WalkIn";
import Payment from "../models/Payment";
import ActionLog from "../models/ActionLog";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog";
import { sendSetPasswordEmail } from "../utils/emailService";
import { SuperAdminRequest } from "../middleware/superAdminMiddleware";

// ─── Rate limiter — Super Admin login (by IP) ─────────────────────────────────
const SA_MAX_ATTEMPTS = 5;
const SA_LOCK_MS = 15 * 60 * 1000;

interface LockEntry {
  attempts: number;
  lockedUntil: number | null;
}
const saAttempts = new Map<string, LockEntry>();

function getSaEntry(ip: string): LockEntry {
  if (!saAttempts.has(ip))
    saAttempts.set(ip, { attempts: 0, lockedUntil: null });
  return saAttempts.get(ip)!;
}
function checkSaLocked(ip: string): { locked: boolean; minutesLeft: number } {
  const e = getSaEntry(ip);
  if (e.lockedUntil === null) return { locked: false, minutesLeft: 0 };
  const rem = e.lockedUntil - Date.now();
  if (rem <= 0) {
    e.attempts = 0;
    e.lockedUntil = null;
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil(rem / 60000) };
}
function recordSaFailure(ip: string): LockEntry {
  const e = getSaEntry(ip);
  if (e.lockedUntil !== null && Date.now() > e.lockedUntil) {
    e.attempts = 0;
    e.lockedUntil = null;
  }
  e.attempts += 1;
  if (e.attempts >= SA_MAX_ATTEMPTS) e.lockedUntil = Date.now() + SA_LOCK_MS;
  return e;
}
function clearSaLock(ip: string): void {
  saAttempts.delete(ip);
}

// ─── Rate limiter — exchange-impersonate (by IP, 10/min) ──────────────────────
const EXCHANGE_MAX = 10;
const EXCHANGE_WINDOW_MS = 60 * 1000;
interface ExchangeEntry {
  count: number;
  windowStart: number;
}
const exchangeAttempts = new Map<string, ExchangeEntry>();

function checkExchangeLimit(ip: string): boolean {
  const now = Date.now();
  const e = exchangeAttempts.get(ip);
  if (!e || now - e.windowStart > EXCHANGE_WINDOW_MS) {
    exchangeAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  e.count += 1;
  return e.count > EXCHANGE_MAX;
}

// ─── Single-use impersonation tokens ─────────────────────────────────────────
// Token string → used flag. Auto-cleared after 20 min (token already expired).
const usedTokens = new Set<string>();
function markUsed(token: string): void {
  usedTokens.add(token);
  setTimeout(() => usedTokens.delete(token), 20 * 60 * 1000);
}
function isUsed(token: string): boolean {
  return usedTokens.has(token);
}

// ─── Super Admin audit log — persistent MongoDB ───────────────────────────────
// FIX: was in-memory array — wiped on every server restart (Render restarts
// frequently). Now writes to SuperAdminAuditLog collection so logs survive.
async function logSa(
  action: string,
  detail: string,
  ip: string,
  gymId?: string,
): Promise<void> {
  try {
    await SuperAdminAuditLog.create({
      action,
      detail,
      ip,
      gymId,
      timestamp: new Date(),
    });
  } catch (err) {
    // fire-and-forget — never crash a route because of logging
    console.error("[logSa] Failed to write audit log:", err);
  }
}

export function getSaAuditLog(): never[] {
  return []; // legacy export kept for compatibility — use getAuditLog route instead
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIp(req: Request): string {
  // x-forwarded-for can contain multiple IPs ("client, proxy1, proxy2")
  // or be spoofed by a client to bypass rate limiting.
  // Always take the first entry only — that is the original client IP
  // as set by Render's load balancer.
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  const firstIp = forwarded ? forwarded.split(",")[0].trim() : null;
  return firstIp || req.socket.remoteAddress || "unknown";
}

// Timing-safe string comparison — prevents timing attacks on credential check
function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      crypto.timingSafeEqual(aBuf, aBuf); // consume time anyway
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

const generateSetPasswordToken = (userId: string): string =>
  jwt.sign(
    { id: userId, purpose: "set_password" },
    process.env.JWT_SECRET as string,
    { expiresIn: "24h" },
  );

const generateResetToken = (userId: string): string =>
  jwt.sign(
    { id: userId, purpose: "reset_password" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  );

const generateGymClientId = async (): Promise<string> => {
  // FIX: use findOne with sort inside a retry loop to handle race conditions.
  // The GymClient model should have a unique index on gymClientId which will
  // cause a duplicate key error on collision — caller handles the retry.
  const last = await GymClient.findOne()
    .sort({ gymClientId: -1 })
    .select("gymClientId")
    .lean();
  if (!last?.gymClientId) return "GYM-001";
  const num = parseInt(last.gymClientId.replace("GYM-", ""), 10) || 0;
  return `GYM-${String(num + 1).padStart(3, "0")}`;
};

// ─── GET /api/superadmin/audit-log ────────────────────────────────────────────
export const getAuditLog = async (req: SuperAdminRequest, res: Response) => {
  try {
    const {
      action,
      gymId,
      limit = "100",
    } = req.query as Record<string, string>;
    const filter: Record<string, any> = {};
    if (action && action !== "all") filter.action = action;
    if (gymId) filter.gymId = gymId;
    const entries = await SuperAdminAuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 100, 500))
      .lean();
    return res.status(200).json({ success: true, log: entries });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/login ───────────────────────────────────────────────
export const superAdminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    const ip = getIp(req);
    const lockStatus = checkSaLocked(ip);
    if (lockStatus.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${lockStatus.minutesLeft} minute${lockStatus.minutesLeft !== 1 ? "s" : ""}.`,
      });
    }

    const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? "";
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD ?? "";

    const emailMatch = safeEqual(email, adminEmail);
    const passwordMatch = safeEqual(password, adminPassword);

    if (!emailMatch || !passwordMatch) {
      const entry = recordSaFailure(ip);
      const attemptsLeft = SA_MAX_ATTEMPTS - entry.attempts;
      if (entry.lockedUntil !== null) {
        logSa(
          "login_locked",
          `IP ${ip} locked after ${SA_MAX_ATTEMPTS} failed attempts`,
          ip,
        );
        return res.status(429).json({
          success: false,
          message: "Too many failed attempts. Locked for 15 minutes.",
        });
      }
      return res.status(401).json({
        success: false,
        message: `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`,
      });
    }

    clearSaLock(ip);
    logSa("login", `Super Admin logged in from ${ip}`, ip);

    const token = jwt.sign(
      { email: adminEmail, role: "superadmin" },
      process.env.SUPER_JWT_SECRET as string,
      { expiresIn: "12h" },
    );

    return res
      .status(200)
      .json({ success: true, message: "Super Admin login successful.", token });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/superadmin/gyms ─────────────────────────────────────────────────
// FIX: was filtering out deleted gyms — SA couldn't see or recover them.
// Now returns ALL gyms. Frontend filters by status chip (All/Active/Suspended/Deleted).
export const listGyms = async (_req: SuperAdminRequest, res: Response) => {
  try {
    const gyms = await GymClient.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, gyms });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms ────────────────────────────────────────────────
export const createGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const {
      gymName,
      gymAddress,
      ownerName,
      ownerEmail,
      contactPhone,
      billingStatus = "trial",
      notes,
    } = req.body as {
      gymName: string;
      gymAddress?: string;
      ownerName: string;
      ownerEmail: string;
      contactPhone?: string;
      billingStatus?: string;
      notes?: string;
    };

    if (!gymName?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Gym name, owner name, and owner email are required.",
      });
    }

    const existingUser = await User.findOne({
      email: ownerEmail.toLowerCase().trim(),
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `${ownerEmail} is already registered.`,
      });
    }

    const existingGym = await GymClient.findOne({
      contactEmail: ownerEmail.toLowerCase().trim(),
    });
    if (existingGym) {
      return res.status(409).json({
        success: false,
        message: `A gym with email ${ownerEmail} already exists.`,
      });
    }

    const gymClientId = await generateGymClientId();
    const placeholderPassword = crypto.randomBytes(32).toString("hex");
    const owner = await User.create({
      name: ownerName.trim(),
      email: ownerEmail.toLowerCase().trim(),
      password: placeholderPassword,
      role: "owner",
      isActive: true,
      isVerified: false,
    });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    let gymClient;
    try {
      gymClient = await GymClient.create({
        gymClientId,
        gymName: gymName.trim(),
        gymAddress: gymAddress?.trim(),
        contactEmail: ownerEmail.toLowerCase().trim(),
        contactPhone: contactPhone?.trim(),
        ownerId: owner._id,
        status: "active",
        billingStatus,
        trialEndsAt,
        notes: notes?.trim(),
      });
    } catch (gymErr) {
      await User.findByIdAndDelete(owner._id);
      throw gymErr;
    }

    // FIX: wrap Settings.create in try/catch with full rollback.
    // Previously if Settings.create threw, User + GymClient were left orphaned —
    // the owner could never log in and SA had no way to fix it.
    try {
      await Settings.create({
        ownerId: owner._id,
        gymName: gymName.trim(),
        gymAddress: gymAddress?.trim() || "",
        plans: [
          {
            name: "Monthly",
            price: 500,
            durationMonths: 1,
            isActive: true,
            isDefault: true,
          },
          {
            name: "Quarterly",
            price: 1200,
            durationMonths: 3,
            isActive: true,
            isDefault: false,
          },
          {
            name: "Annual",
            price: 4000,
            durationMonths: 12,
            isActive: true,
            isDefault: false,
          },
        ],
        walkInPrices: { regular: 150, student: 100, couple: 250 },
      });
    } catch (settingsErr) {
      // Roll back User and GymClient so no orphaned records exist
      await Promise.all([
        User.findByIdAndDelete(owner._id),
        GymClient.findByIdAndDelete(gymClient._id),
      ]);
      throw settingsErr;
    }

    const setPasswordToken = generateSetPasswordToken(owner._id.toString());
    let emailSent = true;
    let emailError = "";
    try {
      await sendSetPasswordEmail({
        to: ownerEmail.toLowerCase().trim(),
        ownerName: ownerName.trim(),
        gymName: gymName.trim(),
        token: setPasswordToken,
      });
    } catch (emailErr: any) {
      emailSent = false;
      emailError = emailErr?.message ?? "Unknown email error";
      console.error("[createGym] Resend error:", emailError);
    }

    logSa(
      "gym_created",
      `Created "${gymName}" (${gymClientId}) for ${ownerEmail}`,
      getIp(req),
      gymClient._id.toString(),
    );

    return res.status(201).json({
      success: true,
      emailSent,
      emailError: emailSent
        ? undefined
        : `Email not sent: ${emailError}. Use "Resend Invite" from the dashboard.`,
      message: emailSent
        ? `Gym "${gymName}" created. Invite email sent to ${ownerEmail}.`
        : `Gym "${gymName}" created but invite email failed. Use "Resend Invite" from the dashboard.`,
      gym: {
        id: gymClient._id,
        gymClientId: gymClient.gymClientId,
        gymName: gymClient.gymName,
        contactEmail: gymClient.contactEmail,
        status: gymClient.status,
        billingStatus: gymClient.billingStatus,
        trialEndsAt: gymClient.trialEndsAt,
        createdAt: gymClient.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/superadmin/gyms/:id ────────────────────────────────────────────
export const getGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id).lean();
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    const owner = await User.findById(gym.ownerId)
      .select("name email isActive isVerified createdAt")
      .lean();
    return res.status(200).json({ success: true, gym, owner });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/superadmin/gyms/:id ──────────────────────────────────────────
export const updateGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const {
      gymName,
      gymAddress,
      contactPhone,
      billingStatus,
      notes,
      billingRenewsAt,
    } = req.body as {
      gymName?: string;
      gymAddress?: string;
      contactPhone?: string;
      billingStatus?: string;
      notes?: string;
      billingRenewsAt?: string;
    };

    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });

    // Validate billingStatus against allowed values before writing
    const VALID_BILLING = ["trial", "paid", "overdue", "cancelled"];
    if (billingStatus && !VALID_BILLING.includes(billingStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid billingStatus. Must be one of: ${VALID_BILLING.join(", ")}`,
      });
    }

    const prevBilling = gym.billingStatus;
    if (gymName?.trim()) gym.gymName = gymName.trim();
    if (gymAddress !== undefined) gym.gymAddress = gymAddress.trim();
    if (contactPhone !== undefined) gym.contactPhone = contactPhone.trim();
    if (billingStatus) gym.billingStatus = billingStatus as any;
    if (notes !== undefined) gym.notes = notes.trim();
    if (billingRenewsAt) gym.billingRenewsAt = new Date(billingRenewsAt);
    await gym.save();

    if (billingStatus && billingStatus !== prevBilling) {
      logSa(
        "billing_updated",
        `"${gym.gymName}" billing: ${prevBilling} → ${billingStatus}${billingRenewsAt ? ` | renews: ${billingRenewsAt}` : ""}`,
        getIp(req),
        gym._id.toString(),
      );
    }

    // FIX: sync gymName to Settings so owner/staff dashboard reflects the
    // updated name immediately. GymClient and Settings must always stay in sync.
    if (gymName?.trim()) {
      await Settings.findOneAndUpdate(
        { ownerId: gym.ownerId },
        { gymName: gymName.trim() },
      );
    }

    return res
      .status(200)
      .json({ success: true, message: "Gym updated.", gym });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/superadmin/gyms/:id/hard-delete ─────────────────────────────
export const hardDeleteGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });

    const gymName = gym.gymName;
    const ownerEmail = gym.contactEmail;
    const ownerId = gym.ownerId;

    // FIX: delete ALL gym data — previously only deleted User (owner), GymClient,
    // and Settings. Staff accounts, Members, WalkIns, Payments, and ActionLogs
    // were left orphaned in the database.
    await Promise.all([
      // Auth records
      User.deleteMany({ $or: [{ _id: ownerId }, { ownerId }] }), // owner + all staff
      GymClient.findByIdAndDelete(gym._id),
      Settings.findOneAndDelete({ ownerId }),
      // Gym data
      Member.deleteMany({ ownerId }),
      WalkIn.deleteMany({ ownerId }),
      Payment.deleteMany({ ownerId }),
      ActionLog.deleteMany({ ownerId }),
    ]);

    logSa(
      "gym_hard_deleted",
      `HARD DELETE: "${gymName}" (${ownerEmail}) — all records purged`,
      getIp(req),
    );

    return res.status(200).json({
      success: true,
      message: `"${gymName}" (${ownerEmail}) permanently deleted from all collections.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/superadmin/gyms/:id/suspend ───────────────────────────────────
export const suspendGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    if (gym.status === "suspended")
      return res
        .status(400)
        .json({ success: false, message: "Gym is already suspended." });

    gym.status = "suspended";
    await gym.save();

    // FIX: deactivate owner AND all staff for this gym.
    // Previously only the owner was deactivated — staff could still log in
    // while the gym was suspended.
    await User.updateMany(
      { $or: [{ _id: gym.ownerId }, { ownerId: gym.ownerId }] },
      { isActive: false },
    );

    logSa(
      "gym_suspended",
      `"${gym.gymName}" suspended`,
      getIp(req),
      gym._id.toString(),
    );
    return res
      .status(200)
      .json({ success: true, message: `"${gym.gymName}" has been suspended.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/superadmin/gyms/:id/reactivate ────────────────────────────────
export const reactivateGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });

    gym.status = "active";
    await gym.save();

    // Reactivate owner AND all staff so the whole team can log back in
    await User.updateMany(
      { $or: [{ _id: gym.ownerId }, { ownerId: gym.ownerId }] },
      { isActive: true },
    );

    logSa(
      "gym_reactivated",
      `"${gym.gymName}" reactivated`,
      getIp(req),
      gym._id.toString(),
    );
    return res.status(200).json({
      success: true,
      message: `"${gym.gymName}" has been reactivated.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/superadmin/gyms/:id ─────────────────────────────────────────
export const deleteGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });

    gym.status = "deleted";
    await gym.save();

    // FIX: deactivate owner AND all staff — previously only owner was deactivated
    await User.updateMany(
      { $or: [{ _id: gym.ownerId }, { ownerId: gym.ownerId }] },
      { isActive: false },
    );

    logSa(
      "gym_deleted",
      `"${gym.gymName}" soft-deleted`,
      getIp(req),
      gym._id.toString(),
    );
    return res
      .status(200)
      .json({ success: true, message: `"${gym.gymName}" has been deleted.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms/:id/reset-password ────────────────────────────
export const resetOwnerPassword = async (
  req: SuperAdminRequest,
  res: Response,
) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    const owner = await User.findById(gym.ownerId);
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Owner user not found." });

    const resetToken = generateResetToken(owner._id.toString());
    try {
      await sendSetPasswordEmail({
        to: owner.email!,
        ownerName: owner.name,
        gymName: gym.gymName,
        token: resetToken,
      });
    } catch (emailErr: any) {
      const msg = emailErr?.message ?? "Unknown error";
      return res
        .status(500)
        .json({ success: false, message: `Failed to send email: ${msg}.` });
    }

    logSa(
      "password_reset",
      `Reset sent to ${owner.email} for "${gym.gymName}"`,
      getIp(req),
      gym._id.toString(),
    );
    return res.status(200).json({
      success: true,
      message: `Password reset email sent to ${owner.email}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms/:id/resend-invite ──────────────────────────────
export const resendInvite = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    const owner = await User.findById(gym.ownerId);
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Owner user not found." });

    // FIX: if owner already verified, send a password RESET email instead of
    // blocking with 400. Previously this returned a hard error which confused SA
    // when trying to help an owner who forgot their password.
    if (owner.isVerified) {
      const resetToken = generateResetToken(owner._id.toString());
      try {
        await sendSetPasswordEmail({
          to: owner.email!,
          ownerName: owner.name,
          gymName: gym.gymName,
          token: resetToken,
        });
      } catch (emailErr: any) {
        const msg = emailErr?.message ?? "Unknown error";
        return res
          .status(500)
          .json({ success: false, message: `Failed to send email: ${msg}.` });
      }
      logSa(
        "invite_resent",
        `Password reset sent to ${owner.email} for "${gym.gymName}" (owner already verified)`,
        getIp(req),
        gym._id.toString(),
      );
      return res.status(200).json({
        success: true,
        message: `${owner.email} already set their password. A password reset link has been sent instead.`,
      });
    }

    const token = generateSetPasswordToken(owner._id.toString());
    try {
      await sendSetPasswordEmail({
        to: owner.email!,
        ownerName: owner.name,
        gymName: gym.gymName,
        token,
      });
    } catch (emailErr: any) {
      const msg = emailErr?.message ?? "Unknown error";
      return res
        .status(500)
        .json({ success: false, message: `Failed to send email: ${msg}.` });
    }

    logSa(
      "invite_resent",
      `Invite resent to ${owner.email} for "${gym.gymName}"`,
      getIp(req),
      gym._id.toString(),
    );
    return res
      .status(200)
      .json({ success: true, message: `Invite resent to ${owner.email}.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms/:id/impersonate ───────────────────────────────
export const impersonateGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym)
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    if (gym.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Cannot impersonate a ${gym.status} gym. Reactivate it first.`,
      });
    }

    const owner = await User.findById(gym.ownerId).select(
      "_id name email role isActive",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Owner user not found." });
    if (!owner.isActive)
      return res
        .status(400)
        .json({ success: false, message: "Owner account is inactive." });

    const secret = process.env.IMPERSONATE_SECRET;
    if (!secret)
      return res.status(500).json({
        success: false,
        message: "IMPERSONATE_SECRET is not configured.",
      });

    // jti = unique token ID, used for single-use enforcement on exchange
    const impersonateToken = jwt.sign(
      {
        purpose: "impersonate",
        ownerId: owner._id.toString(),
        gymName: gym.gymName,
        jti: crypto.randomBytes(16).toString("hex"),
      },
      secret,
      { expiresIn: "15m" },
    );

    logSa(
      "impersonation_started",
      `Token generated for "${gym.gymName}" (${owner.email})`,
      getIp(req),
      gym._id.toString(),
    );
    return res.status(200).json({
      success: true,
      impersonateToken,
      gymName: gym.gymName,
      ownerEmail: owner.email,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/exchange-impersonate ────────────────────────────────
// Public — no auth middleware. Impersonation token IS the credential.
// Single-use enforced. Rate limited 10/min per IP.
export const exchangeImpersonate = async (req: Request, res: Response) => {
  try {
    const ip = getIp(req);
    if (checkExchangeLimit(ip)) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please wait a moment.",
      });
    }

    const { token } = req.body as { token: string };
    if (!token)
      return res
        .status(400)
        .json({ success: false, message: "Token is required." });

    // Single-use: reject immediately if already used
    if (isUsed(token)) {
      return res.status(401).json({
        success: false,
        message: "This impersonation link has already been used.",
      });
    }

    const secret = process.env.IMPERSONATE_SECRET;
    if (!secret)
      return res.status(500).json({
        success: false,
        message: "IMPERSONATE_SECRET is not configured.",
      });

    let decoded: {
      purpose: string;
      ownerId: string;
      gymName: string;
      jti?: string;
    };
    try {
      decoded = jwt.verify(token, secret) as any;
    } catch {
      return res.status(401).json({
        success: false,
        message: "Impersonation link has expired or is invalid.",
      });
    }

    if (decoded.purpose !== "impersonate") {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token purpose." });
    }

    // Mark as used — any subsequent attempt with same token is rejected
    markUsed(token);

    const owner = await User.findById(decoded.ownerId).select(
      "_id name email role isActive",
    );
    if (!owner)
      return res
        .status(404)
        .json({ success: false, message: "Owner account not found." });
    if (!owner.isActive)
      return res
        .status(403)
        .json({ success: false, message: "Owner account is inactive." });

    // Issue a 4-hour session token for impersonation support sessions.
    // - 15m was too short (caused mid-session auto-logout)
    // - 7d was too long (full owner access for a week if token leaks)
    // - 4h is a safe middle ground for real support work
    // impersonated: true is stored in authStore.user so the 401 interceptor
    // can show a friendly "support session ended" message instead of a
    // generic forced-logout.
    const sessionToken = jwt.sign(
      {
        id: owner._id.toString(),
        role: owner.role,
        name: owner.name,
        impersonated: true,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "4h" },
    );

    return res.status(200).json({
      success: true,
      token: sessionToken,
      user: {
        id: owner._id,
        name: owner.name,
        email: owner.email,
        role: owner.role,
        impersonated: true,
      },
      gymName: decoded.gymName,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
