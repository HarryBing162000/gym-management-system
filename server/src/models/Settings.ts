/**
 * Settings.ts
 * LakasGMS — Gym Settings Model
 *
 * One Settings document per gym, scoped by ownerId.
 * Previously a singleton — now per-gym for multi-tenancy.
 *
 * Collection: "settings"
 */

import mongoose, { Document, Schema } from "mongoose";

export interface IPlan {
  name: string;
  price: number;
  durationMonths: number;
  isActive: boolean;
  isDefault: boolean;
}

export interface IWalkInPrices {
  regular: number;
  student: number;
  couple: number;
}

export interface ISettings extends Document {
  ownerId: mongoose.Types.ObjectId; // ref → User (owner) — gym scoping
  gymName: string;
  gymAddress: string;
  logoUrl?: string | null;
  logoPublicId?: string | null;
  plans: IPlan[];
  walkInPrices: IWalkInPrices;
  closingTime: string;
  timezone: string;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      maxlength: [30, "Plan name too long"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    durationMonths: {
      type: Number,
      required: [true, "Duration is required"],
      min: [1, "Duration must be at least 1 month"],
      max: [24, "Duration cannot exceed 24 months"],
    },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const SettingsSchema = new Schema<ISettings>(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Owner ID is required"],
      unique: true, // one Settings document per gym
      index: true,
    },
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
    logoUrl: { type: String, default: null },
    logoPublicId: { type: String, default: null },
    plans: { type: [PlanSchema], default: [] },
    walkInPrices: {
      regular: { type: Number, default: 150, min: 0 },
      student: { type: Number, default: 100, min: 0 },
      couple: { type: Number, default: 250, min: 0 },
    },
    closingTime: { type: String, default: "22:00", trim: true },
    timezone: { type: String, default: "Asia/Manila", trim: true },
  },
  { timestamps: true },
);

export const DEFAULT_PLANS: IPlan[] = [
  {
    name: "Monthly",
    price: 800,
    durationMonths: 1,
    isActive: true,
    isDefault: true,
  },
  {
    name: "Quarterly",
    price: 2100,
    durationMonths: 3,
    isActive: true,
    isDefault: true,
  },
  {
    name: "Annual",
    price: 7500,
    durationMonths: 12,
    isActive: true,
    isDefault: true,
  },
  {
    name: "Student",
    price: 500,
    durationMonths: 1,
    isActive: true,
    isDefault: true,
  },
];

export const DEFAULT_WALKIN_PRICES: IWalkInPrices = {
  regular: 150,
  student: 100,
  couple: 250,
};

export default (mongoose.models.Settings as mongoose.Model<ISettings>) ||
  mongoose.model<ISettings>("Settings", SettingsSchema);
