import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

/** ------------------ ROLE MANAGEMENT ------------------- **/

/**
 * Get all roles for a tenant
 */
export async function getTenantRolesService({ tenantUuid }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const roles = await prisma.tbl_roles.findMany({
    where: { tenant_id: tenant.tenant_id },
    include: {
      createdByUser: {
        // ✅ UPDATED RELATION
        select: { user_name: true },
      },
      updatedByUser: {
        // ✅ UPDATED RELATION
        select: { user_name: true },
      },
      _count: {
        select: { tbl_user_roles: true }, // Count assigned users
      },
    },
    orderBy: { created_at: "desc" },
  });

  return roles.map((role) => ({
    role_uuid: role.role_uuid,
    role_name: role.role_name,
    description: role.description,
    role_type: role.role_type,
    is_active: role.is_active,
    assigned_users_count: role._count.tbl_user_roles,
    created_by: role.createdByUser?.user_name || null,
    updated_by: role.updatedByUser?.user_name || null,
    created_at: role.created_at,
    updated_at: role.updated_at,
  }));
}

/**
 * Get single role by UUID with full CRUD permissions
 */
export async function getTenantRoleByUuidService(roleUuid) {
  const role = await prisma.tbl_roles.findUnique({
    where: { role_uuid: roleUuid },
    include: {
      tbl_role_permissions: {
        include: {
          tbl_menus: true, // menu object still correct based on schema
        },
      },
    },
  });

  if (!role) return null;

  // ========================================
  // BUILD PERMISSIONS MAP
  // ========================================
  const permissions = {};

  for (const rp of role.tbl_role_permissions) {
    if (!rp.tbl_menus) continue; // Menu deleted or missing → skip safely

    const menuPath = rp.tbl_menus.path;

    permissions[menuPath] = {
      enabled: rp.can_read || rp.can_add || rp.can_update || rp.can_delete,

      read: rp.can_read,
      add: rp.can_add,
      update: rp.can_update,
      delete: rp.can_delete,
    };
  }

  return {
    role_uuid: role.role_uuid,
    role_name: role.role_name,
    description: role.description,
    role_type: role.role_type,
    is_active: role.is_active,
    permissions,
  };
}

/**
 * Create a new role inside a tenant with menu CRUD permissions
 */
export async function addTenantRoleService({
  tenantUuid,
  role_name,
  description,
  permissions,
  created_by,
}) {
  // ========================================
  // 1️⃣ Validate tenant
  // ========================================
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // ========================================
  // 2️⃣ Check if role name already exists
  // ========================================
  const existingRole = await prisma.tbl_roles.findFirst({
    where: {
      tenant_id: tenant.tenant_id,
      role_name,
    },
  });

  if (existingRole) {
    throw new Error(`Role "${role_name}" already exists for this tenant`);
  }

  // ========================================
  // 3️⃣ Build menu → menuID map
  // ========================================
  const allMenus = await prisma.tbl_menus.findMany({
    select: {
      menu_id: true,
      path: true,
    },
  });

  const menuMap = new Map(allMenus.map((m) => [m.path, m.menu_id]));

  // role UUID
  const role_uuid = generateShortUUID();

  // ========================================
  // 4️⃣ Create role + permissions (transaction)
  // ========================================
  return await prisma.$transaction(async (tx) => {
    // -----------------------------
    // Create Role
    // -----------------------------
    const role = await tx.tbl_roles.create({
      data: {
        role_uuid,
        role_name,
        description,
        role_type: "CUSTOM",
        is_active: true,
        tenant_id: tenant.tenant_id,
        created_by,
        updated_by: created_by,
      },
    });

    // -----------------------------
    // Build Permissions Data
    // -----------------------------
    const rolePermissions = Object.entries(permissions)
      .filter(([menuPath]) => menuMap.has(menuPath)) // Only valid menus
      .map(([menuPath, perm]) => ({
        role_id: role.role_id,
        menu_id: menuMap.get(menuPath),
        can_read: perm.read || false,
        can_add: perm.add || false,
        can_update: perm.update || false,
        can_delete: perm.delete || false,
      }));

    // -----------------------------
    // Insert Permissions
    // -----------------------------
    if (rolePermissions.length > 0) {
      await tx.tbl_role_permissions.createMany({
        data: rolePermissions,
      });
    }

    return {
      role_uuid: role.role_uuid,
      role_name: role.role_name,
      description: role.description,
      created_at: role.created_at,
    };
  });
}

