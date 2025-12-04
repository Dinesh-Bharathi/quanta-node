import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import {
  createTenantCore,
  createTenantPermissions,
} from "../auth/auth.repository.js";
/**
 * Create a new tenant account for an existing global user.
 * This reuses the same logic used for first-time tenant creation.
 */
export const createTenantForGlobalUserService = async (
  global_user_id,
  data
) => {
  try {
    // 1️⃣ Validate global user
    const globalUser = await prisma.tbl_global_users.findUnique({
      where: { global_user_id },
      select: {
        global_user_id: true,
        email: true,
        name: true,
        global_user_uuid: true,
      },
    });

    if (!globalUser) {
      throw new Error("Global user not found");
    }

    // 2️⃣ Create a new tenant_user record for this global user
    const tenant_user_uuid = generateShortUUID();

    const newTenantUser = await prisma.tbl_tenant_users.create({
      data: {
        global_user_id,
        tenant_user_uuid,
        user_email: globalUser.email,
        user_name: globalUser.name || globalUser.email.split("@")[0],
        password: null, // password stored only in global table
        is_owner: true,
        is_email_verified: true,
      },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
        user_email: true,
        user_name: true,
      },
    });

    // 3️⃣ Create Tenant Core (tenant + branch + roles + subscription)
    const core = await createTenantCore(
      prisma,
      newTenantUser,
      data,
      data.plan_uuid
    );

    // 4️⃣ Create permissions (menus)
    await createTenantPermissions(prisma, core.roles);

    // 5️⃣ Return response payload
    return {
      tenant_uuid: core.tenant.tenant_uuid,
      branch_uuid: core.branch.branch_uuid,
      tenant_user_uuid: core.updatedUser.tenant_user_uuid,
      user_email: core.updatedUser.user_email,
      user_name: core.updatedUser.user_name,
      is_owner: true,
    };
  } catch (error) {
    console.error("❌ CreateTenantForGlobalUser Service Error:", {
      message: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
};

/**
 * deleteTenantTransaction
 * - tx: Prisma transaction client (tx)
 * - tenantId: numeric ID
 * - performedByTenantUserId: id of user requesting (for audit)
 */
export async function deleteTenantTransaction(
  tx,
  tenantId,
  performedByTenantUserId
) {
  // 1) Gather tenant users
  const tenantUsers = await tx.tbl_tenant_users.findMany({
    where: { tenant_id: tenantId },
    select: {
      tenant_user_id: true,
      tenant_user_uuid: true,
      global_user_id: true,
    },
  });
  const tenantUserIds = tenantUsers.map((u) => u.tenant_user_id);

  // 2) Delete tenant sessions
  if (tenantUserIds.length) {
    await tx.tbl_tenant_sessions.deleteMany({
      where: { tenant_user_id: { in: tenantUserIds } },
    });

    // 3) Delete tokens
    await tx.tbl_tokens.deleteMany({
      where: { tenant_user_id: { in: tenantUserIds } },
    });

    // 4) Delete user roles (tenant scoped)
    await tx.tbl_user_roles.deleteMany({
      where: { tenant_user_id: { in: tenantUserIds } },
    });

    // 5) Delete tenant subscriptions linked to users (if any)
    await tx.tbl_tenant_subscriptions.deleteMany({
      where: { tenant_user_id: { in: tenantUserIds } },
    });
  }

  // 6) Delete roles for this tenant (this will cascade role_permissions if FK cascade)
  await tx.tbl_roles.deleteMany({
    where: { tenant_id: tenantId },
  });

  // 7) Delete branches
  await tx.tbl_branches.deleteMany({
    where: { tenant_id: tenantId },
  });

  // 8) Delete any other tenant-scoped artifacts (extend this list for custom tables)
  // e.g., tx.tbl_invoices.deleteMany({ where: { tenant_id: tenantId } });

  // 9) Delete tenant users themselves
  await tx.tbl_tenant_users.deleteMany({
    where: { tenant_id: tenantId },
  });

  // 10) Delete subscriptions tied to tenant (tenant-level)
  await tx.tbl_tenant_subscriptions.deleteMany({
    where: { tenant_id: tenantId },
  });

  // 11) Finally delete tenant
  await tx.tbl_tenant.delete({
    where: { tenant_id: tenantId },
  });

  // 12) Write audit entry (if you have an audit table)
  // await tx.tbl_audit_logs.create({ data: { ... } });
}
