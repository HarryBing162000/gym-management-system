/**
 * SuperAdminAuditLog.ts
 * LakasGMS — Super Admin Audit Log Model
 *
 * Persistent audit log for all Super Admin actions.
 * Replaces the previous in-memory array which was wiped on every server restart.
 *
 * Fields:
 *   action    — action type enum (login, gym_created, etc.)
 *   detail    — human-readable description of what happened
 *   ip        — IP address of the SA session that performed the action
 *   gymId     — optional ref to GymClient._id for gym-specific actions
 *   timestamp — when the action occurred
 *
 * Indexes:
 *   { timestamp: -1 }         — default sort (most recent first)
 *   { gymId, timestamp: -1 }  — for per-gym filtering in the drawer
 *   { action, timestamp: -1 } — for action type filtering in audit log page
 */

import mongoose, { Document, Schema } from "mongoose";

export interface ISuperAdminAuditLog extends Document {
  action: string;
  detail: string;
  ip: string;
  gymId?: mongoose.Types.ObjectId | string;
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
      index: true,
    },
    detail: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      default: "unknown",
    },
    gymId: {
      type: Schema.Types.ObjectId,
      ref: "GymClient",
      required: false,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: "superadminauditlogs",
    // Optional TTL: uncomment to auto-expire entries after 1 year
    // timeseries or TTL index must be added separately via Atlas if needed
  },
);

// Compound indexes for common query patterns
SuperAdminAuditLogSchema.index({ timestamp: -1 });
SuperAdminAuditLogSchema.index({ gymId: 1, timestamp: -1 });
SuperAdminAuditLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model<ISuperAdminAuditLog>(
  "SuperAdminAuditLog",
  SuperAdminAuditLogSchema,
);
