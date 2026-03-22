import { z } from "zod";

// ============================================================
// OWNER — registers with email + password
// ============================================================
export const registerOwnerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.literal("owner"),
});

// ============================================================
// STAFF — registers with username + password (no email)
// ============================================================
export const registerStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username too long")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.literal("staff"),
});

// ============================================================
// MEMBER — registered by owner/staff, gets GymID auto-generated
// ============================================================
export const registerMemberSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.literal("member"),
});

// ============================================================
// OWNER LOGIN — email + password
// ============================================================
export const loginOwnerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ============================================================
// STAFF LOGIN — username + password
// ============================================================
export const loginStaffSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ============================================================
// WALK-IN schema
// ============================================================
export const walkInSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  phone: z.string().optional(),
  passType: z.enum(["regular", "student", "couple"], {
    error: "Pass type must be regular, student, or couple",
  }),
});

// ============================================================
// WALK-IN CHECKOUT schema
// ============================================================
export const walkInCheckOutSchema = z.object({
  walkId: z.string().min(1, "Walk-in ID is required"),
});

// ============================================================
// MEMBER CREATE — owner/staff creates a member
// ============================================================
export const createMemberSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name too long")
    .trim(),
  email: z.string().email("Invalid email address").toLowerCase().optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]*$/, "Invalid phone number")
    .optional(),
  plan: z.string().min(1, "Plan is required").max(30, "Plan name too long"),
  status: z.enum(["active", "inactive"], {
    error: "Status must be active or inactive",
  }),
  expiresAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date")
    .transform((val) => new Date(val)),
  paymentMethod: z.enum(["cash", "online"]).optional(),
  amountPaid: z.number().positive().optional(),
});

// ============================================================
// MEMBER UPDATE — partial update (all fields optional)
// Only allow fields staff/owner are permitted to change.
// gymId, password, role are NOT updatable via this schema.
// ============================================================
export const updateMemberSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name too long")
    .trim()
    .optional(),
  email: z.string().email("Invalid email address").toLowerCase().optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]*$/, "Invalid phone number")
    .optional(),
  plan: z.string().min(1).max(30).optional(),
  status: z.enum(["active", "inactive", "expired"]).optional(),
  expiresAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), "Invalid expiry date")
    .transform((val) => new Date(val))
    .optional(),
  photoUrl: z.string().url("Invalid photo URL").optional(),
  // Payment fields — passed through to autoLogPayment on renewal, not stored on Member
  paymentMethod: z.enum(["cash", "online"]).optional(),
  amountPaid: z.number().positive().optional(),
  totalAmount: z.number().positive().optional(),
});

// ============================================================
// MEMBER GYM-ID PARAM — validates :gymId route param
// ============================================================
export const gymIdParamSchema = z.object({
  gymId: z
    .string()
    .regex(/^GYM-\d+$/, "Invalid GYM-ID format. Expected GYM-XXXX"),
});

// ============================================================
// UPDATE PASSWORD — owner changes their own password
// ============================================================
export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(6, "New password must be at least 6 characters")
    .max(100, "Password too long"),
});

// ============================================================
// UPDATE EMAIL — owner changes their own email
// ============================================================
export const updateEmailSchema = z.object({
  newEmail: z.string().email("Invalid email address").toLowerCase(),
  password: z.string().min(1, "Password is required to confirm identity"),
});

// ============================================================
// UPDATE GYM INFO — owner updates gym name and address
// ============================================================
export const updateGymSchema = z.object({
  gymName: z
    .string()
    .min(2, "Gym name must be at least 2 characters")
    .max(100, "Gym name too long")
    .trim(),
  gymAddress: z
    .string()
    .min(2, "Address must be at least 2 characters")
    .max(200, "Address too long")
    .trim(),
});

// Types
export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;
export type RegisterStaffInput = z.infer<typeof registerStaffSchema>;
export type RegisterMemberInput = z.infer<typeof registerMemberSchema>;
export type LoginOwnerInput = z.infer<typeof loginOwnerSchema>;
export type LoginStaffInput = z.infer<typeof loginStaffSchema>;
export type WalkInInput = z.infer<typeof walkInSchema>;
export type WalkInCheckOutInput = z.infer<typeof walkInCheckOutSchema>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type GymIdParamInput = z.infer<typeof gymIdParamSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type UpdateGymInput = z.infer<typeof updateGymSchema>;
