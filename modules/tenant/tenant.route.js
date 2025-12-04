import { Router } from "express";
import {
  createTenantAccountController,
  tenantDeleteConfirmController,
  tenantDeleteRequestController,
} from "./tenant.controller.js";
import { verifyGlobalOnly } from "../../middlewares/verifyGlobalOnly.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";

const router = Router();

/**
 * Create a new tenant for an existing global user
 * Requires global authentication (not tenant auth)
 */
router.post("/create", verifyGlobalOnly, createTenantAccountController);
router.post(
  "/:tenant_uuid/delete/request",
  verifyToken,
  tenantDeleteRequestController
);
router.post(
  "/:tenant_uuid/delete/confirm",
  verifyToken,
  tenantDeleteConfirmController
);

export default router;
