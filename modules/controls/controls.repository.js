import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

/** ------------------ ROLES ------------------- **/

export async function getTenantRolesRepo({
  tentUuid,
  branchUuid = null,
  scope = null,
}) {
  // 1) Get tenant id
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const tenantId = tenant.tent_id;

  // 2) Build where clause:
  // If branchUuid provided -> include tenant-wide (branch_id IS NULL) and roles for that branch only.
  // If not provided -> include all (tenant-wide + all branch copies)
  let where = {
    tent_id: tenantId,
    // is_delete: false,
  };

  if (branchUuid) {
    // resolve branch id
    const br = await prisma.tbl_branches.findUnique({
      where: { branch_uuid: branchUuid },
      select: { branch_id: true, tent_id: true },
    });
    if (!br || br.tent_id !== tenantId) throw new Error("Invalid branchUuid");

    const branchId = br.branch_id;

    // role rows to include:
    //  - tenant-wide: branch_id === null
    //  - branch-specific: branch_id === this branch
    where = {
      ...where,
      OR: [{ branch_id: null }, { branch_id: branchId }],
    };
  }

  // 3) Fetch matching rows
  const roles = await prisma.tbl_roles.findMany({
    where,
    include: {
      tbl_branches: {
        select: { branch_uuid: true, branch_name: true },
      },
      tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1: {
        select: { user_name: true },
      },
      tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1: {
        select: { user_name: true },
      },
    },
    orderBy: { created_at: "asc" },
  });

  if (roles.length === 0) return [];

  // 4) Group by role_group_uuid (fallback to role_uuid for legacy)
  const grouped = {};

  for (const r of roles) {
    const groupKey = r.role_group_uuid || r.role_uuid;

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        role_group_uuid: groupKey,
        role_uuid: r.role_uuid, // the first row's role_uuid (for UI selection)
        role_name: r.name,
        description: r.description,
        role_type: r.role_type,
        is_active: r.is_active,
        branches: [],
        created_user:
          r.tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1?.user_name ||
          null,
        updated_user:
          r.tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1?.user_name ||
          null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    }

    // Branch assignment: null = tenant-wide
    if (r.branch_id === null) {
      grouped[groupKey].branches = []; // tenant-wide covers all branches
    } else if (r.tbl_branches) {
      // push branch if not already present
      const exists = grouped[groupKey].branches.some(
        (b) => b.branch_uuid === r.tbl_branches.branch_uuid
      );
      if (!exists) {
        grouped[groupKey].branches.push({
          branch_uuid: r.tbl_branches.branch_uuid,
          branch_name: r.tbl_branches.branch_name,
        });
      }
    }
  }

  // 5) Determine scope
  const result = Object.values(grouped).map((role) => {
    let deducedScope = "tenant"; // default

    if (role.branches.length === 0) {
      // either tenant-wide OR no branch rows (but we treat as tenant-wide)
      deducedScope = "tenant";
    } else if (role.branches.length === 1) {
      deducedScope = "branch";
    } else if (role.branches.length > 1) {
      deducedScope = "multi-branch";
    }

    // If caller requested a branchUuid filter we want to present scope relative to that branch:
    // e.g., if branchUuid provided and role.branches contains that branchUuid -> present as branch/multi-branch,
    // tenant-wide still shows as 'tenant'.
    return {
      ...role,
      scope: deducedScope,
    };
  });

  return result;
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
  scope = "tenant",
  branch_uuid = null,
}) {
  // 1) Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Invalid tenant UUID");
  const tenantId = tenant.tent_id;

  // 2) Resolve branches
  let branches = [];

  if (scope === "tenant") {
    branches = [{ branch_id: null, branch_uuid: null }];
  } else if (scope === "branch") {
    if (!branch_uuid) throw new Error("branchUuid required for branch scope");
    const br = await prisma.tbl_branches.findUnique({
      where: { branch_uuid: branch_uuid?.[0] },
      select: { branch_id: true, tent_id: true, branch_uuid: true },
    });
    if (!br || br.tent_id !== tenantId) throw new Error("Invalid branchUuid");
    branches = [br];
  } else if (scope === "multi-branch") {
    if (!Array.isArray(branch_uuid) || branch_uuid.length === 0)
      throw new Error("branchUuid[] required for multi-branch role");

    const brList = await prisma.tbl_branches.findMany({
      where: {
        tent_id: tenantId,
        branch_uuid: { in: branch_uuid },
      },
      select: { branch_id: true, branch_uuid: true },
    });

    if (brList.length !== branch_uuid.length)
      throw new Error("One or more branchUuids invalid");

    branches = brList;
  } else {
    throw new Error("Invalid scope. Must be tenant | branch | multi-branch");
  }

  // 3) Prepare menu map (permission mapping)
  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));

  // 4) create a single role_group_uuid shared by all copies
  const roleGroupUuid = generateShortUUID();

  const createdRoles = [];

  // 5) Create rows (one per branch or single tenant-wide)
  for (const br of branches) {
    const roleUuid = generateShortUUID();

    const role = await prisma.tbl_roles.create({
      data: {
        role_uuid: roleUuid,
        role_group_uuid: roleGroupUuid,
        name: roleName,
        description,
        tent_id: tenantId,
        branch_id: br.branch_id,
        role_type: "CUSTOM",
      },
    });

    // Build permission rows same as before
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

    createdRoles.push({
      role_uuid: roleUuid,
      role_group_uuid: roleGroupUuid,
      scope,
      branch_uuid: br.branch_uuid ?? null,
    });
  }

  return sanitizeResponse({
    count: createdRoles.length,
    roles: createdRoles,
  });
}

