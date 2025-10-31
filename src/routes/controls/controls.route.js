import { Router } from "express";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  addTenantRole,
  deleteRoleByUuid,
  getTenantMenus,
  getTenantRoleByUuid,
  getTenantRoles,
  getUserMenus,
  updateTenantRoleByUuid,
} from "../../controllers/controls/controls.controller.js";

const router = Router();

router.get("/menu/:userUuid", verifyToken, cryptoMiddleware, getUserMenus);
router.get(
  "/tenant/roles/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRoles
);
router.get(
  "/tenant/subscribed/menus/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantMenus
);
router.post(
  "/tenant/roles/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  addTenantRole
);
router.get(
  "/tenant/role/permission/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRoleByUuid
);
router.put(
  "/tenant/role/permission/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  updateTenantRoleByUuid
);
router.delete(
  "/tenant/role/permission/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  deleteRoleByUuid
);

export default router;
