import mongoose, { Document, Schema, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email?: string; // Owner only
  username?: string; // Staff only
  password: string;
  role: "owner" | "staff" | "member";
  gymId?: string; // Member only (GYM-1042)
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
      unique: true,
      sparse: true, // allows null — only owner has email
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true, // allows null — only staff has username
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
      sparse: true, // only members have gymId
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Compare password method
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
