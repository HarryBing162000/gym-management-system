import mongoose, { Document, Schema, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  // ── Core fields (all roles) ──────────────────────────────
  name: string;
  password: string;
  role: "owner" | "staff" | "member";
  isActive: boolean;
  createdAt: Date;

  // ── Owner only ───────────────────────────────────────────
  email?: string;

  // ── Staff only ───────────────────────────────────────────
  username?: string;

  // ── Member only ──────────────────────────────────────────
  gymId?: string; // e.g. "GYM-1042" — auto-generated on register
  plan?: string; // e.g. "Monthly", "Quarterly", "Annual"
  status?: "active" | "inactive" | "expired"; // membership status
  expiresAt?: Date; // membership expiry date
  checkedIn?: boolean; // current gym presence (true = inside right now)
  photoUrl?: string; // optional profile photo URL

  // ── Methods ──────────────────────────────────────────────
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    // ── Core ──────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false, // never returned in queries unless explicitly requested
    },
    role: {
      type: String,
      enum: ["owner", "staff", "member"],
      default: "member",
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Owner ─────────────────────────────────────────────
    email: {
      type: String,
      unique: true,
      sparse: true, // allows multiple nulls — only owner has email
      lowercase: true,
      trim: true,
    },

    // ── Staff ─────────────────────────────────────────────
    username: {
      type: String,
      unique: true,
      sparse: true, // allows multiple nulls — only staff has username
      lowercase: true,
      trim: true,
    },

    // ── Member ────────────────────────────────────────────
    gymId: {
      type: String,
      unique: true,
      sparse: true, // only members have gymId
    },
    plan: {
      type: String,
      trim: true,
      // e.g. "Monthly", "Quarterly", "Annual", "Student"
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      // Only set for members — owner/staff leave this undefined
    },
    expiresAt: {
      type: Date,
      // Membership expiry — used by kiosk to block expired members
    },
    checkedIn: {
      type: Boolean,
      default: false,
      // Tracks real-time gym presence. Reset to false on checkout.
    },
    photoUrl: {
      type: String,
      trim: true,
      // Optional member photo URL (uploaded separately)
    },
  },
  { timestamps: true },
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Full-text index on name for kiosk member search
UserSchema.index({ name: "text" });

// ── Hooks ──────────────────────────────────────────────────────────────────

// Hash password before saving
UserSchema.pre<HydratedDocument<IUser>>("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Methods ────────────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", UserSchema);
