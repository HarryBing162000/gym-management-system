import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // ✅ Fix 1: use .issues instead of .errors (correct Zod v3 API)
        // ✅ Fix 2: ZodIssue is the proper type so 'e' is no longer implicit any
        const errors = err.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
        });
        return; // ✅ Fix 3: explicit return after sending response (avoids void conflict)
      }
      next(err);
    }
  };
};
