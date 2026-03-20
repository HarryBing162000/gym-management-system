"use strict";
/**
 * User.ts
 * IronCore GMS — Authentication User Model
 *
 * Stores owner and staff accounts ONLY.
 * Gym members are stored in the Member model (separate collection).
 *
 * Collection: "users"
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const UserSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
// Hash password before saving
UserSchema.pre("save", async function () {
    if (!this.isModified("password"))
        return;
    const salt = await bcryptjs_1.default.genSalt(12);
    this.password = await bcryptjs_1.default.hash(this.password, salt);
});
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
exports.default = mongoose_1.default.models.User ||
    mongoose_1.default.model("User", UserSchema);
