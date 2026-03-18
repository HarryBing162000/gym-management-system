import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import { SECURITY_CONFIG } from "../config/security";

// ============================================================
// 1. HELMET — Sets secure HTTP headers automatically
// Protects against: XSS, clickjacking, MIME sniffing, etc.
// Example headers it adds:
//   X-Content-Type-Options: nosniff
//   X-Frame-Options: DENY
//   Strict-Transport-Security: max-age=31536000
// ============================================================
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow embedding if needed
});

// ============================================================
// 2. GENERAL RATE LIMITER — Limits all API requests
// Protects against: DDoS, scraping, abuse
// Each IP gets max 100 requests per 15 minutes
// ============================================================
export const generalRateLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.RATE_LIMIT_WINDOW_MS,
  max: SECURITY_CONFIG.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true, // sends X-RateLimit-* headers so client knows
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many requests from this IP. Please try again after 15 minutes.",
  },
});

// ============================================================
// 3. AUTH RATE LIMITER — Stricter limit on login/register
// Protects against: brute force password attacks
// Only 5 attempts per 15 minutes per IP
// ============================================================
export const authRateLimiter = rateLimit({
  windowMs: SECURITY_CONFIG.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: SECURITY_CONFIG.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many login attempts. Account temporarily locked for 15 minutes.",
  },
  // Skip rate limit for successful requests (only count failures)
  skipSuccessfulRequests: true,
});

// ============================================================
// 3b. KIOSK RATE LIMITER — Tight limit on public kiosk routes
// Protects against: member list scraping, walk-in ID enumeration
// 20 requests per minute per IP (enough for normal use, blocks abuse)
// ============================================================
export const kioskRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
});

// ============================================================
// 4. MONGO SANITIZE — Strips NoSQL injection operators
// Protects against: { "email": { "$gt": "" } } attacks
// This strips out $ and . from all req.body, req.params, req.query
// ============================================================
// Strips MongoDB operators ($gt, $where, etc.) from req.body and req.params
// Intentionally skips req.query — read-only in Express 5
export const mongoSanitizeMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const sanitizeObject = (obj: any): any => {
    if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        if (key.startsWith("$") || key.includes(".")) {
          console.warn(
            `⚠️  Blocked NoSQL injection attempt — key: "${key}" from IP: ${req.ip}`,
          );
          delete obj[key];
        } else {
          sanitizeObject(obj[key]);
        }
      }
    }
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.params = sanitizeObject(req.params);
  next();
};

// ============================================================
// 5. HPP — Prevents HTTP Parameter Pollution
// Protects against: /api/users?role=member&role=owner (sends array, breaks logic)
// ============================================================
export const hppMiddleware = hpp();

// ============================================================
// 6. CORS — Only allow requests from whitelisted origins
// Protects against: random websites calling your API
// ============================================================
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (SECURITY_CONFIG.ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: Origin ${origin} not allowed`));
    }
  },
  credentials: true, // allow cookies/auth headers
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Kiosk-Token"],
};

// ============================================================
// 7. DATA SANITIZER — Strips dangerous characters from all inputs
// Protects against: XSS via stored data (e.g. name: "<script>alert(1)</script>")
// ============================================================
export const sanitizeInput = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // strip scripts
        .replace(/javascript:/gi, "") // strip javascript: protocol
        .replace(/on\w+\s*=/gi, "") // strip event handlers like onerror=
        .trim();
    }
    if (typeof obj === "object" && obj !== null) {
      for (const key of Object.keys(obj)) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.params = sanitize(req.params);
  return next();
};

// ============================================================
// 8. SECURITY LOGGER — Logs suspicious activity without leaking data
// Never logs passwords or tokens — only metadata
// ============================================================
export const securityLogger = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  // Log auth attempts (without the actual password)
  if (req.path.includes("/auth/login") || req.path.includes("/auth/register")) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = "[REDACTED]"; // never log passwords
    if (safeBody.token) safeBody.token = "[REDACTED]";

    console.log(
      `🔐 Auth attempt | IP: ${req.ip} | Path: ${req.path} | Email: ${safeBody.email || "N/A"}`,
    );
  }
  next();
};
