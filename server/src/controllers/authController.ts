import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import Settings from "../models/Settings";
import { cloudinary } from "../middleware/upload";
import { AuthRequest } from "../middleware/authMiddleware";
import { logAction } from "../utils/logAction";
import { sendResetPasswordEmail } from "../utils/emailService";
import {
  RegisterOwnerInput,
  RegisterStaffInput,
  LoginOwnerInput,
  LoginStaffInput,
  UpdatePasswordInput,
  UpdateEmailInput,
  UpdateGymInput,
} from "../middleware/authSchemas";

// ─── Login rate limiter ───────────────────────────────────────────────────────
// Per-account in-memory store. Keyed by "role:identifier".
// 5 failed attempts → 15-minute lockout on THAT account only.
// Other accounts are completely unaffected until they hit 5 wrong attempts too.
// Resets automatically after the lockout window expires, or on successful login.

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LockEntry {
  attempts: number;
  lockedUntil: number | null; // epoch ms, null = not locked
}

const loginAttempts = new Map<string, LockEntry>();

function getLockEntry(key: string): LockEntry {
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { attempts: 0, lockedUntil: null });
  }
  return loginAttempts.get(key)!;
}

function checkLocked(key: string): { locked: boolean; minutesLeft: number } {
  const entry = getLockEntry(key);
  if (entry.lockedUntil === null) return { locked: false, minutesLeft: 0 };
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    // Lock expired — auto-clear
    entry.attempts = 0;
    entry.lockedUntil = null;
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil(remaining / 60000) };
}

function recordFailure(key: string): LockEntry {
  const entry = getLockEntry(key);
  // If a previous lock has expired, reset before recording
  if (entry.lockedUntil !== null && Date.now() > entry.lockedUntil) {
    entry.attempts = 0;
    entry.lockedUntil = null;
  }
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_DURATION_MS;
  }
  return entry;
}

function clearLock(key: string): void {
  loginAttempts.delete(key);
}

// ─── Token generator ──────────────────────────────────────────────────────────

const generateToken = (
  id: string,
  role: "owner" | "staff",
  name: string,
): string => {
  return jwt.sign({ id, role, name }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any,
  });
};

