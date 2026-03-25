import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Settings from "../models/Settings";
import { cloudinary } from "../middleware/upload";
import { AuthRequest } from "../middleware/authMiddleware";
import { logAction } from "../utils/logAction";
import {
  RegisterOwnerInput,
  RegisterStaffInput,
  LoginOwnerInput,
  LoginStaffInput,
  UpdatePasswordInput,
  UpdateEmailInput,
  UpdateGymInput,
} from "../middleware/authSchemas";

// name is now included in the JWT payload
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
export const registerStaff = async (req: Request, res: Response) => {
  try {
    const { name, username, password }: RegisterStaffInput = req.body;

    const exists = await User.findOne({ username });
    if (exists) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Username already taken. Please choose another.",
        });
    }

    const user = await User.create({ name, username, password, role: "staff" });
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

    const user = await User.findOne({ email, role: "owner" }).select(
      "+password",
    );
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Account deactivated. Contact support.",
        });
    }

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

    const user = await User.findOne({
      username: username.toLowerCase(),
      role: "staff",
    }).select("+password");

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Account deactivated. Contact the owner.",
        });
    }

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
      return res
        .status(400)
        .json({
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
      return res
        .status(409)
        .json({
          success: false,
          message: "Email is already in use by another account",
        });

    if (user.email === newEmail)
      return res
        .status(400)
        .json({
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

    return res
      .status(200)
      .json({
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
          }
        : {
            gymName: process.env.GYM_NAME || "Gym",
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
export const uploadLogoController = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({
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

    return res
      .status(200)
      .json({
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
      return res
        .status(400)
        .json({
          success: false,
          message: "Plan name must be at least 2 characters.",
        });
    if (price == null || price < 0)
      return res
        .status(400)
        .json({ success: false, message: "Price must be zero or positive." });
    if (!durationMonths || durationMonths < 1 || durationMonths > 24)
      return res
        .status(400)
        .json({
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
      return res
        .status(409)
        .json({
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

    return res
      .status(201)
      .json({
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
        return res
          .status(409)
          .json({
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

    return res
      .status(200)
      .json({
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

    return res
      .status(200)
      .json({
        success: true,
        message: `Plan "${plan.name}" deleted.`,
        plans: settings.plans,
      });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// =================== WALK-IN PRICES ===================
export const updateWalkInPrices = async (req: AuthRequest, res: Response) => {
  try {
    const { regular, student, couple } = req.body as {
      regular?: number;
      student?: number;
      couple?: number;
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

    await settings.save();

    await logAction({
      action: "settings_updated",
      performedBy: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      },
      detail: `Walk-in prices updated — regular: ₱${settings.walkInPrices.regular}, student: ₱${settings.walkInPrices.student}, couple: ₱${settings.walkInPrices.couple}`,
    });

    return res
      .status(200)
      .json({
        success: true,
        message: "Walk-in prices updated.",
        walkInPrices: settings.walkInPrices,
      });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
