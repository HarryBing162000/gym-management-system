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
  passType: z.enum(["regular", "student"], {
    error: "Pass type must be regular or student",
  }),
});

// ============================================================
// WALK-IN CHECKOUT schema
// ============================================================
export const walkInCheckOutSchema = z.object({
  walkId: z.string().min(1, "Walk-in ID is required"),
});

// Types
export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;
export type RegisterStaffInput = z.infer<typeof registerStaffSchema>;
export type RegisterMemberInput = z.infer<typeof registerMemberSchema>;
export type LoginOwnerInput = z.infer<typeof loginOwnerSchema>;
export type LoginStaffInput = z.infer<typeof loginStaffSchema>;
export type WalkInInput = z.infer<typeof walkInSchema>;
export type WalkInCheckOutInput = z.infer<typeof walkInCheckOutSchema>;
