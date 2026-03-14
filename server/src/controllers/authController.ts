import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { RegisterInput, LoginInput } from "../middleware/authSchemas";

// 🔷 Helper to generate a JWT token
const generateToken = (id: string, role: string): string => {
  return jwt.sign(
    { id, role }, // payload — what's inside the token
    process.env.JWT_SECRET as string, // secret key to sign it
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }, // expiry
  );
};

// 🔷 Helper to generate GYM-XXXX member ID
// Finds the highest existing gymId and increments it
const generateGymId = async (): Promise<string> => {
  const lastMember = await User.findOne({ gymId: { $exists: true } })
    .sort({ gymId: -1 })
    .select("gymId");

  if (!lastMember?.gymId) return "GYM-1001";

  const lastNum = parseInt(lastMember.gymId.replace("GYM-", ""));
  return `GYM-${String(lastNum + 1).padStart(4, "0")}`;
};

// =================== REGISTER ===================
// POST /api/auth/register
// Why: Creates a new user. Bcrypt hashes the password automatically (via model pre-save hook)
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role }: RegisterInput = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Generate gymId only for members
    const gymId = role === "member" ? await generateGymId() : undefined;

    // Create user — password gets hashed by the pre-save hook in User model
    const user = await User.create({ name, email, password, role, gymId });

    // Generate token immediately so user is logged in right after registering
    const token = generateToken(user._id.toString(), user.role);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        gymId: user.gymId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: err.message,
    });
  }
};

// =================== LOGIN ===================
// POST /api/auth/login
// Why: Verifies email + password, returns JWT token
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginInput = req.body;

    // Find user by email — we need +password because it's select: false in the schema
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      // Use a generic message — don't tell attackers whether email exists or not
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Compare the submitted password against the stored hash
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
        message: "Account is deactivated. Contact the gym owner.",
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
        gymId: user.gymId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: "Server error during login",
      error: err.message,
    });
  }
};

// =================== GET CURRENT USER ===================
// GET /api/auth/me
// Why: Frontend calls this on page load to restore the logged-in session
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
        role: user.role,
        gymId: user.gymId,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
