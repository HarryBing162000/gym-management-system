"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWalkInPrices = exports.deletePlan = exports.updatePlan = exports.addPlan = exports.getPlans = exports.deleteLogo = exports.uploadLogoController = exports.getGymInfo = exports.updateGym = exports.updateEmail = exports.updatePassword = exports.getMe = exports.reactivateStaff = exports.deactivateStaff = exports.listStaff = exports.loginStaff = exports.loginOwner = exports.registerStaff = exports.registerOwner = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Settings_1 = __importDefault(require("../models/Settings"));
const upload_1 = require("../middleware/upload");
const logAction_1 = require("../utils/logAction");
// name is now included in the JWT payload
const generateToken = (id, role, name) => {
    return jsonwebtoken_1.default.sign({ id, role, name }, process.env.JWT_SECRET, {
        expiresIn: (process.env.JWT_EXPIRES_IN || "7d"),
    });
};
// =================== REGISTER OWNER ===================
const registerOwner = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const exists = await User_1.default.findOne({ email });
        if (exists) {
            return res
                .status(409)
                .json({ success: false, message: "Email already registered" });
        }
        const user = await User_1.default.create({ name, email, password, role: "owner" });
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.registerOwner = registerOwner;
// =================== REGISTER STAFF ===================
const registerStaff = async (req, res) => {
    try {
        const { name, username, password } = req.body;
        const exists = await User_1.default.findOne({ username });
        if (exists) {
            return res
                .status(409)
                .json({
                success: false,
                message: "Username already taken. Please choose another.",
            });
        }
        const user = await User_1.default.create({ name, username, password, role: "staff" });
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.registerStaff = registerStaff;
// =================== LOGIN OWNER ===================
const loginOwner = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User_1.default.findOne({ email, role: "owner" }).select("+password");
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
        await (0, logAction_1.logAction)({
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.loginOwner = loginOwner;
// =================== LOGIN STAFF ===================
const loginStaff = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User_1.default.findOne({
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
        await (0, logAction_1.logAction)({
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.loginStaff = loginStaff;
// =================== LIST STAFF ===================
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
const getMe = async (req, res) => {
    try {
        const user = await User_1.default.findById(req.user?.id);
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.getMe = getMe;
// =================== UPDATE PASSWORD ===================
const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User_1.default.findById(req.user?.id).select("+password");
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
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            detail: `${req.user.name} changed their password`,
        });
        return res
            .status(200)
            .json({ success: true, message: "Password updated successfully" });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.updatePassword = updatePassword;
// =================== UPDATE EMAIL ===================
const updateEmail = async (req, res) => {
    try {
        const { newEmail, password } = req.body;
        const user = await User_1.default.findById(req.user?.id).select("+password");
        if (!user)
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        const isMatch = await user.comparePassword(password);
        if (!isMatch)
            return res
                .status(401)
                .json({ success: false, message: "Password is incorrect" });
        const emailExists = await User_1.default.findOne({
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
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            detail: `${req.user.name} updated their email`,
        });
        return res
            .status(200)
            .json({
            success: true,
            message: "Email updated successfully",
            email: user.email,
        });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.updateEmail = updateEmail;
// =================== UPDATE GYM INFO ===================
const updateGym = async (req, res) => {
    try {
        const { gymName, gymAddress } = req.body;
        const settings = await Settings_1.default.findOneAndUpdate({}, { gymName, gymAddress }, { upsert: true, new: true, runValidators: true });
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.updateGym = updateGym;
// =================== GET GYM INFO ===================
const getGymInfo = async (_req, res) => {
    try {
        const settings = await Settings_1.default.findOne({});
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.getGymInfo = getGymInfo;
// =================== UPLOAD LOGO ===================
const uploadLogoController = async (req, res) => {
    try {
        if (!req.file)
            return res
                .status(400)
                .json({
                success: false,
                message: "No file uploaded. Please select an image.",
            });
        const file = req.file;
        const currentSettings = await Settings_1.default.findOne({});
        if (currentSettings?.logoPublicId) {
            await upload_1.cloudinary.uploader.destroy(currentSettings.logoPublicId);
        }
        const settings = await Settings_1.default.findOneAndUpdate({}, { logoUrl: file.path, logoPublicId: file.filename }, { upsert: true, new: true, runValidators: true });
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            detail: `${req.user.name} uploaded a new gym logo`,
        });
        return res
            .status(200)
            .json({
            success: true,
            message: "Logo uploaded successfully",
            logoUrl: settings.logoUrl,
        });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.uploadLogoController = uploadLogoController;
// =================== DELETE LOGO ===================
const deleteLogo = async (req, res) => {
    try {
        const settings = await Settings_1.default.findOne({});
        if (!settings?.logoPublicId)
            return res
                .status(404)
                .json({ success: false, message: "No logo found to delete" });
        await upload_1.cloudinary.uploader.destroy(settings.logoPublicId);
        await Settings_1.default.findOneAndUpdate({}, { logoUrl: null, logoPublicId: null }, { new: true });
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
            },
            detail: `${req.user.name} deleted the gym logo`,
        });
        return res
            .status(200)
            .json({ success: true, message: "Logo deleted successfully" });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.deleteLogo = deleteLogo;
// =================== PLAN MANAGEMENT ===================
const getPlans = async (_req, res) => {
    try {
        const settings = await Settings_1.default.findOne({});
        return res
            .status(200)
            .json({ success: true, plans: settings?.plans ?? [] });
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.getPlans = getPlans;
const addPlan = async (req, res) => {
    try {
        const { name, price, durationMonths } = req.body;
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
        const settings = await Settings_1.default.findOne({});
        if (!settings)
            return res
                .status(500)
                .json({ success: false, message: "Settings not found." });
        const exists = settings.plans.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
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
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.addPlan = addPlan;
const updatePlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const { price, durationMonths, isActive, name } = req.body;
        const settings = await Settings_1.default.findOne({});
        if (!settings)
            return res
                .status(500)
                .json({ success: false, message: "Settings not found." });
        const plan = settings.plans.find((p) => p._id.toString() === planId);
        if (!plan)
            return res
                .status(404)
                .json({ success: false, message: "Plan not found." });
        if (name != null && name.trim().length >= 2) {
            const dup = settings.plans.some((p) => p._id.toString() !== planId &&
                p.name.toLowerCase() === name.trim().toLowerCase());
            if (dup)
                return res
                    .status(409)
                    .json({
                    success: false,
                    message: `A plan named "${name}" already exists.`,
                });
            if (!plan.isDefault)
                plan.name = name.trim();
        }
        if (price != null && price >= 0)
            plan.price = price;
        if (durationMonths != null && durationMonths >= 1 && durationMonths <= 24)
            plan.durationMonths = durationMonths;
        if (isActive != null)
            plan.isActive = isActive;
        await settings.save();
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.updatePlan = updatePlan;
const deletePlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const settings = await Settings_1.default.findOne({});
        if (!settings)
            return res
                .status(500)
                .json({ success: false, message: "Settings not found." });
        const planIndex = settings.plans.findIndex((p) => p._id.toString() === planId);
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
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.deletePlan = deletePlan;
// =================== WALK-IN PRICES ===================
const updateWalkInPrices = async (req, res) => {
    try {
        const { regular, student, couple } = req.body;
        const settings = await Settings_1.default.findOne({});
        if (!settings)
            return res
                .status(500)
                .json({ success: false, message: "Settings not found." });
        if (regular != null && regular >= 0)
            settings.walkInPrices.regular = regular;
        if (student != null && student >= 0)
            settings.walkInPrices.student = student;
        if (couple != null && couple >= 0)
            settings.walkInPrices.couple = couple;
        await settings.save();
        await (0, logAction_1.logAction)({
            action: "settings_updated",
            performedBy: {
                userId: req.user.id,
                name: req.user.name,
                role: req.user.role,
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
    }
    catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.updateWalkInPrices = updateWalkInPrices;
