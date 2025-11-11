import { generateShortUUID } from "../../utils/generateUUID.js";

/**
 * Initializes default tenant setup:
 *  - Creates free trial subscription
 *  - Creates roles: Super Admin + Admin
 *  - Assigns Super Admin role to tenant owner
 *  - Grants Super Admin full menu permissions
 */
export async function createDefaultSetupForTenant(
  prismaTx,
  tenantId,
  ownerUserId
) {
  // 1️⃣  Fetch Free Trial plan
  const freePlan = await prismaTx.tbl_subscription_plans.findFirst({
    where: { plan_name: "Free Trial" },
  });

  if (!freePlan) {
    throw new Error("Default 'Free Trial' plan not found");
  }

  // 2️⃣  Create tenant subscription
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

  // 3️⃣  Create default roles
  const superAdminUUID = generateShortUUID();
  const adminUUID = generateShortUUID();

  const [superAdmin, admin] = await prismaTx.$transaction([
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: superAdminUUID,
        tent_id: tenantId,
        name: "Super Admin",
        description: "Full access across system",
        role_type: "SYSTEM",
        is_active: true,
      },
    }),
    prismaTx.tbl_roles.create({
      data: {
        role_uuid: adminUUID,
        tent_id: tenantId,
        name: "Admin",
        description: "Access and manages administration",
        role_type: "CUSTOM",
        is_active: true,
      },
    }),
  ]);

  // 4️⃣  Assign Super Admin to owner user
  await prismaTx.tbl_user_roles.create({
    data: {
      user_id: ownerUserId,
      role_id: superAdmin.role_id,
    },
  });

  // 5️⃣  Grant Super Admin permissions to all menus
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

  // 6️⃣  (Optional) Grant Admin limited permissions later if needed
  return { superAdmin, admin };
}
