import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// 🔷 Extend Express Request type so req.user is available in controllers
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: "owner" | "staff";
  };
}

// 🔐 How JWT works:
// 1. User logs in → server signs a token: { id, role } + secret key → "eyJhbGci..."
// 2. Client stores token (localStorage or cookie)
// 3. Client sends token in every request: Authorization: Bearer eyJhbGci...
// 4. This middleware checks and decodes it on every protected route

export const protect = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // Check if Authorization header exists and starts with "Bearer "
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No token provided.",
    });
  }

  // Extract the token after "Bearer "
  const token = authHeader.split(" ")[1];

  try {
    // Verify the token using our secret key
    // If token is expired or tampered with, this throws an error
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string;
      role: "owner" | "staff";
    };

    // Attach user info to the request — available in all controllers after this
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Token invalid or expired.",
    });
  }
};

// 🔐 Role-based access — only allow certain roles through
// Usage: router.get("/dashboard", protect, requireRole("owner"), controller)
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};
