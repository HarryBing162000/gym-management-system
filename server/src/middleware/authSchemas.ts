import { z } from "zod";

// 🔷 Register schema — what the body must look like to create an account
export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name too long"),

  email: z.string().email("Invalid email address"),

  password: z.string().min(6, "Password must be at least 6 characters"),

  role: z.enum(["owner", "staff", "member"]).optional().default("member"),
});

// 🔷 Login schema — simpler, just email + password
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// TypeScript types auto-generated from Zod schemas — no duplication!
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