// =================== REGISTER OWNER ===================
export const registerOwner = async (req: Request, res: Response) => {
  try {
    const { name, email, password }: RegisterOwnerInput = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });
    }

    const user = await User.create({ name, email, password, role: "owner" });
    const token = generateToken(user._id.toString(), user.role, user.name);

    return res.status(201).json({
      success: true,
      message: "Owner account created",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== REGISTER STAFF ===================
export const registerStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { name, username, password }: RegisterStaffInput = req.body;

    const exists = await User.findOne({ username });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Username already taken. Please choose another.",
      });
    }

    const user = await User.create({
      name,
      username,
      password,
      role: "staff",
      ownerId: req.user!.id, // links staff to their owner's gym
    });
    const token = generateToken(user._id.toString(), user.role, user.name);

    return res.status(201).json({
      success: true,
      message: "Staff account created",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== LOGIN OWNER ===================
export const loginOwner = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginOwnerInput = req.body;
    const lockKey = `owner:${email.toLowerCase().trim()}`;

    // ── Check lockout ─────────────────────────────────────────────────────────
    const lockStatus = checkLocked(lockKey);
    if (lockStatus.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. This account is locked for ${lockStatus.minutesLeft} more minute${lockStatus.minutesLeft !== 1 ? "s" : ""}.`,
      });
    }

    const user = await User.findOne({ email, role: "owner" }).select(
      "+password",
    );
    if (!user) {
      recordFailure(lockKey);
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const entry = recordFailure(lockKey);
      const attemptsLeft = MAX_ATTEMPTS - entry.attempts;

      if (entry.lockedUntil !== null) {
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. This account is locked for 15 minutes.`,
        });
      }

      return res.status(401).json({
        success: false,
        message: `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining before lockout.`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Contact support.",
      });
    }

    // ── Success — clear any failed attempts ───────────────────────────────────
    clearLock(lockKey);

    const token = generateToken(user._id.toString(), user.role, user.name);

    await logAction({
      action: "login",
      performedBy: {
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
      },
      detail: `${user.name} (owner) logged in`,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== LOGIN STAFF ===================
export const loginStaff = async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginStaffInput = req.body;
    const lockKey = `staff:${username.toLowerCase().trim()}`;

    // ── Check lockout ─────────────────────────────────────────────────────────
    const lockStatus = checkLocked(lockKey);
    if (lockStatus.locked) {
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. This account is locked for ${lockStatus.minutesLeft} more minute${lockStatus.minutesLeft !== 1 ? "s" : ""}.`,
      });
    }

    const user = await User.findOne({
      username: username.toLowerCase(),
      role: "staff",
    }).select("+password");

    if (!user) {
      recordFailure(lockKey);
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const entry = recordFailure(lockKey);
      const attemptsLeft = MAX_ATTEMPTS - entry.attempts;

      if (entry.lockedUntil !== null) {
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. This account is locked for 15 minutes.`,
        });
      }

      return res.status(401).json({
        success: false,
        message: `Invalid username or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining before lockout.`,
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Contact the owner.",
      });
    }

    // ── Success — clear any failed attempts ───────────────────────────────────
    clearLock(lockKey);

    const token = generateToken(user._id.toString(), user.role, user.name);

    await logAction({
      action: "login",
      performedBy: {
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
      },
      detail: `${user.name} (staff) logged in`,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== LIST STAFF ===================
export const listStaff = async (req: Request, res: Response) => {
  try {
    const staff = await User.find({ role: "staff" })
      .select("name username isActive createdAt")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, staff });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== DEACTIVATE STAFF ===================
export const deactivateStaff = async (req: Request, res: Response) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "staff" },
      { isActive: false },
      { returnDocument: "after" },
    ).select("name username isActive");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Staff not found" });
    return res.status(200).json({ success: true, staff: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== REACTIVATE STAFF ===================
export const reactivateStaff = async (req: Request, res: Response) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "staff" },
      { isActive: true },
      { returnDocument: "after" },
    ).select("name username isActive");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Staff not found" });
    return res.status(200).json({ success: true, staff: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== GET ME ===================
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPDATE PASSWORD ===================
export const updatePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword }: UpdatePasswordInput = req.body;

    const user = await User.findById(req.user?.id).select("+password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });

    const isSame = await user.comparePassword(newPassword);
    if (isSame)
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });

    user.password = newPassword;
    await user.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `${req.user!.name} changed their password`,
    });

    return res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPDATE EMAIL ===================
