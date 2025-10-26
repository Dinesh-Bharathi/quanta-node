import { Router } from "express";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  getTenantRoles,
  getUserMenus,
} from "../../controllers/controls/controls.controller.js";

const router = Router();

router.get("/menu/:userUuid", verifyToken, cryptoMiddleware, getUserMenus);
router.get("/tenant/roles/:tentUuid", getTenantRoles);

export default router;