export async function updateTenantRoleRepo({
  roleGroupUuid, // IMPORTANT: caller must pass the role group uuid
  tentUuid,
  roleName,
  description,
  permissions,
  scope,
  branch_uuid = [],
}) {
  // 1) Resolve tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");
  const tenantId = tenant.tent_id;

  // 2) Fetch existing role copies of this group (ensure they belong to tenant)
  const existingRoles = await prisma.tbl_roles.findMany({
    where: {
      role_group_uuid: roleGroupUuid,
      tent_id: tenantId,
      is_delete: false,
    },
    include: {
      tbl_branches: { select: { branch_uuid: true, branch_id: true } },
    },
  });
  if (existingRoles.length === 0) throw new Error("Role group not found");

  // 3) Validate incoming scope + branches (similar to create)
  let validBranches = [];

  if (scope === "tenant") {
    validBranches = [{ branch_id: null, branch_uuid: null }];
  } else if (scope === "branch") {
    if (!Array.isArray(branch_uuid) || branch_uuid.length !== 1)
      throw new Error(
        "Exactly one branchUuid must be provided for branch scope"
      );
    const br = await prisma.tbl_branches.findFirst({
      where: { branch_uuid: branch_uuid[0], tent_id: tenantId },
      select: { branch_id: true, branch_uuid: true },
    });
    if (!br) throw new Error("Invalid branchUuid");
    validBranches = [br];
  } else if (scope === "multi-branch") {
    if (!Array.isArray(branch_uuid) || branch_uuid.length === 0)
      throw new Error("branchUuids[] required for multi-branch");
    const brList = await prisma.tbl_branches.findMany({
      where: { branch_uuid: { in: branch_uuid }, tent_id: tenantId },
      select: { branch_id: true, branch_uuid: true },
    });
    if (brList.length !== branch_uuid.length)
      throw new Error("One or more branchUuid values invalid");
    validBranches = brList;
  } else {
    throw new Error("Invalid scope");
  }

  // 4) Prepare normalized permissions
  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));
  const normalizedPermissions = Object.entries(permissions)
    .filter(([path]) => menuMap[path])
    .map(([path, perm]) => ({
      menu_id: menuMap[path],
      can_read: perm.read || false,
      can_add: perm.add || false,
      can_update: perm.update || false,
      can_delete: perm.delete || false,
    }));

  // 5) Transaction: soft-delete old copies -> create new copies -> insert permissions
  return await prisma.$transaction(async (tx) => {
    // 5.A Soft-delete existing role rows for this role group
    await tx.tbl_roles.updateMany({
      where: { role_group_uuid: roleGroupUuid },
      data: { is_delete: true },
    });

    // 5.B create a new role_group_uuid for this new set
    const newRoleGroupUuid = generateShortUUID();

    const newRoleUuids = [];

    for (const br of validBranches) {
      const newRoleUuid = generateShortUUID();

      const newRole = await tx.tbl_roles.create({
        data: {
          role_uuid: newRoleUuid,
          role_group_uuid: newRoleGroupUuid,
          name: roleName,
          description,
          tent_id: tenantId,
          branch_id: br.branch_id,
          role_type: "CUSTOM",
          is_active: true,
          is_delete: false,
        },
      });

      // Insert permissions (use normalizedPermissions)
      if (normalizedPermissions.length) {
        await tx.tbl_role_permissions.createMany({
          data: normalizedPermissions.map((perm) => ({
            role_id: newRole.role_id,
            menu_id: perm.menu_id,
            can_read: perm.can_read,
            can_add: perm.can_add,
            can_update: perm.can_update,
            can_delete: perm.can_delete,
          })),
        });
      }

      newRoleUuids.push({
        role_uuid: newRoleUuid,
        branch_uuid: br.branch_uuid,
      });
    }

    return {
      role_name: roleName,
      description,
      scope,
      roles: newRoleUuids,
      role_group_uuid: newRoleGroupUuid,
    };
  });
}

