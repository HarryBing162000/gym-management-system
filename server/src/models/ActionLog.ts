import mongoose, { Schema, Document, Types } from "mongoose";

export type ActionType =
  | "member_created"
  | "member_updated"
  | "member_deleted"
  | "check_in"
  | "check_out"
  | "walk_in_created"
  | "walk_in_checkout"
  | "payment_created"
  | "settings_updated"
  | "login"
  | "logout";

export interface IActionLog extends Document {
  ownerId: Types.ObjectId; // ref → User (owner) — gym scoping
  action: ActionType;
  performedBy: {
    userId: string;
    name: string;
    role: "owner" | "staff";
  };
  targetId?: string;
  targetName?: string;
  detail: string;
  timestamp: Date;
}

const ActionLogSchema = new Schema<IActionLog>({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: [
      "member_created",
      "member_updated",
      "member_deleted",
      "check_in",
      "check_out",
      "walk_in_created",
      "walk_in_checkout",
      "payment_created",
      "settings_updated",
      "login",
      "logout",
    ],
    required: true,
  },
  performedBy: {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ["owner", "staff"], required: true },
  },
  targetId: { type: String },
  targetName: { type: String },
  detail: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

ActionLogSchema.index({ ownerId: 1, timestamp: -1 });
ActionLogSchema.index({ timestamp: -1 });
ActionLogSchema.index({ "performedBy.userId": 1, timestamp: -1 });

export default mongoose.model<IActionLog>("ActionLog", ActionLogSchema);
