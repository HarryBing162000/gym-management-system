/**
 * SuperAdminAuditLog.ts
 * LakasGMS — Super Admin Audit Log Model
 *
 * Persists all Super Admin actions to MongoDB.
 * Replaces the previous in-memory array which reset on every server restart.
 *
 * Collection: "superadminauditlogs"
 *
 * Indexed by timestamp (desc) for fast dashboard reads.
 * gymId is optional — allows future per-gym filtering.
 */

import mongoose, { Document, Schema } from "mongoose";

export type AuditAction =
  | "login"
  | "login_locked"
  | "gym_created"
  | "gym_suspended"
  | "gym_reactivated"
  | "gym_deleted"
  | "gym_hard_deleted"
  | "billing_updated"
  | "password_reset"
  | "invite_resent"
  | "impersonation_started";

export interface ISuperAdminAuditLog extends Document {
  action: AuditAction;
  detail: string;
  ip: string;
  gymId?: mongoose.Types.ObjectId; // optional — for future per-gym filtering
  timestamp: Date;
}

const SuperAdminAuditLogSchema = new Schema<ISuperAdminAuditLog>(
  {
    action: {
      type: String,
      required: true,
      enum: [
        "login",
        "login_locked",
        "gym_created",
        "gym_suspended",
        "gym_reactivated",
        "gym_deleted",
        "gym_hard_deleted",
        "billing_updated",
        "password_reset",
        "invite_resent",
        "impersonation_started",
      ],
    },
    detail: {
      type: String,
      required: true,
      trim: true,
    },
    ip: {
      type: String,
      required: true,
      trim: true,
    },
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "GymClient",
      required: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // No automatic timestamps — we manage timestamp ourselves for consistency
    timestamps: false,
    // Auto-expire old logs after 1 year (TTL index) — keeps collection lean
    // Remove this line if you want permanent retention.
    // expireAfterSeconds: 365 * 24 * 60 * 60,
  },
);

// Primary read pattern: latest entries first
SuperAdminAuditLogSchema.index({ timestamp: -1 });

// Future: filter by gym
SuperAdminAuditLogSchema.index({ gymId: 1, timestamp: -1 });

export default (mongoose.models
  .SuperAdminAuditLog as mongoose.Model<ISuperAdminAuditLog>) ||
  mongoose.model<ISuperAdminAuditLog>(
    "SuperAdminAuditLog",
    SuperAdminAuditLogSchema,
  );