export async function deleteTenantRoleRepo({ roleGroupUuid, tentUuid }) {
  // 1️⃣ Resolve tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Fetch all role copies
  const roles = await prisma.tbl_roles.findMany({
    where: {
      role_group_uuid: roleGroupUuid,
      tent_id: tenant.tent_id,
      is_delete: false,
    },
    select: { role_id: true },
  });

  if (roles.length === 0) throw new Error("Role group not found");

  const roleIds = roles.map((r) => r.role_id);

  // 3️⃣ Prevent deletion if any user is assigned
  const assignedUsers = await prisma.tbl_user_roles.findMany({
    where: { role_id: { in: roleIds } },
    select: { user_id: true },
  });

  if (assignedUsers.length > 0)
    throw new Error(
      "Role cannot be deleted. One or more users are assigned to this role."
    );

  // 4️⃣ Delete inside transaction
  return await prisma.$transaction(async (tx) => {
    // soft delete roles
    await tx.tbl_roles.updateMany({
      where: { role_group_uuid: roleGroupUuid },
      data: {
        is_delete: true,
        deleted_at: new Date(),
      },
    });

    // delete permissions
    await tx.tbl_role_permissions.deleteMany({
      where: { role_id: { in: roleIds } },
    });

    return { deleted: true };
  });
}

/** ------------------ USER MANAGEMENT ------------------- **/

/**
 * Get all users in a tenant
 */
export async function getTenantUsersRepo(
  tentUuid,
  { all = false, branchUuid = null }
) {
  // Step 1: resolve tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // Step 2: construct where condition
  let where = { tent_id: tenant.tent_id };

  if (!all && branchUuid) {
    // filter by specific branch
    where.branch_id = {
      equals: await getBranchIdFromUuid(branchUuid, tenant.tent_id),
    };
  }

  // Step 3: fetch users
  const users = await prisma.tbl_tent_users1.findMany({
    where,
    include: {
      tbl_user_roles: { include: { tbl_roles: true } },
      tbl_branches: { select: { branch_uuid: true, branch_name: true } },
    },
    orderBy: { created_on: "asc" },
  });

  // Step 4: build response
  return users.map((u) => ({
    user_uuid: u.user_uuid,
    user_name: u.user_name,
    user_email: u.user_email,
    user_country_code: u.user_country_code,
    user_phone: u.user_phone,
    is_owner: u.is_owner,
    created_on: u.created_on,
    modified_on: u.modified_on,
    branch_uuid: u.tbl_branches?.branch_uuid ?? null,
    branch_name: u.tbl_branches?.branch_name ?? null,
    role_uuid: u.tbl_user_roles[0]?.tbl_roles?.role_uuid ?? null,
    role_name: u.tbl_user_roles[0]?.tbl_roles?.name ?? null,
  }));
}

// Helper: resolve branch uuid → branch id OR error
async function getBranchIdFromUuid(branchUuid, tenantId) {
  const branch = await prisma.tbl_branches.findFirst({
    where: { branch_uuid: branchUuid, tent_id: tenantId },
    select: { branch_id: true },
  });
  if (!branch) throw new Error("Branch not found");
  return branch.branch_id;
}

