/**
 * superAdminController.ts
 * GMS — Super Admin Controller
 *
 * All routes require protectSuperAdmin middleware.
 * Credentials come from environment variables — no DB record for super admin.
 *
 * Routes:
 *   POST   /api/superadmin/login
 *   GET    /api/superadmin/gyms
 *   POST   /api/superadmin/gyms
 *   GET    /api/superadmin/gyms/:id
 *   PATCH  /api/superadmin/gyms/:id
 *   PATCH  /api/superadmin/gyms/:id/suspend
 *   PATCH  /api/superadmin/gyms/:id/reactivate
 *   DELETE /api/superadmin/gyms/:id
 *   POST   /api/superadmin/gyms/:id/reset-password
 *   POST   /api/superadmin/gyms/:id/resend-invite
 */

import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import GymClient from "../models/GymClient";
import Settings from "../models/Settings";
import { sendSetPasswordEmail } from "../utils/emailService";
import { SuperAdminRequest } from "../middleware/superAdminMiddleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSetPasswordToken = (userId: string): string => {
  // Signed with JWT_SECRET (owner-side secret) so the set-password
  // endpoint can verify it without knowing about super admin at all.
  return jwt.sign(
    { id: userId, purpose: "set_password" },
    process.env.JWT_SECRET as string,
    { expiresIn: "24h" },
  );
};

const generateResetToken = (userId: string): string => {
  return jwt.sign(
    { id: userId, purpose: "reset_password" },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  );
};

// ─── Generate GymClient ID (GYM-001, GYM-002...) ─────────────────────────────
const generateGymClientId = async (): Promise<string> => {
  const last = await GymClient.findOne()
    .sort({ createdAt: -1 })
    .select("gymClientId")
    .lean();
  if (!last?.gymClientId) return "GYM-001";
  const num = parseInt(last.gymClientId.replace("GYM-", ""), 10) || 0;
  return `GYM-${String(num + 1).padStart(3, "0")}`;
};

