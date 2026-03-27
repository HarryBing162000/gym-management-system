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

// Prevent duplicate walkIds (race condition guard at DB level)
WalkInSchema.index({ walkId: 1 }, { unique: true });

// Fast lookup for duplicate name check within same day
WalkInSchema.index({ name: 1, date: 1 });

// Fast lookup for today queries
WalkInSchema.index({ date: 1, checkIn: -1 });

export default (mongoose.models.WalkIn as mongoose.Model<IWalkIn>) ||
  mongoose.model<IWalkIn>("WalkIn", WalkInSchema);