export const updateEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { newEmail, password }: UpdateEmailInput = req.body;

    const user = await User.findById(req.user?.id).select("+password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Password is incorrect" });

    const emailExists = await User.findOne({
      email: newEmail,
      _id: { $ne: req.user?.id },
    });
    if (emailExists)
      return res.status(409).json({
        success: false,
        message: "Email is already in use by another account",
      });

    if (user.email === newEmail)
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email",
      });

    user.email = newEmail;
    await user.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `${req.user!.name} updated their email`,
    });

    return res.status(200).json({
      success: true,
      message: "Email updated successfully",
      email: user.email,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPDATE GYM INFO ===================
export const updateGym = async (req: AuthRequest, res: Response) => {
  try {
    const { gymName, gymAddress }: UpdateGymInput = req.body;

    const settings = await Settings.findOneAndUpdate(
      {},
      { gymName, gymAddress },
      { upsert: true, new: true, runValidators: true },
    );

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Gym info updated — name: "${gymName}", address: "${gymAddress}"`,
    });

    return res.status(200).json({
      success: true,
      message: "Gym information updated successfully",
      settings: {
        gymName: settings.gymName,
        gymAddress: settings.gymAddress,
        logoUrl: settings.logoUrl || null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== GET GYM INFO ===================
export const getGymInfo = async (_req: Request, res: Response) => {
  try {
    const settings = await Settings.findOne({});
    const activePlans = settings?.plans?.filter((p) => p.isActive) ?? [];

    return res.status(200).json({
      success: true,
      settings: settings
        ? {
            gymName: settings.gymName,
            gymAddress: settings.gymAddress,
            logoUrl: settings.logoUrl || null,
            plans: activePlans,
            walkInPrices: settings.walkInPrices ?? {
              regular: 150,
              student: 100,
              couple: 250,
            },
            closingTime: settings.closingTime ?? "22:00",
            timezone: settings.timezone ?? "Asia/Manila", // ← ADD
          }
        : {
            gymName: process.env.GYM_NAME || "Gym",
            gymAddress: process.env.GYM_ADDRESS || "",
            logoUrl: null,
            plans: [],
            walkInPrices: { regular: 150, student: 100, couple: 250 },
            closingTime: "22:00",
            timezone: "Asia/Manila", // ← ADD
          },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPLOAD LOGO ===================
export const uploadLogoController = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file)
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please select an image.",
      });

    const file = req.file as Express.Multer.File & {
      path: string;
      filename: string;
    };
    const currentSettings = await Settings.findOne({});
    if (currentSettings?.logoPublicId) {
      await cloudinary.uploader.destroy(currentSettings.logoPublicId);
    }

    const settings = await Settings.findOneAndUpdate(
      {},
      { logoUrl: file.path, logoPublicId: file.filename },
      { upsert: true, new: true, runValidators: true },
    );

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `${req.user!.name} uploaded a new gym logo`,
    });

    return res.status(200).json({
      success: true,
      message: "Logo uploaded successfully",
      logoUrl: settings.logoUrl,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== DELETE LOGO ===================
export const deleteLogo = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await Settings.findOne({});
    if (!settings?.logoPublicId)
      return res
        .status(404)
        .json({ success: false, message: "No logo found to delete" });

    await cloudinary.uploader.destroy(settings.logoPublicId);
    await Settings.findOneAndUpdate(
      {},
      { logoUrl: null, logoPublicId: null },
      { new: true },
    );

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `${req.user!.name} deleted the gym logo`,
    });

    return res
      .status(200)
      .json({ success: true, message: "Logo deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== PLAN MANAGEMENT ===================

export const getPlans = async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await Settings.findOne({});
    return res
      .status(200)
      .json({ success: true, plans: settings?.plans ?? [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const addPlan = async (req: AuthRequest, res: Response) => {
  try {
    const { name, price, durationMonths } = req.body as {
      name: string;
      price: number;
      durationMonths: number;
    };

    if (!name || name.trim().length < 2)
      return res.status(400).json({
        success: false,
        message: "Plan name must be at least 2 characters.",
      });
    if (price == null || price < 0)
      return res
        .status(400)
        .json({ success: false, message: "Price must be zero or positive." });
    if (!durationMonths || durationMonths < 1 || durationMonths > 24)
      return res.status(400).json({
        success: false,
        message: "Duration must be between 1 and 24 months.",
      });

    const settings = await Settings.findOne({});
    if (!settings)
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });

    const exists = settings.plans.some(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (exists)
      return res.status(409).json({
        success: false,
        message: `A plan named "${name}" already exists.`,
      });

    settings.plans.push({
      name: name.trim(),
      price,
      durationMonths,
      isActive: true,
      isDefault: false,
    });
    await settings.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Plan "${name.trim()}" added — ₱${price} / ${durationMonths} month(s)`,
    });

    return res.status(201).json({
      success: true,
      message: `Plan "${name}" added.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updatePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { planId } = req.params;
    const { price, durationMonths, isActive, name } = req.body as {
      price?: number;
      durationMonths?: number;
      isActive?: boolean;
      name?: string;
    };

    const settings = await Settings.findOne({});
    if (!settings)
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });

    const plan = settings.plans.find(
      (p) => (p as any)._id.toString() === planId,
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found." });

    if (name != null && name.trim().length >= 2) {
      const dup = settings.plans.some(
        (p) =>
          (p as any)._id.toString() !== planId &&
          p.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (dup)
        return res.status(409).json({
          success: false,
          message: `A plan named "${name}" already exists.`,
        });
      if (!plan.isDefault) plan.name = name.trim();
    }
    if (price != null && price >= 0) plan.price = price;
    if (durationMonths != null && durationMonths >= 1 && durationMonths <= 24)
      plan.durationMonths = durationMonths;
    if (isActive != null) plan.isActive = isActive;

    await settings.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Plan "${plan.name}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" updated.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deletePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { planId } = req.params;

    const settings = await Settings.findOne({});
    if (!settings)
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });

    const planIndex = settings.plans.findIndex(
      (p) => (p as any)._id.toString() === planId,
    );
    if (planIndex === -1)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found." });

    const plan = settings.plans[planIndex];
    if (plan.isDefault) {
      return res.status(400).json({
        success: false,
        message: `"${plan.name}" is a default plan and cannot be deleted. You can deactivate it instead.`,
      });
    }

    settings.plans.splice(planIndex, 1);
    await settings.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Plan "${plan.name}" deleted`,
    });

    return res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" deleted.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== WALK-IN PRICES + CLOSING TIME ===================
export const updateWalkInPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { regular, student, couple, closingTime, timezone } = req.body as {
      regular?: number;
      student?: number;
      couple?: number;
      closingTime?: string;
      timezone?: string; // ← ADD
    };

    const settings = await Settings.findOne({});
    if (!settings)
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });

    if (regular != null && regular >= 0)
      settings.walkInPrices.regular = regular;
    if (student != null && student >= 0)
      settings.walkInPrices.student = student;
    if (couple != null && couple >= 0) settings.walkInPrices.couple = couple;

    if (closingTime && /^\d{2}:\d{2}$/.test(closingTime)) {
      settings.closingTime = closingTime;
    }
    if (timezone && timezone.trim().length > 0) {
      settings.timezone = timezone.trim();
    }
    await settings.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Walk-in prices updated — regular: ₱${settings.walkInPrices.regular}, student: ₱${settings.walkInPrices.student}, couple: ₱${settings.walkInPrices.couple}${closingTime ? ` · closing time: ${closingTime}` : ""}`,
    });

    return res.status(200).json({
      success: true,
      message: "Walk-in prices updated.",
      walkInPrices: settings.walkInPrices,
      closingTime: settings.closingTime ?? "22:00",
      timezone: settings.timezone ?? "Asia/Manila", // ← ADD
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== SET PASSWORD ===================
export const setPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token: string; password: string };

    if (!token || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Token and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    let decoded: { id: string; purpose: string };
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    } catch {
      return res.status(400).json({
        success: false,
        message:
          "This link has expired or is invalid. Ask your administrator to resend the invite.",
      });
    }

    if (
      decoded.purpose !== "set_password" &&
      decoded.purpose !== "reset_password"
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid token purpose." });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found." });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is suspended. Contact your administrator.",
      });
    }

    user.password = password;
    user.isVerified = true;
    await user.save();

    const authToken = jwt.sign(
      { id: user._id.toString(), role: user.role, name: user.name },
      process.env.JWT_SECRET as string,
      { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any },
    );

    await logAction({
      action: "login",
      performedBy: {
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
      },
      detail: `${user.name} (owner) set their password and logged in`,
    });

    return res.status(200).json({
      success: true,
      message: "Password set successfully. Welcome!",
      token: authToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== FORGOT PASSWORD ===================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email: string };

    if (!email?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      role: "owner",
    });

    const genericMessage =
      "If that email is registered, you will receive a reset link shortly.";

    if (!user || !user.isActive) {
      return res.status(200).json({ success: true, message: genericMessage });
    }

    const resetToken = jwt.sign(
      { id: user._id.toString(), purpose: "reset_password" },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" },
    );

    await sendResetPasswordEmail({
      to: user.email!,
      ownerName: user.name,
      token: resetToken,
    });

    return res.status(200).json({ success: true, message: genericMessage });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== RESET PASSWORD ===================
export const resetPassword = async (req: Request, res: Response) => {
  return setPassword(req, res);
};
