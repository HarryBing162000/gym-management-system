"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECURITY_CONFIG = void 0;
exports.SECURITY_CONFIG = {
    // Rate limiting
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: process.env.NODE_ENV === "production" ? 300 : 2000,
    LOGIN_RATE_LIMIT_MAX: process.env.NODE_ENV === "production" ? 10 : 100,
    LOGIN_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
    // JWT
    JWT_EXPIRES_IN: "7d",
    JWT_COOKIE_EXPIRES_DAYS: 7,
    // Body size
    MAX_BODY_SIZE: "10kb", // reject anything larger
    // Bcrypt
    BCRYPT_SALT_ROUNDS: 12, // increased from 10 for stronger hashing
    // Allowed origins (update for production)
    ALLOWED_ORIGINS: [
        "http://localhost:5173", // Vite dev server
        "http://localhost:3000",
        "https://ironcore.gym", // your production domain later
    ],
};
