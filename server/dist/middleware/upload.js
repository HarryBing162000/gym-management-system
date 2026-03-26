"use strict";
/**
 * upload.ts
 * IronCore GMS — Cloudinary Upload Middleware
 *
 * Handles logo image uploads via Multer + Cloudinary.
 * Images are stored in Cloudinary under the "ironcore-gms/logos" folder.
 *
 * Usage:
 *   import { uploadLogo } from "../middleware/upload";
 *   router.post("/upload-logo", protect, requireRole("owner"), uploadLogo.single("logo"), controller);
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = exports.uploadLogo = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
const multer_1 = __importDefault(require("multer"));
// ─── Cloudinary Config ────────────────────────────────────────────────────────
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// ─── Storage ──────────────────────────────────────────────────────────────────
const storage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
    params: {
        folder: "ironcore-gms/logos",
        allowed_formats: ["jpg", "jpeg", "png", "svg", "webp"],
        transformation: [
            {
                width: 400,
                height: 400,
                crop: "limit", // never upscale, only downscale if larger
            },
        ],
    },
});
// ─── File Filter ──────────────────────────────────────────────────────────────
// Only allow image files — reject anything else
const fileFilter = (_req, file, cb) => {
    const allowedMimes = [
        "image/jpeg",
        "image/png",
        "image/svg+xml",
        "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Invalid file type. Only JPG, PNG, SVG, and WebP are allowed."));
    }
};
// ─── Multer Instance ──────────────────────────────────────────────────────────
exports.uploadLogo = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB max
    },
});
