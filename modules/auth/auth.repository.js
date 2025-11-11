import prisma from "../../config/prismaClient.js";

// ─────────────────────────────────────────────
// Tenant-related operations
// ─────────────────────────────────────────────
export async function findTenantByEmail(email) {
  return prisma.tbl_tent_master1.findUnique({
    where: { tent_email: email },
  });
}

export async function createTenant(tx, data) {
  return tx.tbl_tent_master1.create({ data });
}

// ─────────────────────────────────────────────
// User-related operations
// ─────────────────────────────────────────────
export async function findUserByEmail(email) {
  return prisma.tbl_tent_users1.findFirst({
    where: { user_email: email },
    include: { tbl_tent_master1: true },
  });
}

export async function findUserByUuid(uuid) {
  return prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: uuid },
    include: {
      tbl_tent_master1: true,
      tbl_user_roles: { include: { tbl_roles: true } },
    },
  });
}

export async function createTenantUser(tx, data) {
  return tx.tbl_tent_users1.create({ data });
}

export async function updateUserPasswordByUuid(uuid, hashedPassword) {
  return prisma.tbl_tent_users1.update({
    where: { user_uuid: uuid },
    data: { password: hashedPassword, modified_on: new Date() },
  });
}

// ─────────────────────────────────────────────
// Subscription-related operations
// ─────────────────────────────────────────────
export async function findFreeTrialPlan() {
  return prisma.tbl_subscription_plans.findFirst({
    where: { plan_name: "Free Trial" },
  });
}

export async function createTenantSubscription(tx, data) {
  return tx.tbl_tenant_subscriptions.create({ data });
}

// ─────────────────────────────────────────────
// Role-related operations
// ─────────────────────────────────────────────
export async function createRole(tx, data) {
  return tx.tbl_roles.create({ data });
}

export async function createUserRole(tx, data) {
  return tx.tbl_user_roles.create({ data });
}

export async function grantFullPermissions(tx, role_id) {
  const menus = await tx.tbl_menus.findMany({ select: { menu_id: true } });

  if (menus.length > 0) {
    await tx.tbl_role_permissions.createMany({
      data: menus.map((m) => ({
        role_id,
        menu_id: m.menu_id,
        can_read: true,
        can_add: true,
        can_update: true,
        can_delete: true,
      })),
    });
  }
}
