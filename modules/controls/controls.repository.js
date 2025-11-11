import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";

/** ------------------ ROLES ------------------- **/

export async function getTenantRolesRepo(tentUuid) {
  const roles = await prisma.tbl_roles.findMany({
    where: {
      tbl_tent_master1: { tent_uuid: tentUuid },
      is_delete: false,
    },
    include: {
      tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1: {
        select: { user_name: true },
      },
      tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1: {
        select: { user_name: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  return roles.map((r) => ({
    role_uuid: r.role_uuid,
    role_name: r.name,
    description: r.description,
    role_type: r.role_type,
    is_active: r.is_active,
    created_user:
      r.tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1?.user_name ||
      null,
    updated_user:
      r.tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1?.user_name ||
      null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getTenantRoleByUuidRepo(roleUuid) {
  const role = await prisma.tbl_roles.findUnique({
    where: { role_uuid: roleUuid },
    include: {
      tbl_role_permissions: {
        include: { tbl_menus: true },
      },
    },
  });

  if (!role) return null;

  const permissions = {};
  for (const rp of role.tbl_role_permissions) {
    permissions[rp.tbl_menus.path] = {
      enabled: rp.can_read || rp.can_add || rp.can_update || rp.can_delete,
      read: rp.can_read,
      add: rp.can_add,
      update: rp.can_update,
      delete: rp.can_delete,
    };
  }

  return {
    roleName: role.name,
    description: role.description,
    permissions,
  };
}

export async function createTenantRoleRepo({
  tentUuid,
  roleName,
  description,
  permissions,
}) {
  const tent = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
  });
  if (!tent) throw new Error("Invalid tenant UUID");

  const roleUuid = generateShortUUID();

  const role = await prisma.tbl_roles.create({
    data: {
      role_uuid: roleUuid,
      tent_id: tent.tent_id,
      name: roleName,
      description,
      role_type: "CUSTOM",
    },
  });

  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));

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
    await prisma.tbl_role_permissions.createMany({ data: rolePermissions });
  }

  return {
    roleUuid,
    roleName,
    description,
    permissionsCount: rolePermissions.length,
  };
}

export async function updateTenantRoleRepo({
  roleUuid,
  roleName,
  description,
  permissions,
}) {
  const role = await prisma.tbl_roles.findUnique({
    where: { role_uuid: roleUuid },
  });
  if (!role) throw new Error("Invalid role UUID");

  await prisma.tbl_roles.update({
    where: { role_id: role.role_id },
    data: { name: roleName, description },
  });

  await prisma.tbl_role_permissions.deleteMany({
    where: { role_id: role.role_id },
  });

  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));

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
    await prisma.tbl_role_permissions.createMany({ data: rolePermissions });
  }

  return {
    roleUuid,
    roleName,
    description,
    permissionsCount: rolePermissions.length,
  };
}

export async function deleteTenantRoleRepo(roleUuid) {
  const role = await prisma.tbl_roles.findUnique({
    where: { role_uuid: roleUuid },
  });
  if (!role) throw new Error("Role not found");

  await prisma.tbl_role_permissions.deleteMany({
    where: { role_id: role.role_id },
  });
  await prisma.tbl_roles.delete({
    where: { role_id: role.role_id },
  });

  return { roleUuid, deleted: true };
}

/** ------------------ USER MANAGEMENT ------------------- **/

/**
 * Get all users in a tenant
 */
export async function getTenantUsersRepo(tentUuid) {
  const users = await prisma.tbl_tent_users1.findMany({
    where: {
      tbl_tent_master1: { tent_uuid: tentUuid },
    },
    include: {
      tbl_user_roles: {
        include: { tbl_roles: true },
      },
    },
    orderBy: { created_on: "asc" },
  });

  return users.map((u) => ({
    user_uuid: u.user_uuid,
    user_name: u.user_name,
    user_email: u.user_email,
    user_country_code: u.user_country_code,
    user_phone: u.user_phone,
    is_owner: u.is_owner,
    created_on: u.created_on,
    modified_on: u.modified_on,
    role_uuid: u.tbl_user_roles[0]?.tbl_roles?.role_uuid || null,
    role_name: u.tbl_user_roles[0]?.tbl_roles?.name || null,
  }));
}

/**
 * Create a new tenant user
 */
export async function createTenantUserRepo({
  tentUuid,
  user_name,
  user_email,
  user_country_code,
  user_phone,
  password,
  role_uuid,
  is_owner,
}) {
  const tent = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
  });
  if (!tent) throw new Error("Tenant not found");

  const user_uuid = generateShortUUID();
  const hashedPassword = await hashPassword(password);

  const user = await prisma.tbl_tent_users1.create({
    data: {
      tent_id: tent.tent_id,
      user_uuid,
      user_name,
      user_email,
      user_country_code,
      user_phone,
      password: hashedPassword,
      is_owner,
      is_email_verified: false,
    },
  });

  if (role_uuid) {
    const role = await prisma.tbl_roles.findUnique({
      where: { role_uuid },
    });
    if (role) {
      await prisma.tbl_user_roles.create({
        data: { user_id: user.user_id, role_id: role.role_id },
      });
    }
  }

  return {
    user_uuid: user.user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
    role_uuid,
    is_owner: user.is_owner,
  };
}