/**
 * Update an existing role
 */
export async function updateTenantRoleService({
  roleUuid,
  tenantUuid,
  roleName,
  description,
  permissions,
  updatedBy = null,
}) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Find role
  const role = await prisma.tbl_roles.findFirst({
    where: {
      role_uuid: roleUuid,
      tenant_id: tenant.tenant_id,
    },
  });
  if (!role) throw new Error("Role not found");

  // 3️⃣ Check if new name conflicts with another role
  if (roleName !== role.role_name && roleUuid !== role.role_uuid) {
    const existingRole = await prisma.tbl_roles.findFirst({
      where: {
        tenant_id: tenant.tenant_id,
        role_uuid: roleUuid,
        NOT: { role_id: role.role_id },
      },
    });
    if (existingRole) {
      throw new Error(`Role "${roleName}" already exists for this tenant`);
    }
  }

  // 4️⃣ Prepare menu mapping
  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));

  // 5️⃣ Update role and permissions in transaction
  return await prisma.$transaction(async (tx) => {
    // Update role details
    await tx.tbl_roles.update({
      where: { role_id: role.role_id },
      data: {
        role_name: roleName,
        description,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });

    // Delete old permissions
    await tx.tbl_role_permissions.deleteMany({
      where: { role_id: role.role_id },
    });

    // Create new permissions
    const rolePermissions = Object.entries(permissions)
      .filter(([path]) => menuMap[path])
      .map(([path, perm]) => ({
        role_id: role.role_id,
        menu_id: menuMap[path],
        can_read: perm.read || false,
        can_add: perm.add || false,
        can_update: perm.update || false,
        can_delete: perm.delete || false,
      }));

    if (rolePermissions.length) {
      await tx.tbl_role_permissions.createMany({
        data: rolePermissions,
      });
    }

    return {
      role_uuid: roleUuid,
      role_name: roleName,
      description,
    };
  });
}

/**
 * Delete a role safely:
 * - Must belong to tenant
 * - Must not be SYSTEM role
 * - Must not be assigned to any user
 */
export async function deleteTenantRoleService({ tenantUuid, roleUuid }) {
  // =============================
  // 1️⃣ Validate tenant
  // =============================
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // =============================
  // 2️⃣ Fetch role
  // =============================
  const role = await prisma.tbl_roles.findFirst({
    where: {
      role_uuid: roleUuid,
      tenant_id: tenant.tenant_id,
    },
    select: {
      role_id: true,
      role_name: true,
      role_type: true, // IMPORTANT: used to restrict SYSTEM
    },
  });

  if (!role) throw new Error("Role not found");

  // =============================
  // 3️⃣ SYSTEM ROLE PROTECTION
  // =============================
  if (role.role_type === "SYSTEM") {
    throw new Error(
      `Cannot delete SYSTEM role "${role.role_name}". System roles are protected.`
    );
  }

  // =============================
  // 4️⃣ Check assigned users
  // =============================
  const assignedUsers = await prisma.tbl_user_roles.findMany({
    where: { role_id: role.role_id },
    select: { tenant_user_id: true },
  });

  if (assignedUsers.length > 0) {
    throw new Error(
      `Cannot delete role "${role.role_name}". It is assigned to ${assignedUsers.length} user(s). Please remove all assignments first.`
    );
  }

  // =============================
  // 5️⃣ Delete role (permissions cascade via foreign key)
  // =============================
  await prisma.tbl_roles.delete({
    where: { role_id: role.role_id },
  });

  return {
    deleted: true,
    role_name: role.role_name,
  };
}

/** ------------------ TENANT MENU ------------------- **/

