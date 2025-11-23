import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";

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

export async function createTenantCore(prisma, user, data, planUuid) {
  const {
    tent_name,
    tent_phone,
    tent_email,
    tent_address1,
    tent_address2,
    tent_state,
    tent_country,
    tent_postalcode,
    tent_registration_number,
  } = data;

  const tent_uuid = generateShortUUID();
  const branch_uuid = generateShortUUID();

  return await prisma.$transaction(
    async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tbl_tent_master1.create({
        data: {
          tent_uuid,
          tent_name,
          tent_phone,
          tent_email: tent_email || user.user_email,
          tent_address1,
          tent_address2,
          tent_state,
          tent_country,
          tent_postalcode,
          tent_registration_number,
          tent_status: true,
        },
      });

      // 2. Create HQ Branch
      const branch = await tx.tbl_branches.create({
        data: {
          branch_uuid,
          tent_id: tenant.tent_id,
          branch_name: tent_name,
          is_hq: true,
          status: true,
          address1: tent_address1,
          address2: tent_address2,
          country: tent_country,
          state: tent_state,
          postal_code: tent_postalcode,
          phone: tent_phone,
        },
      });

      // 3. Link User to Tenant
      const updatedUser = await tx.tbl_tent_users1.update({
        where: { user_uuid: user.user_uuid },
        data: {
          tent_id: tenant.tent_id,
          is_owner: true,
        },
      });

      // 4. Create Default Roles (NOT permissions)
      const { superAdmin, admin, manager } = await createDefaultRoles(
        tx,
        tenant.tent_id,
        updatedUser.user_id
      );

      // 5. Create Subscription (simple)
      const subscription = await createSubscriptionRecord(
        tx,
        tenant.tent_id,
        planUuid
      );

      return {
        tenant,
        branch,
        updatedUser,
        roles: { superAdmin, admin, manager },
        subscription,
      };
    },
    { timeout: 20000 }
  ); // safe
}

export async function createDefaultRoles(tx, tenantId, ownerUserId) {
  const superUUID = generateShortUUID();
  const adminUUID = generateShortUUID();
  const managerUUID = generateShortUUID();

  const [superAdmin, admin, manager] = await Promise.all([
    tx.tbl_roles.create({
      data: {
        role_uuid: superUUID,
        tent_id: tenantId,
        role_name: "Super Admin",
        description: "Full access",
        role_type: "SYSTEM",
        created_by: ownerUserId,
      },
    }),
    tx.tbl_roles.create({
      data: {
        role_uuid: adminUUID,
        tent_id: tenantId,
        role_name: "Admin",
        description: "Administrative role",
        role_type: "CUSTOM",
        created_by: ownerUserId,
      },
    }),
    tx.tbl_roles.create({
      data: {
        role_uuid: managerUUID,
        tent_id: tenantId,
        role_name: "Manager",
        description: "Branch manager",
        role_type: "CUSTOM",
        created_by: ownerUserId,
      },
    }),
  ]);

  // Assign super admin to owner
  await tx.tbl_user_roles.create({
    data: {
      user_id: ownerUserId,
      role_id: superAdmin.role_id,
      branch_id: null, // tenant-wide
      assigned_by: ownerUserId,
    },
  });

  return { superAdmin, admin, manager };
}

export async function createSubscriptionRecord(tx, tenantId, planUuid) {
  // fetch plan
  const plan = planUuid
    ? await tx.tbl_subscription_plans.findUnique({
        where: { plan_uuid: planUuid },
      })
    : await tx.tbl_subscription_plans.findFirst({
        where: { plan_name: "Free Trial" },
      });

  if (!plan) throw new Error("Subscription plan not found");

  const subscription_uuid = generateShortUUID();
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + (plan.duration_days || 30));

  return tx.tbl_tenant_subscriptions.create({
    data: {
      subscription_uuid,
      tent_id: tenantId,
      plan_id: plan.plan_id,
      start_date: start,
      end_date: end,
      is_active: true,
      is_auto_renew: false,
      payment_status: plan.price > 0 ? "PENDING" : "FREE",
    },
  });
}

export async function createTenantPermissions(prisma, roles) {
  const menus = await prisma.tbl_menus.findMany({
    select: { menu_id: true },
  });

  if (!menus.length) return;

  const data = [];

  menus.forEach((m) => {
    data.push({
      role_id: roles.superAdmin.role_id,
      menu_id: m.menu_id,
      can_read: true,
      can_add: true,
      can_update: true,
      can_delete: true,
    });

    data.push({
      role_id: roles.admin.role_id,
      menu_id: m.menu_id,
      can_read: true,
      can_add: true,
      can_update: true,
      can_delete: false,
    });

    data.push({
      role_id: roles.manager.role_id,
      menu_id: m.menu_id,
      can_read: true,
      can_add: true,
      can_update: false,
      can_delete: false,
    });
  });

  // Batch insert after transaction
  await prisma.tbl_role_permissions.createMany({
    data,
    skipDuplicates: true,
  });
}
