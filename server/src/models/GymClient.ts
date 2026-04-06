/**
 * GymClient.ts
 * LakasGMS — Super Admin: Gym Client Model
 *
 * One document per gym that has been onboarded by Super Admin.
 * Tracks the owner user reference, billing status, and admin notes.
 *
 * Collection: "gymclients"
 */

import mongoose, { Document, Schema } from "mongoose";

export type GymClientStatus = "active" | "suspended" | "deleted";
export type BillingStatus = "trial" | "paid" | "overdue" | "cancelled";

export interface IGymClient extends Document {
  gymClientId: string; // GYM-001, GYM-002, etc.

  // Gym info
  gymName: string;
  gymAddress?: string;
  contactEmail: string; // owner's email — synced from User
  contactPhone?: string;

  // Linked owner
  ownerId: mongoose.Types.ObjectId; // ref → User

  // Status
  status: GymClientStatus;
  billingStatus: BillingStatus;

  // Subscription
  trialEndsAt?: Date;
  billingRenewsAt?: Date;

  // Admin metadata
  notes?: string; // internal super admin notes
  lastLoginAt?: Date; // updated on owner login

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const GymClientSchema = new Schema<IGymClient>(
  {
    gymClientId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    gymName: {
      type: String,
      required: [true, "Gym name is required"],
      trim: true,
    },
    gymAddress: {
      type: String,
      trim: true,
    },
    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },
    billingStatus: {
      type: String,
      enum: ["trial", "paid", "overdue", "cancelled"],
      default: "trial",
    },
    trialEndsAt: {
      type: Date,
    },
    billingRenewsAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Index for fast lookups by status (Super Admin dashboard list)
GymClientSchema.index({ status: 1, createdAt: -1 });

export default (mongoose.models.GymClient as mongoose.Model<IGymClient>) ||
  mongoose.model<IGymClient>("GymClient", GymClientSchema);