/**
 * Fetch menus subscribed by a tenant based on their active plan
 */
export async function getTenantMenuService(tenantUuid) {
  // ========================================
  // 1️⃣ Fetch Tenant + Active Subscription + Plan + Menus
  // ========================================
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    include: {
      tbl_tenant_subscriptions: {
        where: {
          is_active: true,
          end_date: { gte: new Date() }, // Only active + not expired
        },
        include: {
          tbl_subscription_plans: {
            include: {
              tbl_plan_menus: {
                include: {
                  tbl_menus: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  if (!tenant.tbl_tenant_subscriptions.length) {
    throw new Error("No active subscription found for this tenant");
  }

  // ========================================
  // 2️⃣ Collect All Menus from All Plans
  // ========================================
  const menuItems = tenant.tbl_tenant_subscriptions.flatMap((subscription) =>
    subscription.tbl_subscription_plans.tbl_plan_menus.map((pm) => pm.tbl_menus)
  );

  if (!menuItems.length) {
    return { mainNavigation: [], footerNavigation: [] };
  }

  // ========================================
  // 3️⃣ Make Menus Unique + Sort
  // ========================================
  const uniqueMenus = [
    ...new Map(menuItems.map((m) => [m.menu_id, m])).values(),
  ].sort((a, b) => a.sort_order - b.sort_order);

  // ========================================
  // 4️⃣ Build Menu Structure
  // ========================================
  const map = {};
  const mainGroups = {};
  const footerGroups = {};

  // Prepare map entries
  uniqueMenus.forEach((menu) => {
    map[menu.menu_id] = {
      title: menu.menu_name,
      url: menu.path,
      icon: menu.icon || null,
      subItems: [],
      menu_group: menu.menu_group,
      is_main_menu: !!menu.is_main_menu,
      is_footer_menu: !!menu.is_footer_menu,
      sort_order: menu.sort_order,
    };
  });

  // Attach children under parent
  uniqueMenus.forEach((menu) => {
    if (menu.parent_menu_id && map[menu.parent_menu_id]) {
      map[menu.parent_menu_id].subItems.push(map[menu.menu_id]);
    }
  });

  // Group main & footer categories
  uniqueMenus.forEach((menu) => {
    if (!menu.parent_menu_id) {
      if (menu.is_main_menu) {
        if (!mainGroups[menu.menu_group]) mainGroups[menu.menu_group] = [];
        mainGroups[menu.menu_group].push(map[menu.menu_id]);
      }

      if (menu.is_footer_menu) {
        if (!footerGroups[menu.menu_group]) footerGroups[menu.menu_group] = [];
        footerGroups[menu.menu_group].push(map[menu.menu_id]);
      }
    }
  });

  // ========================================
  // 5️⃣ Final Navigation Structure
  // ========================================
  return {
    mainNavigation: Object.entries(mainGroups).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.sort_order - b.sort_order),
    })),
    footerNavigation: Object.entries(footerGroups).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.sort_order - b.sort_order),
    })),
  };
}

/** ------------------ USER MENU ------------------- **/

/**
 * Build menu structure for user in a specific branch
 */
