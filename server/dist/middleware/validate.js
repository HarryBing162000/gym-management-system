"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParams = exports.validate = void 0;
const zod_1 = require("zod");
// Validates req.body against a Zod schema
const validate = (schema) => {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const errors = err.issues.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                }));
                res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors,
                });
                return;
            }
            next(err);
        }
    };
};
exports.validate = validate;
// Validates req.params against a Zod schema
// Used for route params like :gymId to prevent injection via URL
const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.params);
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const errors = err.issues.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                }));
                res.status(400).json({
                    success: false,
                    message: "Invalid route parameter",
                    errors,
                });
                return;
            }
            next(err);
        }
    };
};
exports.validateParams = validateParams;
