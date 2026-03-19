/**
 * Payment.ts
 * IronCore GMS — Payment Model
 *
 * Tracks all membership payments:
 *   - Auto-created on new member registration
 *   - Auto-created on member plan renewal
 *   - Manual payments logged by staff or owner
 *
 * Collection: "payments"
 */

import mongoose, { Document, Schema } from "mongoose";

export type PaymentMethod = "cash" | "online";
export type PaymentType = "new_member" | "renewal" | "manual";

export interface IPayment extends Document {
  // Member reference
  gymId: string;
  memberName: string;

  // Payment details
  amount: number;
  method: PaymentMethod;
  type: PaymentType;
  plan: "Monthly" | "Quarterly" | "Annual" | "Student";
  amountPaid: number; // actual amount received
  totalAmount: number; // full plan price
  balance: number; // remaining (0 if fully paid)
  isPartial: boolean; // true if balance > 0
  notes?: string;

  // Who processed it
  processedBy: mongoose.Types.ObjectId; // ref: User

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    gymId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    memberName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: ["cash", "online"],
      required: true,
    },
    type: {
      type: String,
      enum: ["new_member", "renewal", "manual"],
      required: true,
    },
    plan: {
      type: String,
      enum: ["Monthly", "Quarterly", "Annual", "Student"],
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPartial: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "payments",
  },
);

// Indexes for common queries
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ gymId: 1, createdAt: -1 });
PaymentSchema.index({ method: 1, createdAt: -1 });
PaymentSchema.index({ type: 1, createdAt: -1 });

export default (mongoose.models.Payment as mongoose.Model<IPayment>) ||
  mongoose.model<IPayment>("Payment", PaymentSchema);
