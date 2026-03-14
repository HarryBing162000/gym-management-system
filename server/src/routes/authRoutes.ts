import { Router } from "express";
import { register, login, getMe } from "../controllers/authController";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../middleware/authSchemas";
import { protect } from "../middleware/authMiddleware";

const router = Router();

// Public routes — no token needed
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);

// Protected route — token required
// Flow: request → protect (checks JWT) → getMe (returns user data)
router.get("/me", protect, getMe);

export default router;
