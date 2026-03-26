"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGymSchema = exports.updateEmailSchema = exports.updatePasswordSchema = exports.gymIdParamSchema = exports.updateMemberSchema = exports.createMemberSchema = exports.walkInCheckOutSchema = exports.walkInSchema = exports.loginStaffSchema = exports.loginOwnerSchema = exports.registerMemberSchema = exports.registerStaffSchema = exports.registerOwnerSchema = void 0;
const zod_1 = require("zod");
// ============================================================
// OWNER — registers with email + password
// ============================================================
exports.registerOwnerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(50),
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
    role: zod_1.z.literal("owner"),
});
// ============================================================
// STAFF — registers with username + password (no email)
// ============================================================
exports.registerStaffSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(50),
    username: zod_1.z
        .string()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username too long")
        .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
    role: zod_1.z.literal("staff"),
});
// ============================================================
// MEMBER — registered by owner/staff, gets GymID auto-generated
// ============================================================
exports.registerMemberSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(50),
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
    role: zod_1.z.literal("member"),
});
// ============================================================
// OWNER LOGIN — email + password
// ============================================================
exports.loginOwnerSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(1, "Password is required"),
});
// ============================================================
// STAFF LOGIN — username + password
// ============================================================
exports.loginStaffSchema = zod_1.z.object({
    username: zod_1.z.string().min(1, "Username is required"),
    password: zod_1.z.string().min(1, "Password is required"),
});
// ============================================================
// WALK-IN schema
// ============================================================
exports.walkInSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(50),
    phone: zod_1.z.string().optional(),
    passType: zod_1.z.enum(["regular", "student", "couple"], {
        error: "Pass type must be regular, student, or couple",
    }),
});
// ============================================================
// WALK-IN CHECKOUT schema
// ============================================================
exports.walkInCheckOutSchema = zod_1.z.object({
    walkId: zod_1.z.string().min(1, "Walk-in ID is required"),
});
// ============================================================
// MEMBER CREATE — owner/staff creates a member
// ============================================================
exports.createMemberSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(50, "Name too long")
        .trim(),
    email: zod_1.z.string().email("Invalid email address").toLowerCase().optional(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s()]*$/, "Invalid phone number")
        .optional(),
    plan: zod_1.z.string().min(1, "Plan is required").max(30, "Plan name too long"),
    status: zod_1.z.enum(["active", "inactive"], {
        error: "Status must be active or inactive",
    }),
    expiresAt: zod_1.z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date")
        .transform((val) => new Date(val)),
    paymentMethod: zod_1.z.enum(["cash", "online"]).optional(),
    amountPaid: zod_1.z.number().positive().optional(),
});
// ============================================================
// MEMBER UPDATE — partial update (all fields optional)
// Only allow fields staff/owner are permitted to change.
// gymId, password, role are NOT updatable via this schema.
// ============================================================
exports.updateMemberSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(50, "Name too long")
        .trim()
        .optional(),
    email: zod_1.z.string().email("Invalid email address").toLowerCase().optional(),
    phone: zod_1.z
        .string()
        .regex(/^[0-9+\-\s()]*$/, "Invalid phone number")
        .optional(),
    plan: zod_1.z.string().min(1).max(30).optional(),
    status: zod_1.z.enum(["active", "inactive", "expired"]).optional(),
    expiresAt: zod_1.z
        .string()
        .refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date")
        .transform((val) => new Date(val))
        .optional(),
    photoUrl: zod_1.z.string().url("Invalid photo URL").optional(),
    // Payment fields — passed through to autoLogPayment on renewal, not stored on Member
    paymentMethod: zod_1.z.enum(["cash", "online"]).optional(),
    amountPaid: zod_1.z.number().positive().optional(),
    totalAmount: zod_1.z.number().positive().optional(),
});
// ============================================================
// MEMBER GYM-ID PARAM — validates :gymId route param
// ============================================================
exports.gymIdParamSchema = zod_1.z.object({
    gymId: zod_1.z
        .string()
        .regex(/^GYM-\d+$/, "Invalid GYM-ID format. Expected GYM-XXXX"),
});
// ============================================================
// UPDATE PASSWORD — owner changes their own password
// ============================================================
exports.updatePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, "Current password is required"),
    newPassword: zod_1.z
        .string()
        .min(6, "New password must be at least 6 characters")
        .max(100, "Password too long"),
});
// ============================================================
// UPDATE EMAIL — owner changes their own email
// ============================================================
exports.updateEmailSchema = zod_1.z.object({
    newEmail: zod_1.z.string().email("Invalid email address").toLowerCase(),
    password: zod_1.z.string().min(1, "Password is required to confirm identity"),
});
// ============================================================
// UPDATE GYM INFO — owner updates gym name and address
// ============================================================
exports.updateGymSchema = zod_1.z.object({
    gymName: zod_1.z
        .string()
        .min(2, "Gym name must be at least 2 characters")
        .max(100, "Gym name too long")
        .trim(),
    gymAddress: zod_1.z
        .string()
        .min(2, "Address must be at least 2 characters")
        .max(200, "Address too long")
        .trim(),
});
