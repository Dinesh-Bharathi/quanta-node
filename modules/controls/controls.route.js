import { Router } from "express";
import {
  addTenantRole,
  assignUserToBranch,
  createTenantUser,
  deleteTenantRole,
  deleteTenantUser,
  getTenantMenus,
  getTenantRoleByUuid,
  getTenantRoles,
  getTenantUsers,
  getTenantUsersByUuid,
  getUserMenus,
  updateTenantRole,
  updateTenantUser,
} from "./controls.controller.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";

const router = Router();

router.get(
  "/menu/:userUuid/:branchUuid",
  verifyToken,
  cryptoMiddleware,
  getUserMenus
);
router.get(
  "/tenant/subscribed/menus/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantMenus
);
router.get(
  "/tenant/roles/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRoles
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
  updateTenantRole
);
router.delete(
  "/tenant/role/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  deleteTenantRole
);

router.get("/tenant/users/:tentUuid", getTenantUsers);
router.post("/tenant/users/:tentUuid", createTenantUser);
router.put("/tenant/users/:userUuid", updateTenantUser);
router.delete("/tenant/users/:userUuid", deleteTenantUser);
router.get("/tenant/user/:userUuid", getTenantUsersByUuid);
router.put("/tenant/assign-user", assignUserToBranch);
export default router;