/**
 * Update a tenant user and their role
 */
export async function updateTenantUserRepo({
  userUuid,
  user_name,
  user_email,
  user_phone,
  role_uuid,
}) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
  });

  if (!user) throw new Error("User not found");

  // ✅ Update user info
  await prisma.tbl_tent_users1.update({
    where: { user_uuid: userUuid },
    data: {
      user_name,
      user_email,
      user_phone,
      modified_on: new Date(),
    },
  });

  if (role_uuid) {
    const role = await prisma.tbl_roles.findUnique({
      where: { role_uuid },
    });

    if (role) {
      const existingRole = await prisma.tbl_user_roles.findFirst({
        where: { user_id: user.user_id },
      });

      if (existingRole) {
        await prisma.tbl_user_roles.update({
          where: { id: existingRole.id },
          data: { role_id: role.role_id },
        });
      } else {
        await prisma.tbl_user_roles.create({
          data: { user_id: user.user_id, role_id: role.role_id },
        });
      }
    }
  }

  return { userUuid, user_name, user_email, user_phone, role_uuid };
}

/**
 * Delete a user and their associated roles
 */
export async function deleteTenantUserRepo(userUuid) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
  });

  if (!user) throw new Error("User not found");

  await prisma.tbl_user_roles.deleteMany({
    where: { user_id: user.user_id },
  });

  await prisma.tbl_tent_users1.delete({
    where: { user_uuid: userUuid },
  });

  return { deleted: true, userUuid };
}

/**
 * Get a single tenant user by UUID
 */
export async function getUserByUuidRepo(userUuid) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    include: {
      tbl_user_roles: {
        include: { tbl_roles: true },
      },
    },
  });

  if (!user) return null;

  return {
    user_uuid: user.user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
    user_country_code: user.user_country_code,
    user_phone: user.user_phone,
    is_owner: user.is_owner,
    created_on: user.created_on,
    modified_on: user.modified_on,
    role_uuid: user.tbl_user_roles[0]?.tbl_roles?.role_uuid || null,
    role_name: user.tbl_user_roles[0]?.tbl_roles?.name || null,
  };
}

/** ------------------ TENANT MENU ------------------- **/

