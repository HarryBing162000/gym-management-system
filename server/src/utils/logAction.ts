import ActionLog, { ActionType } from "../models/ActionLog";
import mongoose from "mongoose";

interface LogActionParams {
  ownerId: string; // gym owner's User._id — scopes the log to one gym
  action: ActionType;
  performedBy: {
    userId: string; // maps to req.user.id from AuthRequest
    name: string;
    role: "owner" | "staff";
  };
  targetId?: string;
  targetName?: string;
  detail: string;
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await ActionLog.create({
      ...params,
      ownerId: new mongoose.Types.ObjectId(params.ownerId),
    });
  } catch (err) {
    // Never let a logging failure crash the actual route
    console.error("[logAction] Failed to write action log:", err);
  }
}