// ─── POST /api/superadmin/login ───────────────────────────────────────────────
export const superAdminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    // Credentials live in env — no DB lookup needed
    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (email !== adminEmail || password !== adminPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    const token = jwt.sign(
      { email: adminEmail, role: "superadmin" },
      process.env.SUPER_JWT_SECRET as string,
      { expiresIn: "12h" },
    );

    return res.status(200).json({
      success: true,
      message: "Super Admin login successful.",
      token,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /api/superadmin/gyms ─────────────────────────────────────────────────
export const listGyms = async (_req: SuperAdminRequest, res: Response) => {
  try {
    const gyms = await GymClient.find({ status: { $ne: "deleted" } })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, gyms });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms ────────────────────────────────────────────────
// Creates owner User + GymClient + Settings + sends set-password email
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

    // Validate required fields
    if (!gymName?.trim() || !ownerName?.trim() || !ownerEmail?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Gym name, owner name, and owner email are required.",
      });
    }

    // Check email not already in use
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

    // Generate human-readable gym client ID (GYM-001, GYM-002...)
    const gymClientId = await generateGymClientId();

    // Create owner User with a random placeholder password.
    // isVerified: false — they cannot log in until they set their password.
    // The placeholder is never usable because it's a random hash they don't know.
    const placeholderPassword = crypto.randomBytes(32).toString("hex");
    const owner = await User.create({
      name: ownerName.trim(),
      email: ownerEmail.toLowerCase().trim(),
      password: placeholderPassword,
      role: "owner",
      isActive: true,
      isVerified: false,
    });

    // Create GymClient record.
    // If this fails, roll back the User so the email is free to register again.
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30); // 30-day trial

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
      // Rollback — delete the orphaned User so the email can be re-used
      await User.findByIdAndDelete(owner._id);
      throw gymErr;
    }

    // Create initial Settings document for this gym
    // Each gym needs its own Settings — seeded with defaults
    await Settings.create({
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

    // Generate set-password token and send invite email
    const setPasswordToken = generateSetPasswordToken(owner._id.toString());

    await sendSetPasswordEmail({
      to: ownerEmail.toLowerCase().trim(),
      ownerName: ownerName.trim(),
      gymName: gymName.trim(),
      token: setPasswordToken,
    });

    return res.status(201).json({
      success: true,
      message: `Gym "${gymName}" created. Invite email sent to ${ownerEmail}.`,
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
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    // Attach owner info
    const owner = await User.findById(gym.ownerId)
      .select("name email isActive isVerified createdAt")
      .lean();

    return res.status(200).json({ success: true, gym, owner });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/superadmin/gyms/:id ──────────────────────────────────────────
// Edit gym info and/or billing status and/or notes
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
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    if (gymName?.trim()) gym.gymName = gymName.trim();
    if (gymAddress !== undefined) gym.gymAddress = gymAddress.trim();
    if (contactPhone !== undefined) gym.contactPhone = contactPhone.trim();
    if (billingStatus) gym.billingStatus = billingStatus as any;
    if (notes !== undefined) gym.notes = notes.trim();
    if (billingRenewsAt) gym.billingRenewsAt = new Date(billingRenewsAt);

    await gym.save();

    return res.status(200).json({
      success: true,
      message: "Gym updated.",
      gym,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/superadmin/gyms/:id/hard-delete ─────────────────────────────
// Permanently removes GymClient + User + Settings from ALL collections.
// Use this during testing/development to fully clean up a gym.
// In production, prefer the soft-delete (deleteGym) instead.
export const hardDeleteGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    const gymName = gym.gymName;
    const ownerEmail = gym.contactEmail;

    // Delete all three records atomically
    await Promise.all([
      User.findByIdAndDelete(gym.ownerId),
      GymClient.findByIdAndDelete(gym._id),
    ]);

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
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }
    if (gym.status === "suspended") {
      return res
        .status(400)
        .json({ success: false, message: "Gym is already suspended." });
    }

    gym.status = "suspended";
    await gym.save();

    // Also deactivate the owner User so they can't log in
    await User.findByIdAndUpdate(gym.ownerId, { isActive: false });

    return res.status(200).json({
      success: true,
      message: `"${gym.gymName}" has been suspended.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /api/superadmin/gyms/:id/reactivate ────────────────────────────────
export const reactivateGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    gym.status = "active";
    await gym.save();

    // Re-enable the owner User
    await User.findByIdAndUpdate(gym.ownerId, { isActive: true });

    return res.status(200).json({
      success: true,
      message: `"${gym.gymName}" has been reactivated.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /api/superadmin/gyms/:id ─────────────────────────────────────────
// Soft delete — marks gym as deleted, deactivates owner
export const deleteGym = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    gym.status = "deleted";
    await gym.save();

    // Deactivate owner — they can no longer log in
    await User.findByIdAndUpdate(gym.ownerId, { isActive: false });

    return res.status(200).json({
      success: true,
      message: `"${gym.gymName}" has been deleted.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms/:id/reset-password ────────────────────────────
// Super Admin manually triggers a password reset for an owner
export const resetOwnerPassword = async (
  req: SuperAdminRequest,
  res: Response,
) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    const owner = await User.findById(gym.ownerId);
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Owner user not found." });
    }

    const resetToken = generateResetToken(owner._id.toString());

    await sendSetPasswordEmail({
      to: owner.email!,
      ownerName: owner.name,
      gymName: gym.gymName,
      token: resetToken,
    });

    return res.status(200).json({
      success: true,
      message: `Password reset email sent to ${owner.email}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /api/superadmin/gyms/:id/resend-invite ──────────────────────────────
// Resend the set-password invite if owner never clicked the first one
export const resendInvite = async (req: SuperAdminRequest, res: Response) => {
  try {
    const gym = await GymClient.findById(req.params.id);
    if (!gym) {
      return res
        .status(404)
        .json({ success: false, message: "Gym not found." });
    }

    const owner = await User.findById(gym.ownerId);
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Owner user not found." });
    }

    if (owner.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Owner has already set their password.",
      });
    }

    const token = generateSetPasswordToken(owner._id.toString());

    await sendSetPasswordEmail({
      to: owner.email!,
      ownerName: owner.name,
      gymName: gym.gymName,
      token,
    });

    return res.status(200).json({
      success: true,
      message: `Invite resent to ${owner.email}.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
