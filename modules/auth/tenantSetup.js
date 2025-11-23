import { generateShortUUID } from "../../utils/generateUUID.js";

/**
 * Creates default setup for a new tenant:
 * 1. Applies free trial subscription
 * 2. Creates default roles (Super Admin, Admin, Manager)
 * 3. Assigns Super Admin role to owner with tenant-wide access
 * 4. Grants Super Admin full permissions
 */
export async function createDefaultSetupForTenant(
  prismaTx,
  tenantId,
  ownerUserId,
  planUuid = null
) {
  // 1️⃣ Create/Fetch subscription plan
  let plan;

  if (planUuid) {
    plan = await prismaTx.tbl_subscription_plans.findUnique({
      where: { plan_uuid: planUuid },
    });
    if (!plan) {
      throw new Error("Invalid subscription plan selected");
    }
  } else {
    plan = await prismaTx.tbl_subscription_plans.findFirst({
      where: { plan_name: "Free Trial" },
    });
    if (!plan) {
      throw new Error("Default 'Free Trial' plan not found in system");
    }
  }

  // 2️⃣ Create tenant subscription
  const subscriptionUuid = generateShortUUID();
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (plan.duration_days || 30));

  await prismaTx.tbl_tenant_subscriptions.create({
    data: {
      subscription_uuid: subscriptionUuid,
      tent_id: tenantId,
      plan_id: plan.plan_id,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      is_auto_renew: false,
      payment_status: plan.price > 0 ? "PENDING" : "FREE",
    },
  });

  // 3️⃣ Create default roles
  const superAdminUUID = generateShortUUID();
  const adminUUID = generateShortUUID();
  const managerUUID = generateShortUUID();

  const [superAdmin, admin, manager] = await Promise.all([
    // Super Admin - Full system access
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: superAdminUUID,
        tent_id: tenantId,
        role_name: "Super Admin", // ✅ Changed from 'name' to 'role_name'
        description: "Full access across all branches",
        role_type: "SYSTEM",
        is_active: true,
        created_by: ownerUserId,
      },
    }),
    // Admin - Standard admin role
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: adminUUID,
        tent_id: tenantId,
        role_name: "Admin", // ✅ Changed from 'name' to 'role_name'
        description: "Administrative access with limited permissions",
        role_type: "CUSTOM",
        is_active: true,
        created_by: ownerUserId,
      },
    }),
    // Manager - Basic management role
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: managerUUID,
        tent_id: tenantId,
        role_name: "Manager", // ✅ Changed from 'name' to 'role_name'
        description: "Branch-level management access",
        role_type: "CUSTOM",
        is_active: true,
        created_by: ownerUserId,
      },
    }),
  ]);

  // 4️⃣ Assign Super Admin role to owner (tenant-wide access)
  await prismaTx.tbl_user_roles.create({
    data: {
      user_id: ownerUserId,
      role_id: superAdmin.role_id,
      branch_id: null, // NULL = tenant-wide access
      assigned_by: ownerUserId,
    },
  });

  // 5️⃣ Grant Super Admin full permissions on all menus
  const menus = await prismaTx.tbl_menus.findMany({
    select: { menu_id: true },
  });

  if (menus.length > 0) {
    await prismaTx.tbl_role_permissions.createMany({
      data: menus.map((m) => ({
        role_id: superAdmin.role_id,
        menu_id: m.menu_id,
        can_read: true,
        can_add: true,
        can_update: true,
        can_delete: true,
      })),
      skipDuplicates: true,
    });
  }

  // 6️⃣ Grant Admin moderate permissions
  if (menus.length > 0) {
    await prismaTx.tbl_role_permissions.createMany({
      data: menus.map((m) => ({
        role_id: admin.role_id,
        menu_id: m.menu_id,
        can_read: true,
        can_add: true,
        can_update: true,
        can_delete: false,
      })),
      skipDuplicates: true,
    });
  }

  // 7️⃣ Grant Manager basic permissions
  if (menus.length > 0) {
    await prismaTx.tbl_role_permissions.createMany({
      data: menus.map((m) => ({
        role_id: manager.role_id,
        menu_id: m.menu_id,
        can_read: true,
        can_add: true,
        can_update: false,
        can_delete: false,
      })),
      skipDuplicates: true,
    });
  }

  return {
    subscription: {
      subscription_uuid: subscriptionUuid,
      plan_name: plan.plan_name,
    },
    roles: {
      superAdmin: { role_uuid: superAdminUUID, role_name: "Super Admin" },
      admin: { role_uuid: adminUUID, role_name: "Admin" },
      manager: { role_uuid: managerUUID, role_name: "Manager" },
    },
  };
}