export async function createTenantUserRepo({
  tentUuid,
  user_name,
  user_email,
  user_country_code = null,
  user_phone = null,
  password,
  role_uuid = null,
  is_owner = false,
}) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Check email uniqueness inside tenant
  const existing = await prisma.tbl_tent_users1.findFirst({
    where: { user_email, tent_id: tenant.tent_id },
  });
  if (existing) throw new Error("Email already exists for this tenant");

  // 3️⃣ Resolve role if provided
  let role = null;

  if (role_uuid) {
    role = await prisma.tbl_roles.findUnique({
      where: { role_uuid },
      select: { role_id: true, tent_id: true },
    });

    if (!role) throw new Error("Role not found");
    if (role.tent_id !== tenant.tent_id)
      throw new Error("Role does not belong to tenant");
  }

  // 4️⃣ Create user (no branch)
  const hashed = await hashPassword(password);
  const user_uuid = generateShortUUID();

  const created = await prisma.tbl_tent_users1.create({
    data: {
      tent_id: tenant.tent_id,
      branch_id: null, // always null
      user_uuid,
      user_name,
      user_email,
      user_country_code,
      user_phone,
      password: hashed,
      is_owner,
      is_email_verified: false,
    },
  });

  // 5️⃣ Assign role
  if (role) {
    await prisma.tbl_user_roles.create({
      data: { user_id: created.user_id, role_id: role.role_id },
    });
  }

  return {
    user_uuid,
    user_name,
    user_email,
    role_uuid,
    is_owner,
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
  role_uuid = undefined, // null = remove role, undefined = keep existing
}) {
  // 1️⃣ Fetch user
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_id: true, tent_id: true },
  });
  if (!user) throw new Error("User not found");

  // 2️⃣ Validate email uniqueness inside tenant
  if (user_email) {
    const other = await prisma.tbl_tent_users1.findFirst({
      where: {
        user_email,
        tent_id: user.tent_id,
        NOT: { user_id: user.user_id },
      },
    });
    if (other) throw new Error("Email already used in this tenant");
  }

  // 3️⃣ Validate role if provided
  let roleToAssign = null;

  if (role_uuid !== undefined && role_uuid !== null) {
    const role = await prisma.tbl_roles.findUnique({
      where: { role_uuid },
      select: { role_id: true, tent_id: true },
    });

    if (!role) throw new Error("Role not found");
    if (role.tent_id !== user.tent_id)
      throw new Error("Role does not belong to tenant");

    roleToAssign = role;
  }

  // 4️⃣ Apply update in transaction
  return await prisma.$transaction(async (tx) => {
    await tx.tbl_tent_users1.update({
      where: { user_uuid: userUuid },
      data: {
        user_name,
        user_email,
        user_phone,
        modified_on: new Date(),
      },
    });

    // Update role assignment
    if (role_uuid === null) {
      // Remove role
      await tx.tbl_user_roles.deleteMany({ where: { user_id: user.user_id } });
    } else if (roleToAssign) {
      const existing = await tx.tbl_user_roles.findFirst({
        where: { user_id: user.user_id },
        select: { id: true },
      });

      if (existing) {
        await tx.tbl_user_roles.update({
          where: { id: existing.id },
          data: { role_id: roleToAssign.role_id },
        });
      } else {
        await tx.tbl_user_roles.create({
          data: { user_id: user.user_id, role_id: roleToAssign.role_id },
        });
      }
    }

    // Fetch updated user + role
    const updated = await tx.tbl_tent_users1.findUnique({
      where: { user_id: user.user_id },
      include: {
        tbl_user_roles: { include: { tbl_roles: true } },
      },
    });

    const assignedRole = updated.tbl_user_roles[0]?.tbl_roles || null;

    return {
      user_uuid: updated.user_uuid,
      user_name: updated.user_name,
      user_email: updated.user_email,
      role_uuid: assignedRole?.role_uuid ?? null,
      role_name: assignedRole?.name ?? null,
    };
  });
}

/**
 * Delete a user and their associated roles
 */
