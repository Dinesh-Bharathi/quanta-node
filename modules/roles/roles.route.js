import { Router } from "express";
import {
  addTenantRoleController,
  deleteTenantRoleController,
  getTenantMenusController,
  getTenantRoleByUuidController,
  getTenantRolesController,
  getUserMenusController,
  updateTenantRoleController,
} from "./roles.controller.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";

const router = Router();

router.get(
  "/tenant/subscribed/menus/:tenantUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantMenusController
);

router.get(
  "/menu/:userUuid/:branchUuid",
  verifyToken,
  cryptoMiddleware,
  getUserMenusController
);

router.get(
  "/tenant/roles/:tenantUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRolesController
);

router.post(
  "/tenant/roles/:tenantUuid",
  verifyToken,
  cryptoMiddleware,
  addTenantRoleController
);
router.get(
  "/tenant/role/details/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  getTenantRoleByUuidController
);
router.put(
  "/tenant/role/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  updateTenantRoleController
);
router.delete(
  "/tenant/role/:tenantUuid/:roleUuid",
  verifyToken,
  cryptoMiddleware,
  deleteTenantRoleController
);
export default router;