export async function getUsermenuService(userUuid, branchUuid) {
  // ========================================
  // 1️⃣ Validate User
  // ========================================
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
    select: { tenant_user_id: true, tenant_id: true },
  });

  if (!user) throw new Error("User not found");

  // ========================================
  // 2️⃣ Validate Branch Context
  // ========================================
  const branch = await prisma.tbl_branches.findUnique({
    where: { branch_uuid: branchUuid },
    select: { branch_id: true, tenant_id: true, status: true },
  });

  if (!branch) throw new Error("Branch not found");
  if (!branch.status) throw new Error("Branch is inactive");
  if (branch.tenant_id !== user.tenant_id) {
    throw new Error("Branch does not belong to user's organization");
  }

  const currentBranchId = branch.branch_id;

  // ========================================
  // 3️⃣ Fetch User Role Assignments
  // ========================================
  const assignments = await prisma.tbl_user_roles.findMany({
    where: { tenant_user_id: user.tenant_user_id },
    include: {
      role: true,
    },
  });

  if (!assignments.length) {
    return { mainNavigation: [], footerNavigation: [] };
  }

  // ========================================
  // 4️⃣ Determine Eligible Roles (tenant-wide OR branch-specific)
  // ========================================
  const eligibleRoleIds = [];

  for (const assignment of assignments) {
    if (assignment.branch_id === null) {
      eligibleRoleIds.push(assignment.role_id); // Tenant-wide
    } else if (assignment.branch_id === currentBranchId) {
      eligibleRoleIds.push(assignment.role_id); // Branch-specific
    }
  }

  if (!eligibleRoleIds.length) {
    return { mainNavigation: [], footerNavigation: [] };
  }

  // ========================================
  // 5️⃣ Fetch Permissions Based on Roles
  // ========================================
  const permissionRows = await prisma.tbl_role_permissions.findMany({
    where: { role_id: { in: eligibleRoleIds } },
    include: { tbl_menus: true },
    orderBy: { menu_id: "asc" },
  });

  // ========================================
  // 6️⃣ Merge Permissions (union)
  // ========================================
  const mergedPermissions = new Map();

  for (const rp of permissionRows) {
    const menu = rp.tbl_menus;
    if (!menu) continue;

    const existing = mergedPermissions.get(menu.menu_id) || {
      menu,
      permissions: { read: false, add: false, update: false, delete: false },
    };

    mergedPermissions.set(menu.menu_id, {
      menu,
      permissions: {
        read: existing.permissions.read || rp.can_read,
        add: existing.permissions.add || rp.can_add,
        update: existing.permissions.update || rp.can_update,
        delete: existing.permissions.delete || rp.can_delete,
      },
    });
  }

  // ========================================
  // 7️⃣ Extract Menus User Can Access
  // ========================================
  const accessibleMenus = [...mergedPermissions.values()]
    .filter((m) => m.permissions.read === true) // Only menus with read access
    .map((m) => ({ ...m.menu, permissions: m.permissions }))
    .sort((a, b) => a.sort_order - b.sort_order);

  // ========================================
  // 8️⃣ Build Menu Map for Hierarchy
  // ========================================
  const menuMap = {};
  const mainGroups = {};
  const footerGroups = {};

  for (const menu of accessibleMenus) {
    menuMap[menu.menu_id] = {
      title: menu.menu_name,
      url: menu.path,
      icon: menu.icon,
      permissions: menu.permissions,
      menu_group: menu.menu_group,
      is_main_menu: !!menu.is_main_menu,
      is_footer_menu: !!menu.is_footer_menu,
      sort_order: menu.sort_order,
      subItems: [],
    };
  }

  // ========================================
  // 9️⃣ Build Parent-Child Relationships
  // ========================================
  for (const menu of accessibleMenus) {
    if (menu.parent_menu_id && menuMap[menu.parent_menu_id]) {
      menuMap[menu.parent_menu_id].subItems.push(menuMap[menu.menu_id]);
    }
  }

  // ========================================
  // 🔟 Group Menus into Main & Footer Navigation
  // ========================================
  for (const menu of accessibleMenus) {
    if (!menu.parent_menu_id) {
      // Top-level menu
      if (menu.is_main_menu) {
        if (!mainGroups[menu.menu_group]) mainGroups[menu.menu_group] = [];
        mainGroups[menu.menu_group].push(menuMap[menu.menu_id]);
      }

      if (menu.is_footer_menu) {
        if (!footerGroups[menu.menu_group]) footerGroups[menu.menu_group] = [];
        footerGroups[menu.menu_group].push(menuMap[menu.menu_id]);
      }
    }
  }

  // ========================================
  // 1️⃣1️⃣ Final Response Format
  // ========================================
  return {
    mainNavigation: Object.entries(mainGroups).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.sort_order - b.sort_order),
    })),
    footerNavigation: Object.entries(footerGroups).map(([title, items]) => ({
      title,
      items: items.sort((a, b) => a.sort_order - b.sort_order),
    })),
  };
}
