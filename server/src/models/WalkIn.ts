import mongoose, { Document, Schema } from "mongoose";

export interface IWalkIn extends Document {
  walkId: string; // WALK-001 format
  name: string;
  phone?: string;
  passType: "regular" | "student" | "couple";
  amount: number;
  date: string; // "2026-03-17" — used for daily reset
  checkIn: Date;
  checkOut?: Date;
  staffId: mongoose.Types.ObjectId; // who processed it
  isCheckedOut: boolean;
}

const WalkInSchema = new Schema<IWalkIn>(
  {
    walkId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    passType: {
      type: String,
      enum: ["regular", "student", "couple"],
      required: [true, "Pass type is required"],
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: String,
      required: true, // stored as "YYYY-MM-DD" for easy daily grouping
    },
    checkIn: {
      type: Date,
      default: Date.now,
    },
    checkOut: {
      type: Date,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isCheckedOut: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IWalkIn>("WalkIn", WalkInSchema);
