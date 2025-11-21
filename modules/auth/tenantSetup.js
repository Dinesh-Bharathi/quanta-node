import { generateShortUUID } from "../../utils/generateUUID.js";

/**
 * Initializes default tenant setup:
 *  - Creates HQ branch
 *  - Applies free trial subscription
 *  - Creates roles: Super Admin (tenant-wide), Branch Manager (HQ), Admin (HQ)
 *  - Assigns Super Admin role to tenant owner
 *  - Grants Super Admin full menu permissions
 */
export async function createDefaultSetupForTenant(
  prismaTx,
  tenantId,
  branchId,
  ownerUserId
) {
  // 1️⃣ Create HQ branch
  // const hqBranchUuid = generateShortUUID();

  // const hqBranch = await prismaTx.tbl_branches.create({
  //   data: {
  //     branch_uuid: hqBranchUuid,
  //     tent_id: tenantId,
  //     branch_name: "Headquarters",
  //     is_hq: true,
  //     status: true,
  //   },
  //   select: {
  //     branch_id: true,
  //     branch_uuid: true,
  //   },
  // });

  // 2️⃣ Fetch Free Trial plan
  const freePlan = await prismaTx.tbl_subscription_plans.findFirst({
    where: { plan_name: "Free Trial" },
  });

  if (!freePlan) {
    throw new Error("Default 'Free Trial' plan not found");
  }

  // 3️⃣ Create tenant subscription
  const subscriptionUuid = generateShortUUID();
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + (freePlan.duration_days || 30));

  await prismaTx.tbl_tenant_subscriptions.create({
    data: {
      subscription_uuid: subscriptionUuid,
      tent_id: tenantId,
      plan_id: freePlan.plan_id,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      is_auto_renew: false,
      payment_status: "FREE",
    },
  });

  // 4️⃣ Create default roles (Super Admin, Admin, Branch Manager)
  const superAdminUUID = generateShortUUID();
  const adminUUID = generateShortUUID();
  const branchManagerUUID = generateShortUUID();

  // ❌ prismaTx.$transaction(...)  --> Not supported inside an active tx
  // ✅ Use Promise.all()
  const [superAdmin, admin, branchManager] = await Promise.all([
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: superAdminUUID,
        role_group_uuid: superAdminUUID,
        tent_id: tenantId,
        branch_id: null,
        name: "Super Admin",
        description: "Full access across the system",
        role_type: "SYSTEM",
        is_active: true,
      },
    }),
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: adminUUID,
        role_group_uuid: adminUUID,
        tent_id: tenantId,
        branch_id: branchId,
        name: "Admin",
        description: "Administration access for HQ branch",
        role_type: "CUSTOM",
        is_active: true,
      },
    }),
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: branchManagerUUID,
        role_group_uuid: branchManagerUUID,
        tent_id: tenantId,
        branch_id: branchId,
        name: "Branch Manager",
        description: "Manages HQ-level operations",
        role_type: "CUSTOM",
        is_active: true,
      },
    }),
  ]);

  // 5️⃣ Assign Super Admin to owner user
  await prismaTx.tbl_user_roles.create({
    data: {
      user_id: ownerUserId,
      role_id: superAdmin.role_id,
    },
  });

  // 6️⃣ Grant Super Admin full permissions
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
    });
  }

  return {
    superAdmin,
    admin,
    branchManager,
  };
}
