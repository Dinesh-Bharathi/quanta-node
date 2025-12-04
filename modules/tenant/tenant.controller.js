import {
  createTenantForGlobalUserService,
  deleteTenantTransaction,
} from "./tenant.service.js";
import { errorResponse, successResponse } from "../../utils/response.js";
import prisma from "../../config/prismaClient.js";
import { sendDeleteConfirmation } from "../../services/emails/emailService.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { comparePassword } from "../../utils/hashPassword.js";

/**
 * POST /api/tenant/create
 * Create a new tenant for an existing global user
 */
export const createTenantAccountController = async (req, res) => {
  try {
    const global_user_id = req.global_user_id; // From authGlobalMiddleware
    const data = req.body;

    if (!global_user_id) {
      return errorResponse(res, "Global user not authenticated", 401);
    }

    // Required fields validation
    if (!data.tenant_name?.trim()) {
      return errorResponse(res, "Tenant name is required", 400);
    }

    const result = await createTenantForGlobalUserService(global_user_id, data);

    return successResponse(res, "Tenant created successfully", result, 201);
  } catch (error) {
    console.error("❌ Create Tenant Controller Error:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      timestamp: new Date().toISOString(),
    });

    // Prisma error
    if (error.code?.startsWith("P")) {
      return errorResponse(
        res,
        "Database error",
        500,
        `Prisma error: ${error.code}`
      );
    }

    return errorResponse(res, error.message || "Failed to create tenant", 400);
  }
};

export const tenantDeleteRequestController = async (req, res) => {
  try {
    const { tenant_uuid } = req.params;

    // Extracted from verifyToken middleware
    const authUser = req.user;

    if (!authUser) {
      return errorResponse(res, "Unauthorized", 401);
    }

    const { tenant_user_uuid } = authUser;

    // 1️⃣ Fetch tenant by UUID
    const tenant = await prisma.tbl_tenant.findUnique({
      where: { tenant_uuid },
      select: {
        tenant_id: true,
        tenant_name: true,
        tenant_email: true,
      },
    });

    if (!tenant) {
      return errorResponse(res, "Tenant not found", 404);
    }

    // 2️⃣ Fetch tenant_user from DB
    const tenantUser = await prisma.tbl_tenant_users.findUnique({
      where: { tenant_user_uuid },
      select: {
        tenant_user_id: true,
        tenant_id: true,
        user_email: true,
        user_name: true,
        is_owner: true,
        password: true,
      },
    });

    if (!tenantUser) {
      return errorResponse(res, "User not found", 404);
    }

    // 3️⃣ Validate tenant match
    if (tenantUser.tenant_id !== tenant.tenant_id) {
      return errorResponse(res, "Unauthorized tenant access", 403);
    }

    // 4️⃣ Validate owner
    if (!tenantUser.is_owner) {
      return errorResponse(res, "Only owners can delete the tenant", 403);
    }

    // 5️⃣ Ensure no active subscription
    const activeSub = await prisma.tbl_tenant_subscriptions.findFirst({
      where: { tenant_id: tenant.tenant_id, is_active: true },
    });

    if (activeSub) {
      return errorResponse(
        res,
        "Active subscription exists. Cancel subscription before deleting tenant.",
        400
      );
    }

    // 6️⃣ Generate deletion request token
    const delete_token = generateShortUUID();
    const request_uuid = generateShortUUID();
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.tbl_deletion_requests.create({
      data: {
        request_uuid,
        tenant_id: tenant.tenant_id,
        requester_user_id: tenantUser.tenant_user_id,
        token: delete_token,
        expires_at,
        status: "PENDING",
      },
    });

    // 7️⃣ Email confirmation link
    const confirmURL = `${process.env.CLIENT_URL}/confirm-delete?tenant_uuid=${tenant_uuid}&token=${delete_token}`;

    await sendDeleteConfirmation({
      to: tenantUser.user_email,
      subject: `Confirm deletion of ${tenant.tenant_name}`,
      html: `
        <p>You requested deletion of organization <strong>${tenant.tenant_name}</strong>.</p>
        <p>This action is permanent and cannot be undone.</p>
        <p>Click the link below to confirm:</p>
        <a href="${confirmURL}">Confirm Tenant Deletion</a>
        <p>This link expires in 24 hours.</p>
      `,
    });

    return successResponse(res, "Tenant deletion confirmation sent", {
      tenant_uuid,
      expires_at,
    });
  } catch (err) {
    console.error("tenantDeleteRequestController Error:", err);
    return errorResponse(res, "Failed to process delete request", 500);
  }
};

export const tenantDeleteConfirmController = async (req, res) => {
  try {
    const { tenant_uuid } = req.params;
    const { token, password } = req.body;

    const authUser = req.user;
    if (!authUser) return errorResponse(res, "Unauthorized", 401);

    const { tenant_user_uuid } = authUser;

    // 1️⃣ Fetch tenant
    const tenant = await prisma.tbl_tenant.findUnique({
      where: { tenant_uuid },
      select: { tenant_id: true, tenant_name: true },
    });

    if (!tenant) return errorResponse(res, "Tenant not found", 404);

    // 2️⃣ Fetch user from DB
    const tenantUser = await prisma.tbl_tenant_users.findUnique({
      where: { tenant_user_uuid },
      select: {
        tenant_user_id: true,
        tenant_id: true,
        is_owner: true,
        password: true,
      },
    });

    if (!tenantUser) {
      return errorResponse(res, "User not found", 404);
    }

    // 3️⃣ Validate tenant ownership
    if (tenantUser.tenant_id !== tenant.tenant_id) {
      return errorResponse(res, "Unauthorized tenant access", 403);
    }

    if (!tenantUser.is_owner) {
      return errorResponse(
        res,
        "Only tenant owners can delete the tenant",
        403
      );
    }

    // 4️⃣ Validate deletion request token
    const dr = await prisma.tbl_deletion_requests.findFirst({
      where: {
        tenant_id: tenant.tenant_id,
        token,
        status: "PENDING",
        expires_at: { gt: new Date() },
      },
    });

    if (!dr) {
      return errorResponse(res, "Invalid or expired deletion token", 400);
    }

    // 5️⃣ Optional password verification
    if (tenantUser.password && password) {
      const valid = await comparePassword(password, tenantUser.password);
      if (!valid) return errorResponse(res, "Incorrect password", 401);
    }

    // 6️⃣ Execute deletion transaction
    await prisma.$transaction(async (tx) => {
      await tx.tbl_deletion_requests.update({
        where: { request_uuid: dr.request_uuid },
        data: { status: "CONFIRMED" },
      });

      // perform cascade delete (your service)
      await deleteTenantTransaction(tx, tenant.tenant_id);

      await tx.tbl_deletion_requests.update({
        where: { request_uuid: dr.request_uuid },
        data: { status: "COMPLETED", completed_at: new Date() },
      });
    });

    // 7️⃣ Logout
    res.clearCookie("token");
    res.clearCookie("global_token");

    return successResponse(res, "Tenant deleted successfully");
  } catch (err) {
    console.error("tenantDeleteConfirmController Error:", err);
    return errorResponse(res, "Failed to delete tenant", 500);
  }
};
