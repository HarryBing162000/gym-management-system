/**
 * User.ts
 *  GMS — Authentication User Model
 *
 * Stores owner and staff accounts ONLY.
 * Gym members are stored in the Member model (separate collection).
 *
 * Collection: "users"
 */

import mongoose, { Document, Schema, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  password: string;
  role: "owner" | "staff";
  isActive: boolean;
  createdAt: Date;

  // Owner only
  email?: string;

  // Staff only
  username?: string;

  // Email verification + password reset (owner only)
  isVerified: boolean;
  passwordResetToken?: string;
  passwordResetExpires?: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["owner", "staff"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Email verification + password reset (owner only)
    isVerified: {
      type: Boolean,
      default: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // Owner
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    // Staff
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

// Hash password before saving
UserSchema.pre<HydratedDocument<IUser>>("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);
