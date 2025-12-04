// repositories/tenant.repository.js
import { generateShortUUID } from "../../utils/generateUUID.js";

/**
 * Create Tenant Core
 *
 * Creates:
 *   1. Tenant
 *   2. HQ Branch
 *   3. Link user to tenant + branch
 *   4. Default roles (Super Admin + Admin)
 *   5. Assign Super Admin to owner
 *   6. Subscription
 *
 * Returns:
 *   { tenant, branch, updatedUser, roles, subscription }
 */

export async function createTenantCore(prisma, user, data, planUuid) {
  const {
    tenant_name,
    tenant_phone,
    tenant_email,
    tenant_address1,
    tenant_address2,
    tenant_state,
    tenant_country,
    tenant_postalcode,
    tenant_registration_number,
  } = data;

  const tenant_uuid = generateShortUUID();
  const branch_uuid = generateShortUUID();

  return prisma.$transaction(
    async (tx) => {
      // ==================================================
      // 1️⃣ CREATE TENANT
      // ==================================================
      const tenant = await tx.tbl_tenant.create({
        data: {
          tenant_uuid,
          tenant_name,
          tenant_phone,
          tenant_email: tenant_email || user.user_email,
          tenant_address1,
          tenant_address2,
          tenant_state,
          tenant_country,
          tenant_postalcode,
          tenant_registration_number,
          tenant_status: true,
          tenant_country_code: null,
          is_mobile_verified: false,
          is_email_verified: false,
        },
      });

      console.log("  ✅ Tenant created:", tenant.tenant_id);

      // ==================================================
      // 2️⃣ CREATE HQ BRANCH
      // ==================================================
      const branch = await tx.tbl_branches.create({
        data: {
          branch_uuid,
          tenant_id: tenant.tenant_id,
          branch_name: `${tenant_name} - HQ`,
          is_hq: true,
          status: true,
          address1: tenant_address1,
          address2: tenant_address2,
          country: tenant_country,
          state: tenant_state,
          postal_code: tenant_postalcode,
          phone: tenant_phone,
        },
      });

      console.log("  ✅ HQ branch created:", branch.branch_id);

      // ==================================================
      // 3️⃣ LINK USER TO TENANT
      // ==================================================
      const updatedUser = await tx.tbl_tenant_users.update({
        where: { tenant_user_uuid: user.tenant_user_uuid },
        data: {
          tenant_id: tenant.tenant_id,
          branch_id: branch.branch_id,
          is_owner: true,
          modified_on: new Date(),
        },
        select: {
          tenant_user_id: true,
          tenant_user_uuid: true,
          user_email: true,
          user_name: true,
          tenant_id: true,
          branch_id: true,
          global_user_id: true, // ← NEW: now always included
        },
      });

      console.log("  ✅ User linked to tenant:", updatedUser.tenant_user_id);

      // ==================================================
      // 4️⃣ CREATE DEFAULT ROLES
      // ==================================================
      const roles = await createDefaultRoles(
        tx,
        tenant.tenant_id,
        updatedUser.tenant_user_id
      );

      console.log("  ✅ Default roles created");

      // ==================================================
      // 5️⃣ ASSIGN SUPER ADMIN ROLE TO OWNER
      // ==================================================
      await tx.tbl_user_roles.create({
        data: {
          tenant_user_id: updatedUser.tenant_user_id,
          role_id: roles.superAdmin.role_id,
          branch_id: null,
          assigned_by: updatedUser.tenant_user_id,
        },
      });

      console.log("  ✅ Super Admin assigned to owner");

      // ==================================================
      // 6️⃣ CREATE SUBSCRIPTION
      // ==================================================
      const subscription = await createSubscriptionRecord(
        tx,
        tenant.tenant_id,
        updatedUser.tenant_user_id,
        planUuid
      );

      console.log("  ✅ Subscription created:", subscription.subscription_id);

      // ==================================================
      // DONE → SEND BACK SANITIZED DATA
      // ==================================================
      return {
        tenant,
        branch,
        updatedUser,
        roles,
        subscription,
      };
    },
    { timeout: 20000 }
  );
}

/**
 * Default Roles (SuperAdmin + Admin)
 */
export async function createDefaultRoles(tx, tenantId, ownerUserId) {
  const superAdminUUID = generateShortUUID();
  const adminUUID = generateShortUUID();

  const [superAdmin, admin] = await Promise.all([
    tx.tbl_roles.create({
      data: {
        role_uuid: superAdminUUID,
        tenant_id: tenantId,
        role_name: "Super Admin",
        description: "Full system access with all permissions",
        role_type: "SYSTEM",
        is_active: true,
        created_by: null,
        updated_by: null,
        updated_at: new Date(),
      },
    }),
    tx.tbl_roles.create({
      data: {
        role_uuid: adminUUID,
        tenant_id: tenantId,
        role_name: "Admin",
        description: "Administrative role with most permissions",
        role_type: "CUSTOM",
        is_active: true,
        created_by: null,
        updated_by: null,
        updated_at: new Date(),
      },
    }),
  ]);

  return { superAdmin, admin };
}

/**
 * Subscription Creation
 */
export async function createSubscriptionRecord(
  tx,
  tenantId,
  tenantUserId,
  planUuid
) {
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
      tenant_id: tenantId,
      tenant_user_id: tenantUserId,
      plan_id: plan.plan_id,
      start_date: start,
      end_date: end,
      is_active: true,
      is_auto_renew: false,
      payment_status:
        Number(plan.price_monthly) > 0 || Number(plan.price_yearly) > 0
          ? "PENDING"
          : "FREE",
    },
  });
}

/**
 * Create Tenant Permissions (Same as earlier)
 */
export async function createTenantPermissions(prisma, roles) {
  const menus = await prisma.tbl_menus.findMany({
    select: { menu_id: true },
  });

  if (!menus.length) {
    console.warn("⚠️ No menus found. Skipping permissions creation.");
    return;
  }

  const permissionsData = [];

  menus.forEach((menu) => {
    permissionsData.push({
      role_id: roles.superAdmin.role_id,
      menu_id: menu.menu_id,
      can_read: true,
      can_add: true,
      can_update: true,
      can_delete: true,
    });

    permissionsData.push({
      role_id: roles.admin.role_id,
      menu_id: menu.menu_id,
      can_read: true,
      can_add: true,
      can_update: true,
      can_delete: false,
    });
  });

  await prisma.tbl_role_permissions.createMany({
    data: permissionsData,
    skipDuplicates: true,
  });

  console.log(`  ⚙️ Created ${permissionsData.length} permissions`);
}
