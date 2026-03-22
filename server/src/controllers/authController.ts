import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Settings from "../models/Settings";
import { cloudinary } from "../middleware/upload";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  RegisterOwnerInput,
  RegisterStaffInput,
  LoginOwnerInput,
  LoginStaffInput,
  UpdatePasswordInput,
  UpdateEmailInput,
  UpdateGymInput,
} from "../middleware/authSchemas";

// Helper — generate JWT token
const generateToken = (id: string, role: "owner" | "staff"): string => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any,
  });
};

// =================== REGISTER OWNER ===================
// POST /api/auth/register/owner
export const registerOwner = async (req: Request, res: Response) => {
  try {
    const { name, email, password }: RegisterOwnerInput = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const user = await User.create({ name, email, password, role: "owner" });
    const token = generateToken(user._id.toString(), user.role);

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
// POST /api/auth/register/staff
export const registerStaff = async (req: Request, res: Response) => {
  try {
    const { name, username, password }: RegisterStaffInput = req.body;

    const exists = await User.findOne({ username });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Username already taken. Please choose another.",
      });
    }

    const user = await User.create({ name, username, password, role: "staff" });
    const token = generateToken(user._id.toString(), user.role);

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
// POST /api/auth/login/owner
export const loginOwner = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginOwnerInput = req.body;

    const user = await User.findOne({ email, role: "owner" }).select(
      "+password",
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Contact support.",
      });
    }

    const token = generateToken(user._id.toString(), user.role);

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
// POST /api/auth/login/staff
export const loginStaff = async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginStaffInput = req.body;

    const user = await User.findOne({
      username: username.toLowerCase(),
      role: "staff",
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Contact the owner.",
      });
    }

    const token = generateToken(user._id.toString(), user.role);

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
// GET /api/auth/staff  (owner only)
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
// PATCH /api/auth/staff/:id/deactivate  (owner only)
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
// PATCH /api/auth/staff/:id/reactivate  (owner only)
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
// GET /api/auth/me
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
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
// PUT /api/auth/update-password  (owner + staff)
export const updatePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword }: UpdatePasswordInput = req.body;

    const user = await User.findById(req.user?.id).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const isSame = await user.comparePassword(newPassword);
    if (isSame) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPDATE EMAIL ===================
