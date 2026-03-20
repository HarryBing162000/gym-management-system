"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// 🔐 How JWT works:
// 1. User logs in → server signs a token: { id, role } + secret key → "eyJhbGci..."
// 2. Client stores token (localStorage or cookie)
// 3. Client sends token in every request: Authorization: Bearer eyJhbGci...
// 4. This middleware checks and decodes it on every protected route
const protect = (req, res, next) => {
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
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // Attach user info to the request — available in all controllers after this
        req.user = { id: decoded.id, role: decoded.role };
        next();
    }
    catch (err) {
        return res.status(401).json({
            success: false,
            message: "Not authorized. Token invalid or expired.",
        });
    }
};
exports.protect = protect;
// 🔐 Role-based access — only allow certain roles through
// Usage: router.get("/dashboard", protect, requireRole("owner"), controller)
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role: ${roles.join(" or ")}`,
            });
        }
        next();
    };
};
exports.requireRole = requireRole;
