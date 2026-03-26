"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.globalErrorHandler = void 0;
// ============================================================
// GLOBAL ERROR HANDLER
// Why: Without this, Express can accidentally send full stack traces
// to the client, revealing your file paths, package versions, and
// internal logic — a goldmine for hackers.
// ============================================================
const globalErrorHandler = (err, req, res, _next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";
    // ---- Handle known MongoDB/Mongoose errors ----
    // Duplicate key (e.g. email already exists)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0];
        return res.status(409).json({
            success: false,
            message: `${field} already exists. Please use a different one.`,
        });
    }
    // Mongoose validation error
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors || {}).map((e) => e.message);
        return res.status(400).json({
            success: false,
            message: "Validation error",
            errors: messages,
        });
    }
    // Invalid MongoDB ObjectId (e.g. /api/users/not-a-real-id)
    if (err.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: `Invalid ID format`,
        });
    }
    // JWT expired
    if (err.name === "TokenExpiredError") {
        return res.status(401).json({
            success: false,
            message: "Your session has expired. Please log in again.",
        });
    }
    // JWT tampered
    if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
            success: false,
            message: "Invalid token. Please log in again.",
        });
    }
    // ---- In production: hide internal errors from client ----
    if (process.env.NODE_ENV === "production" && err.statusCode === 500) {
        console.error("💥 INTERNAL ERROR:", err); // log full error server-side only
        return res.status(500).json({
            success: false,
            message: "Something went wrong. Please try again later.",
            // ⛔ Never send err.message or err.stack in production for 500 errors
        });
    }
    // Development: send full error for debugging
    return res.status(err.statusCode).json({
        success: false,
        status: err.status,
        message: err.message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};
exports.globalErrorHandler = globalErrorHandler;
// 404 handler — catches routes that don't exist
const notFound = (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
    });
};
exports.notFound = notFound;
