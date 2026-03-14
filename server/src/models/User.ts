import mongoose, { Document, Schema, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: "owner" | "staff" | "member";
  gymId?: string;
  isActive: boolean;
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
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
      enum: ["owner", "staff", "member"],
      default: "member",
    },
    gymId: {
      type: String,
      unique: true,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Fix 1: Use Schema.pre() directly with typed generic instead of UserSchema.pre()
// ✅ Fix 2: Pass IUser as generic so TypeScript knows what `this` is
// ✅ Fix 3: No next parameter needed — use async/await pattern which Mongoose 7+ prefers
UserSchema.pre<HydratedDocument<IUser>>("save", async function () {
  // `this` is now correctly typed as HydratedDocument<IUser>
  // so this.isModified, this.password all resolve with no errors
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ✅ Instance method — compares login attempt vs stored hash
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
