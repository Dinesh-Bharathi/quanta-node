import { Router } from "express";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  addTenantRole,
  createTenantUser,
  deleteRoleByUuid,
  deleteTenantUser,
  getTenantMenus,
  getTenantRoleByUuid,
  getTenantRoles,
  getTenantUsers,
  getTenantUsersByUuid,
  getUserMenus,
  updateTenantRoleByUuid,
  updateTenantUser,
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
  "/tenant/role/details/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRoleByUuid
);
router.put(
  "/tenant/role/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  updateTenantRoleByUuid
);
router.delete(
  "/tenant/role/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  deleteRoleByUuid
);

router.get("/tenant/users/:tentUuid", getTenantUsers);
router.post("/tenant/users/:tentUuid", createTenantUser);
router.put("/tenant/users/:userUuid", updateTenantUser);
router.delete("/tenant/users/:userUuid", deleteTenantUser);
router.get("/tenant/user/:userUuid", getTenantUsersByUuid);
export default router;
