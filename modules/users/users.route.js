import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import {
  createTenantUserController,
  deleteTenantUserController,
  getTenantUserByUuidController,
  getTenantUsersController,
  updateTenantUserController,
} from "./users.controller.js";

const router = Router();

router.get("/tenant/users/:tenantUuid", verifyToken, getTenantUsersController);
router.post(
  "/tenant/users/:tenantUuid",
  verifyToken,
  createTenantUserController
);

router.get(
  "/tenant/user/:userUuid",
  // verifyToken,
  getTenantUserByUuidController
);
router.put("/tenant/user/:userUuid", verifyToken, updateTenantUserController);
router.delete(
  "/tenant/user/:userUuid",
  verifyToken,
  deleteTenantUserController
);

export default router;