// PUT /api/auth/update-email  (owner only)
export const updateEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { newEmail, password }: UpdateEmailInput = req.body;

    const user = await User.findById(req.user?.id).select("+password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Password is incorrect",
      });
    }

    const emailExists = await User.findOne({
      email: newEmail,
      _id: { $ne: req.user?.id },
    });
    if (emailExists) {
      return res.status(409).json({
        success: false,
        message: "Email is already in use by another account",
      });
    }

    if (user.email === newEmail) {
      return res.status(400).json({
        success: false,
        message: "New email must be different from current email",
      });
    }

    user.email = newEmail;
    await user.save();

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
// PUT /api/auth/update-gym  (owner only)
export const updateGym = async (req: AuthRequest, res: Response) => {
  try {
    const { gymName, gymAddress }: UpdateGymInput = req.body;

    const settings = await Settings.findOneAndUpdate(
      {},
      { gymName, gymAddress },
      { upsert: true, new: true, runValidators: true },
    );

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
// GET /api/auth/gym-info  (public — needed for login page and kiosk)
export const getGymInfo = async (_req: Request, res: Response) => {
  try {
    const settings = await Settings.findOne({});

    // Build plans lookup for convenience — only active plans
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
          }
        : {
            gymName: process.env.GYM_NAME || "IronCore Gym",
            gymAddress: process.env.GYM_ADDRESS || "",
            logoUrl: null,
            plans: [],
            walkInPrices: { regular: 150, student: 100, couple: 250 },
          },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== UPLOAD LOGO ===================
// POST /api/auth/upload-logo  (owner only)
// Multer middleware handles the actual upload to Cloudinary
// By the time this controller runs, req.file already has the Cloudinary URL
export const uploadLogoController = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Please select an image.",
      });
    }

    const file = req.file as Express.Multer.File & {
      path: string;
      filename: string;
    };

    // Get current settings to delete old logo from Cloudinary if exists
    const currentSettings = await Settings.findOne({});
    if (currentSettings?.logoPublicId) {
      await cloudinary.uploader.destroy(currentSettings.logoPublicId);
    }

    // Save new logo URL and public_id to settings
    const settings = await Settings.findOneAndUpdate(
      {},
      {
        logoUrl: file.path, // Cloudinary URL
        logoPublicId: file.filename, // Cloudinary public_id for future deletion
      },
      { upsert: true, new: true, runValidators: true },
    );

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
// DELETE /api/auth/delete-logo  (owner only)
export const deleteLogo = async (req: AuthRequest, res: Response) => {
  try {
    const settings = await Settings.findOne({});

    if (!settings?.logoPublicId) {
      return res.status(404).json({
        success: false,
        message: "No logo found to delete",
      });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(settings.logoPublicId);

    // Remove from database
    await Settings.findOneAndUpdate(
      {},
      { logoUrl: null, logoPublicId: null },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Logo deleted successfully",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== PLAN MANAGEMENT ===================

// GET /api/auth/plans — returns ALL plans (active + inactive) for owner management
export const getPlans = async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await Settings.findOne({});
    return res.status(200).json({
      success: true,
      plans: settings?.plans ?? [],
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/auth/plans — add a new plan
export const addPlan = async (req: AuthRequest, res: Response) => {
  try {
    const { name, price, durationMonths } = req.body as {
      name: string;
      price: number;
      durationMonths: number;
    };

    if (!name || name.trim().length < 2) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Plan name must be at least 2 characters.",
        });
    }
    if (price == null || price < 0) {
      return res
        .status(400)
        .json({ success: false, message: "Price must be zero or positive." });
    }
    if (!durationMonths || durationMonths < 1 || durationMonths > 24) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Duration must be between 1 and 24 months.",
        });
    }

    const settings = await Settings.findOne({});
    if (!settings) {
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });
    }

    // Check for duplicate name (case-insensitive)
    const exists = settings.plans.some(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (exists) {
      return res
        .status(409)
        .json({
          success: false,
          message: `A plan named "${name}" already exists.`,
        });
    }

    settings.plans.push({
      name: name.trim(),
      price,
      durationMonths,
      isActive: true,
      isDefault: false,
    });
    await settings.save();

    return res.status(201).json({
      success: true,
      message: `Plan "${name}" added.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/auth/plans/:planId — update a plan's price, duration, or active status
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
    if (!settings) {
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });
    }

    const plan = settings.plans.find(
      (p) => (p as any)._id.toString() === planId,
    );
    if (!plan) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found." });
    }

    // Update allowed fields
    if (name != null && name.trim().length >= 2) {
      // Check for duplicate name (exclude self)
      const dup = settings.plans.some(
        (p) =>
          (p as any)._id.toString() !== planId &&
          p.name.toLowerCase() === name.trim().toLowerCase(),
      );
      if (dup) {
        return res
          .status(409)
          .json({
            success: false,
            message: `A plan named "${name}" already exists.`,
          });
      }
      // Only allow renaming non-default plans
      if (!plan.isDefault) {
        plan.name = name.trim();
      }
    }
    if (price != null && price >= 0) plan.price = price;
    if (durationMonths != null && durationMonths >= 1 && durationMonths <= 24) {
      plan.durationMonths = durationMonths;
    }
    if (isActive != null) plan.isActive = isActive;

    await settings.save();

    return res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" updated.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/auth/plans/:planId — delete a custom plan (default plans cannot be deleted)
export const deletePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { planId } = req.params;

    const settings = await Settings.findOne({});
    if (!settings) {
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });
    }

    const planIndex = settings.plans.findIndex(
      (p) => (p as any)._id.toString() === planId,
    );
    if (planIndex === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Plan not found." });
    }

    const plan = settings.plans[planIndex];
    if (plan.isDefault) {
      return res.status(400).json({
        success: false,
        message: `"${plan.name}" is a default plan and cannot be deleted. You can deactivate it instead.`,
      });
    }

    settings.plans.splice(planIndex, 1);
    await settings.save();

    return res.status(200).json({
      success: true,
      message: `Plan "${plan.name}" deleted.`,
      plans: settings.plans,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== WALK-IN PRICES ===================

// PUT /api/auth/walkin-prices — update walk-in pass prices
export const updateWalkInPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { regular, student, couple } = req.body as {
      regular?: number;
      student?: number;
      couple?: number;
    };

    const settings = await Settings.findOne({});
    if (!settings) {
      return res
        .status(500)
        .json({ success: false, message: "Settings not found." });
    }

    if (regular != null && regular >= 0)
      settings.walkInPrices.regular = regular;
    if (student != null && student >= 0)
      settings.walkInPrices.student = student;
    if (couple != null && couple >= 0) settings.walkInPrices.couple = couple;

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Walk-in prices updated.",
      walkInPrices: settings.walkInPrices,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
