/**
 * Settings.ts
 * IronCore GMS — Gym Settings Model
 *
 * Stores gym-level configuration that the owner can update at runtime.
 * Uses a singleton pattern — only one settings document ever exists.
 *
 * Collection: "settings"
 */

import mongoose, { Document, Schema } from "mongoose";

export interface ISettings extends Document {
  gymName: string;
  gymAddress: string;
  logoUrl?: string; // Cloudinary URL of the gym logo
  logoPublicId?: string; // Cloudinary public_id for deletion
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    gymName: {
      type: String,
      required: [true, "Gym name is required"],
      trim: true,
      maxlength: [100, "Gym name too long"],
    },
    gymAddress: {
      type: String,
      required: [true, "Gym address is required"],
      trim: true,
      maxlength: [200, "Address too long"],
    },
    logoUrl: {
      type: String,
      default: null,
    },
    logoPublicId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export default (mongoose.models.Settings as mongoose.Model<ISettings>) ||
  mongoose.model<ISettings>("Settings", SettingsSchema);
