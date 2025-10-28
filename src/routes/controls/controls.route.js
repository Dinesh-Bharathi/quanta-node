import { Router } from "express";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  addTenantRole,
  getTenantMenus,
  getTenantRoleByUuid,
  getTenantRoles,
  getUserMenus,
  updateTenantRoleByUuid,
} from "../../controllers/controls/controls.controller.js";

const router = Router();

router.get("/menu/:userUuid", verifyToken, cryptoMiddleware, getUserMenus);
router.get("/tenant/roles/:tentUuid", getTenantRoles);
router.get("/tenant/subscribed/menus/:tentUuid", getTenantMenus);
router.post("/tenant/roles/:tentUuid", addTenantRole);
router.get("/tenant/role/permission/:roleUuid", getTenantRoleByUuid);
router.put("/tenant/role/permission/:roleUuid", updateTenantRoleByUuid);

export default router;
