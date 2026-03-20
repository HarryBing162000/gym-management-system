"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const walkInController_1 = require("../controllers/walkInController");
const validate_1 = require("../middleware/validate");
const authSchemas_1 = require("../middleware/authSchemas");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Staff/Owner registers a walk-in
router.post("/register", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validate)(authSchemas_1.walkInSchema), walkInController_1.registerWalkIn);
// Staff/Owner checks out a walk-in
router.patch("/checkout", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner", "staff"), (0, validate_1.validate)(authSchemas_1.walkInCheckOutSchema), walkInController_1.checkOutWalkIn);
// Today's walk-ins + summary
router.get("/today", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner", "staff"), walkInController_1.getTodayWalkIns);
// History by date or range — owner only
router.get("/history", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), walkInController_1.getWalkInHistory);
// Yesterday revenue — for comparison card
router.get("/yesterday-revenue", authMiddleware_1.protect, (0, authMiddleware_1.requireRole)("owner"), walkInController_1.getYesterdayRevenue);
// Public kiosk self-checkout
router.post("/kiosk-checkout", (0, validate_1.validate)(authSchemas_1.walkInCheckOutSchema), walkInController_1.kioskCheckOut);
exports.default = router;
