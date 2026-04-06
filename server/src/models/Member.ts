/**
 * Member.ts
 * LakasGMS — Gym Member Model
 *
 * Separate from the User model (which handles owner/staff auth).
 * Members are gym clients — they have membership data, not login accounts.
 *
 * Collection: "members"
 * Identifier: gymId (e.g. "GYM-1001") — never expose MongoDB _id publicly
 */

import mongoose, { Document, Schema } from "mongoose";

export interface IMember extends Document {
  ownerId: mongoose.Types.ObjectId; // ref → User (owner) — gym scoping
  gymId: string; // e.g. "GYM-1001" — public identifier
  name: string;
  email?: string; // optional
  phone?: string; // optional
  plan: string; // plan name from Settings.plans
  status: "active" | "inactive" | "expired";
  expiresAt: Date;
  checkedIn: boolean; // real-time gym presence
  lastCheckIn?: Date; // timestamp of most recent check-in
  balance: number; // outstanding balance (0 = fully paid)
  photoUrl?: string; // optional profile photo
  isActive: boolean; // soft delete flag
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema<IMember>(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner ID is required"],
      index: true,
    },
    gymId: {
      type: String,
      required: [true, "GYM-ID is required"],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      index: true, // indexed for fast name search
    },
    email: {
      type: String,
      unique: true,
      sparse: true, // allows multiple documents with no email
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // allows multiple documents with no phone
      trim: true,
    },
    plan: {
      type: String,
      required: [true, "Plan is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      default: "active",
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiry date is required"],
    },
    checkedIn: {
      type: Boolean,
      default: false,
    },
    lastCheckIn: {
      type: Date,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    photoUrl: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // auto createdAt + updatedAt
    collection: "members", // explicit collection name
  },
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Primary scoping index — every query filters by ownerId first
MemberSchema.index({ ownerId: 1, createdAt: -1 });

// Compound text index for search by name or email
MemberSchema.index({ name: "text", email: "text" });

// Index for expiry queries (at-risk members, expired reports)
MemberSchema.index({ ownerId: 1, expiresAt: 1, status: 1 });

// Index for check-in status queries
MemberSchema.index({ ownerId: 1, checkedIn: 1, isActive: 1 });

export default (mongoose.models.Member as mongoose.Model<IMember>) ||
  mongoose.model<IMember>("Member", MemberSchema);
