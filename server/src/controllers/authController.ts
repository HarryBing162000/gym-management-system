import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import {
  RegisterOwnerInput,
  RegisterStaffInput,
  RegisterMemberInput,
  LoginOwnerInput,
  LoginStaffInput,
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

// =================== GET ME ===================
// GET /api/auth/me
export const getMe = async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.user.id);
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