export async function deleteTenantUserRepo(userUuid) {
  const primary = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_email: true, tent_id: true },
  });

  if (!primary) throw new Error("User not found");

  const allUsers = await prisma.tbl_tent_users1.findMany({
    where: {
      user_email: primary.user_email,
      tent_id: primary.tent_id,
    },
    select: { user_id: true },
  });

  await prisma.tbl_user_roles.deleteMany({
    where: { user_id: { in: allUsers.map((u) => u.user_id) } },
  });

  await prisma.tbl_tent_users1.deleteMany({
    where: {
      user_email: primary.user_email,
      tent_id: primary.tent_id,
    },
  });

  return { deleted: true };
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
      tbl_branches: {
        select: { branch_uuid: true, branch_name: true },
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
    branch_uuid: user.tbl_branches?.branch_uuid ?? null,
    branch_name: user.tbl_branches?.branch_name ?? null,
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

export async function getUserMenuRepo(userUuid, branchUuid) {
  // 1️⃣ Validate user
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_id: true, tent_id: true },
  });

  if (!user) throw new Error("User not found");

  // 2️⃣ Validate current branch context
  const branch = await prisma.tbl_branches.findUnique({
    where: { branch_uuid: branchUuid },
    select: { branch_id: true, tent_id: true },
  });

  if (!branch) throw new Error("Branch not found");
  if (branch.tent_id !== user.tent_id)
    throw new Error("Branch does not belong to user tenant");

  const currentBranchId = branch.branch_id;

  // 3️⃣ Get user's assigned roles (raw assignments)
  const userRoles = await prisma.tbl_user_roles.findMany({
    where: { user_id: user.user_id },
    include: { tbl_roles: true },
  });

  if (!userRoles.length) return { mainNavigation: [], footerNavigation: [] };

  // 4️⃣ Determine which role copies apply to this branch
  const eligibleRoleIds = [];
  const roleGroupCache = new Map();

  for (const ur of userRoles) {
    const role = ur.tbl_roles;

    // A) Tenant-wide roles (branch_id = null)
    if (role.branch_id === null) {
      eligibleRoleIds.push(role.role_id);
      continue;
    }

    // B) Branch-level role for this branch
    if (role.branch_id === currentBranchId) {
      eligibleRoleIds.push(role.role_id);
      continue;
    }

    // C) Multi-branch → look for a copy with same role_group_uuid for this branch
    if (role.role_group_uuid) {
      if (!roleGroupCache.has(role.role_group_uuid)) {
        const copy = await prisma.tbl_roles.findFirst({
          where: {
            role_group_uuid: role.role_group_uuid,
            branch_id: currentBranchId,
            is_active: true,
            is_delete: false,
          },
        });
        roleGroupCache.set(role.role_group_uuid, copy);
      }
      const matchingCopy = roleGroupCache.get(role.role_group_uuid);
      if (matchingCopy) eligibleRoleIds.push(matchingCopy.role_id);
    }
  }

  if (!eligibleRoleIds.length)
    return { mainNavigation: [], footerNavigation: [] };

  // 5️⃣ Collect permissions for all eligible roles
  const permissionRows = await prisma.tbl_role_permissions.findMany({
    where: { role_id: { in: eligibleRoleIds } },
    include: { tbl_menus: true },
  });

  // 6️⃣ Merge permissions per menu
  const merged = new Map();

  for (const rp of permissionRows) {
    const menu = rp.tbl_menus;
    if (!menu) continue;

    const existing = merged.get(menu.menu_id) || {
      menu,
      permissions: { read: false, add: false, update: false, delete: false },
    };

    merged.set(menu.menu_id, {
      menu,
      permissions: {
        read: existing.permissions.read || rp.can_read,
        add: existing.permissions.add || rp.can_add,
        update: existing.permissions.update || rp.can_update,
        delete: existing.permissions.delete || rp.can_delete,
      },
    });
  }

  // 7️⃣ Filter menus the user can see
  const accessibleMenus = [...merged.values()]
    .filter((m) => m.permissions.read)
    .map((m) => ({ ...m.menu, permissions: m.permissions }))
    .sort((a, b) => a.sort_order - b.sort_order);

  // 8️⃣ Build hierarchical navigation groups
  const map = {};
  const mainGroups = {};
  const footerGroups = {};

  // Map base menu nodes
  accessibleMenus.forEach((menu) => {
    map[menu.menu_id] = {
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
  });

  // Build hierarchy
  accessibleMenus.forEach((menu) => {
    if (menu.parent_menu_id && map[menu.parent_menu_id]) {
      map[menu.parent_menu_id].subItems.push(map[menu.menu_id]);
    }
  });

  // Classify as main/footer groups
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

  return {
    mainNavigation: Object.entries(mainGroups).map(([title, items]) => ({
      title,
      items,
    })),
    footerNavigation: Object.entries(footerGroups).map(([title, items]) => ({
      title,
      items,
    })),
  };
}

export async function assignUserToBranchRepo({ userUuid, branchUuid }) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_id: true, tent_id: true },
  });
  if (!user) throw new Error("User not found");

  const branch = await prisma.tbl_branches.findUnique({
    where: { branch_uuid: branchUuid },
    select: { branch_id: true, tent_id: true, branch_uuid: true },
  });
  if (!branch) throw new Error("Branch not found");
  if (branch.tent_id !== user.tent_id)
    throw new Error("Branch does not belong to user's tenant");

  // Check user role (if branch-scoped, ensure the role matches branch)
  const userRole = await prisma.tbl_user_roles.findFirst({
    where: { user_id: user.user_id },
    include: { tbl_roles: true },
  });

  if (userRole && userRole.tbl_roles.branch_id !== null) {
    if (userRole.tbl_roles.branch_id !== branch.branch_id) {
      throw new Error(
        "User has a branch-scoped role that doesn't match target branch. Reassign role first."
      );
    }
  }

  await prisma.tbl_tent_users1.update({
    where: { user_uuid: userUuid },
    data: { branch_id: branch.branch_id, modified_on: new Date() },
  });

  return { userUuid, branchUuid: branch.branch_uuid };
}
