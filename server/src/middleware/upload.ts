/**
 * upload.ts
 * LakasGMS — Cloudinary Upload Middleware
 *
 * Handles logo image uploads via Multer + Cloudinary.
 * Images are stored in Cloudinary under the "ironcore-gms/logos" folder.
 *
 * Usage:
 *   import { uploadLogo } from "../middleware/upload";
 *   router.post("/upload-logo", protect, requireRole("owner"), uploadLogo.single("logo"), controller);
 */

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

// ─── Cloudinary Config ────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Storage ──────────────────────────────────────────────────────────────────

const storage = new CloudinaryStorage({
  cloudinary,
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
  } as any,
});

// ─── File Filter ──────────────────────────────────────────────────────────────
// Only allow image files — reject anything else

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = [
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp",
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type. Only JPG, PNG, SVG, and WebP are allowed."),
    );
  }
};

// ─── Multer Instance ──────────────────────────────────────────────────────────

export const uploadLogo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
});

// ─── Export Cloudinary instance for deleting old logos ────────────────────────

export { cloudinary };
