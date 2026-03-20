"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.reactivateStaff = exports.deactivateStaff = exports.listStaff = exports.loginStaff = exports.loginOwner = exports.registerStaff = exports.registerOwner = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
// Helper — generate JWT token
const generateToken = (id, role) => {
    return jsonwebtoken_1.default.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: (process.env.JWT_EXPIRES_IN || "7d"),
    });
};
// =================== REGISTER OWNER ===================
// POST /api/auth/register/owner
const registerOwner = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const exists = await User_1.default.findOne({ email });
        if (exists) {
            return res.status(409).json({
                success: false,
                message: "Email already registered",
            });
        }
        const user = await User_1.default.create({ name, email, password, role: "owner" });
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.registerOwner = registerOwner;
// =================== REGISTER STAFF ===================
// POST /api/auth/register/staff
const registerStaff = async (req, res) => {
    try {
        const { name, username, password } = req.body;
        const exists = await User_1.default.findOne({ username });
        if (exists) {
            return res.status(409).json({
                success: false,
                message: "Username already taken. Please choose another.",
            });
        }
        const user = await User_1.default.create({ name, username, password, role: "staff" });
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.registerStaff = registerStaff;
// =================== LOGIN OWNER ===================
// POST /api/auth/login/owner
const loginOwner = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User_1.default.findOne({ email, role: "owner" }).select("+password");
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.loginOwner = loginOwner;
// =================== LOGIN STAFF ===================
// POST /api/auth/login/staff
const loginStaff = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User_1.default.findOne({
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.loginStaff = loginStaff;
// =================== LIST STAFF ===================
// GET /api/auth/staff  (owner only)
const listStaff = async (req, res) => {
    try {
        const staff = await User_1.default.find({ role: "staff" })
            .select("name username isActive createdAt")
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, staff });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.listStaff = listStaff;
// =================== DEACTIVATE STAFF ===================
// PATCH /api/auth/staff/:id/deactivate  (owner only)
const deactivateStaff = async (req, res) => {
    try {
        const user = await User_1.default.findOneAndUpdate({ _id: req.params.id, role: "staff" }, { isActive: false }, { returnDocument: "after" }).select("name username isActive");
        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "Staff not found" });
        return res.status(200).json({ success: true, staff: user });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.deactivateStaff = deactivateStaff;
// =================== REACTIVATE STAFF ===================
// PATCH /api/auth/staff/:id/reactivate  (owner only)
const reactivateStaff = async (req, res) => {
    try {
        const user = await User_1.default.findOneAndUpdate({ _id: req.params.id, role: "staff" }, { isActive: true }, { returnDocument: "after" }).select("name username isActive");
        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "Staff not found" });
        return res.status(200).json({ success: true, staff: user });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.reactivateStaff = reactivateStaff;
// =================== GET ME ===================
// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const user = await User_1.default.findById(req.user.id);
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.getMe = getMe;