export async function getTenantMenuRepo(tentUuid) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    include: {
      tbl_tenant_subscriptions: {
        where: {
          is_active: true,
          end_date: { gte: new Date() }, // Only active & non-expired plans
        },
        include: {
          tbl_subscription_plans: {
            include: {
              tbl_plan_menus: {
                include: { tbl_menus: true },
              },
            },
          },
        },
      },
    },
  });

  if (!tenant || tenant.tbl_tenant_subscriptions.length === 0) {
    throw new Error("No active subscription menus found for this tenant");
  }

  // ✅ Each subscription has ONE plan → handle it properly
  const menuItems = tenant.tbl_tenant_subscriptions.flatMap((sub) =>
    sub.tbl_subscription_plans.tbl_plan_menus.map((pm) => pm.tbl_menus)
  );

  // ✅ Remove duplicates and sort
  const uniqueMenus = [
    ...new Map(menuItems.map((m) => [m.menu_id, m])).values(),
  ].sort((a, b) => a.sort_order - b.sort_order);

  // ✅ Build hierarchical menu tree
  const buildMenuTree = (menus) => {
    const map = {};
    const mainGroups = {};
    const footerGroups = {};

    menus.forEach((menu) => {
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

    // Nest sub-items
    menus.forEach((menu) => {
      if (menu.parent_menu_id && map[menu.parent_menu_id]) {
        map[menu.parent_menu_id].subItems.push(map[menu.menu_id]);
      }
    });

    // Group main/footer menus
    menus.forEach((menu) => {
      if (!menu.parent_menu_id) {
        if (menu.is_main_menu) {
          if (!mainGroups[menu.menu_group]) mainGroups[menu.menu_group] = [];
          mainGroups[menu.menu_group].push(map[menu.menu_id]);
        }
        if (menu.is_footer_menu) {
          if (!footerGroups[menu.menu_group])
            footerGroups[menu.menu_group] = [];
          footerGroups[menu.menu_group].push(map[menu.menu_id]);
        }
      }
    });

    const mainNavigation = Object.entries(mainGroups).map(([group, items]) => ({
      title: group,
      items,
    }));

    const footerNavigation = Object.entries(footerGroups).map(
      ([group, items]) => ({
        title: group,
        items,
      })
    );

    return { mainNavigation, footerNavigation };
  };

  return buildMenuTree(uniqueMenus);
}

/** ------------------ USER MENU ------------------- **/

export async function getUserMenuRepo(userUuid) {
  // 1️⃣ Fetch user with roles and permissions
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    include: {
      tbl_user_roles: {
        include: {
          tbl_roles: {
            include: {
              tbl_role_permissions: {
                include: { tbl_menus: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.tbl_user_roles.length === 0) {
    throw new Error("No roles or menus found for this user");
  }

  // 2️⃣ Flatten permissions from all roles
  const allPermissions = user.tbl_user_roles.flatMap((ur) =>
    ur.tbl_roles.tbl_role_permissions.map((rp) => ({
      menu: rp.tbl_menus,
      permissions: {
        read: Boolean(rp.can_read),
        add: Boolean(rp.can_add),
        update: Boolean(rp.can_update),
        delete: Boolean(rp.can_delete),
      },
    }))
  );

  // 3️⃣ Merge duplicate menu permissions (same menu, multiple roles)
  const mergedMap = new Map();
  for (const { menu, permissions } of allPermissions) {
    if (!menu) continue; // skip null relations
    const existing = mergedMap.get(menu.menu_id) || {
      menu,
      permissions: { read: false, add: false, update: false, delete: false },
    };

    mergedMap.set(menu.menu_id, {
      menu,
      permissions: {
        read: existing.permissions.read || permissions.read,
        add: existing.permissions.add || permissions.add,
        update: existing.permissions.update || permissions.update,
        delete: existing.permissions.delete || permissions.delete,
      },
    });
  }

  // 4️⃣ Filter out menus where user doesn’t have read permission
  const accessibleMenus = [...mergedMap.values()]
    .filter((m) => m.permissions.read)
    .map((m) => ({
      ...m.menu,
      permissions: m.permissions,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (accessibleMenus.length === 0)
    throw new Error("User has no accessible menus");

  // 5️⃣ Build menu tree (hierarchical main + footer navigation)
  const map = {};
  const mainGroups = {};
  const footerGroups = {};

  accessibleMenus.forEach((menu) => {
    map[menu.menu_id] = {
      title: menu.menu_name,
      url: menu.path,
      icon: menu.icon || null,
      menu_group: menu.menu_group,
      permissions: menu.permissions,
      is_main_menu: !!menu.is_main_menu,
      is_footer_menu: !!menu.is_footer_menu,
      sort_order: menu.sort_order,
      subItems: [],
    };
  });

  accessibleMenus.forEach((menu) => {
    if (menu.parent_menu_id && map[menu.parent_menu_id]) {
      map[menu.parent_menu_id].subItems.push(map[menu.menu_id]);
    }
  });

  accessibleMenus.forEach((menu) => {
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

  const mainNavigation = Object.entries(mainGroups).map(([group, items]) => ({
    title: group,
    items,
  }));

  const footerNavigation = Object.entries(footerGroups).map(
    ([group, items]) => ({
      title: group,
      items,
    })
  );

  return { mainNavigation, footerNavigation };
}
