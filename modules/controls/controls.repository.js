import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

/** ------------------ ROLE MANAGEMENT ------------------- **/

/**
 * Get all roles for a tenant
 */
export async function getTenantRolesRepo({ tentUuid }) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const roles = await prisma.tbl_roles.findMany({
    where: { tent_id: tenant.tent_id },
    include: {
      tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1: {
        select: { user_name: true },
      },
      tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1: {
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
    created_by:
      role.tbl_tent_users1_tbl_roles_created_byTotbl_tent_users1?.user_name ||
      null,
    updated_by:
      role.tbl_tent_users1_tbl_roles_updated_byTotbl_tent_users1?.user_name ||
      null,
    created_at: role.created_at,
    updated_at: role.updated_at,
  }));
}

/**
 * Get single role by UUID with permissions
 */
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
    role_uuid: role.role_uuid,
    roleName: role.role_name,
    description: role.description,
    role_type: role.role_type,
    is_active: role.is_active,
    permissions,
  };
}

/**
 * Create a new role
 */
export async function createTenantRoleRepo({
  tentUuid,
  roleName,
  description,
  permissions,
  createdBy = null,
}) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Check if role name already exists
  const existingRole = await prisma.tbl_roles.findFirst({
    where: {
      tent_id: tenant.tent_id,
      role_name: roleName,
    },
  });
  if (existingRole) {
    throw new Error(`Role "${roleName}" already exists for this tenant`);
  }

  // 3️⃣ Prepare menu mapping
  const allMenus = await prisma.tbl_menus.findMany();
  const menuMap = Object.fromEntries(allMenus.map((m) => [m.path, m.menu_id]));

  const role_uuid = generateShortUUID();

  // 4️⃣ Create role and permissions in transaction
  return await prisma.$transaction(async (tx) => {
    const role = await tx.tbl_roles.create({
      data: {
        role_uuid,
        tent_id: tenant.tent_id,
        role_name: roleName,
        description,
        role_type: "CUSTOM",
        is_active: true,
        created_by: createdBy,
      },
    });

    // Create permissions
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
      role_uuid,
      role_name: roleName,
      description,
    };
  });
}

/**
 * Update an existing role
 */
export async function updateTenantRoleRepo({
  roleUuid,
  tentUuid,
  roleName,
  description,
  permissions,
  updatedBy = null,
}) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Find role
  const role = await prisma.tbl_roles.findFirst({
    where: {
      role_uuid: roleUuid,
      tent_id: tenant.tent_id,
    },
  });
  if (!role) throw new Error("Role not found");

  // 3️⃣ Check if new name conflicts with another role
  if (roleName !== role.role_name) {
    const existingRole = await prisma.tbl_roles.findFirst({
      where: {
        tent_id: tenant.tent_id,
        role_name: roleName,
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
 * Delete a role
 */
export async function deleteTenantRoleRepo({ roleUuid, tentUuid }) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Find role
  const role = await prisma.tbl_roles.findFirst({
    where: {
      role_uuid: roleUuid,
      tent_id: tenant.tent_id,
    },
    select: { role_id: true, role_name: true },
  });
  if (!role) throw new Error("Role not found");

  // 3️⃣ Check if role is assigned to any users
  const assignedUsers = await prisma.tbl_user_roles.findMany({
    where: { role_id: role.role_id },
    select: { user_id: true },
  });

  if (assignedUsers.length > 0) {
    throw new Error(
      `Cannot delete role "${role.role_name}". It is assigned to ${assignedUsers.length} user(s). Please remove all assignments first.`
    );
  }

  // 4️⃣ Delete role (permissions cascade automatically)
  await prisma.tbl_roles.delete({
    where: { role_id: role.role_id },
  });

  return { deleted: true, role_name: role.role_name };
}

/** ------------------ USER MANAGEMENT ------------------- **/

/**
 * Get all users in a tenant with their role assignments
 */
export async function getTenantUsersRepo(
  tentUuid,
  { all = false, branchUuid = null }
) {
  // 1️⃣ Resolve tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Construct where condition
  let where = { tent_id: tenant.tent_id };

  if (!all && branchUuid) {
    const branch = await prisma.tbl_branches.findFirst({
      where: { branch_uuid: branchUuid, tent_id: tenant.tent_id },
      select: { branch_id: true },
    });
    if (!branch) throw new Error("Branch not found");

    // ✅ Filter users who have roles assigned to this branch
    where.tbl_user_roles = {
      some: {
        OR: [
          { branch_id: branch.branch_id }, // Branch-specific assignment
          { branch_id: null }, // Tenant-wide assignment
        ],
      },
    };
  }

  // 3️⃣ Fetch users with role assignments
  const users = await prisma.tbl_tent_users1.findMany({
    where,
    include: {
      tbl_user_roles: {
        include: {
          tbl_roles: true,
          tbl_branches: {
            select: {
              branch_uuid: true,
              branch_name: true,
            },
          },
        },
      },
    },
    orderBy: { created_on: "desc" },
  });

  // 4️⃣ Build response with all roles
  return users.map((u) => ({
    user_uuid: u.user_uuid,
    user_name: u.user_name,
    user_email: u.user_email,
    user_country_code: u.user_country_code,
    user_country_code: u.user_country_code,
    user_phone: u.user_phone,
    is_owner: u.is_owner,
    created_on: u.created_on,
    modified_on: u.modified_on,
    roles: u.tbl_user_roles.map((ur) => ({
      role_uuid: ur.tbl_roles.role_uuid,
      role_name: ur.tbl_roles.role_name,
      role_type: ur.tbl_roles.role_type,
      // ✅ Branch info from assignment (not from role)
      branch: ur.tbl_branches
        ? {
            branch_uuid: ur.tbl_branches.branch_uuid,
            branch_name: ur.tbl_branches.branch_name,
          }
        : null,
      // ✅ Scope determined by assignment.branch_id
      scope: ur.branch_id === null ? "tenant" : "branch",
    })),
  }));
}

/**
 * Validate role assignments structure and basic rules
 */
async function validateRoleAssignments(roleAssignments, tenantId) {
  if (!Array.isArray(roleAssignments)) {
    throw new Error("role_assignments must be an array");
  }

  if (roleAssignments.length === 0) {
    throw new Error("At least one role must be assigned");
  }

  // ✅ Check for duplicate role_uuid + branch_uuid combinations
  const seen = new Set();
  for (const assignment of roleAssignments) {
    const { role_uuid, branch_uuid } = assignment;

    if (!role_uuid) {
      throw new Error("role_uuid is required for each assignment");
    }

    const key = `${role_uuid}:${branch_uuid || "tenant"}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate role assignment detected: ${role_uuid} for ${
          branch_uuid || "tenant-wide"
        }`
      );
    }
    seen.add(key);
  }

  // Check if mixing tenant-wide and branch-specific roles
  const hasTenantWide = roleAssignments.some((r) => !r.branch_uuid);
  const hasBranchSpecific = roleAssignments.some((r) => r.branch_uuid);

  if (hasTenantWide && hasBranchSpecific) {
    throw new Error(
      "Cannot mix tenant-wide roles with branch-specific roles. User must have either tenant-wide access OR branch-specific access."
    );
  }

  // Validate all branch_uuids exist and belong to tenant
  const branchUuids = roleAssignments
    .filter((r) => r.branch_uuid)
    .map((r) => r.branch_uuid);

  if (branchUuids.length > 0) {
    const branches = await prisma.tbl_branches.findMany({
      where: {
        branch_uuid: { in: branchUuids },
        tent_id: tenantId,
      },
      select: { branch_uuid: true, branch_id: true },
    });

    if (branches.length !== branchUuids.length) {
      const foundUuids = branches.map((b) => b.branch_uuid);
      const missing = branchUuids.filter((uuid) => !foundUuids.includes(uuid));
      throw new Error(`Invalid branch(es): ${missing.join(", ")}`);
    }
  }

  // ✅ Validate all role_uuids exist and belong to tenant
  const roleUuids = roleAssignments.map((r) => r.role_uuid);

  const roles = await prisma.tbl_roles.findMany({
    where: {
      role_uuid: { in: roleUuids },
      tent_id: tenantId,
      is_active: true,
    },
    select: { role_uuid: true, role_name: true },
  });

  if (roles.length !== roleUuids.length) {
    const foundUuids = roles.map((r) => r.role_uuid);
    const missing = roleUuids.filter((uuid) => !foundUuids.includes(uuid));
    throw new Error(`Invalid role(s): ${missing.join(", ")}`);
  }
}

/**
 * Validate no branch has multiple role assignments
 */
function validateBranchConflicts(assignmentDetails) {
  const branchRoleMap = new Map();

  for (const detail of assignmentDetails) {
    const branchKey =
      detail.branch_id === null ? "TENANT_WIDE" : detail.branch_id;

    if (!branchRoleMap.has(branchKey)) {
      branchRoleMap.set(branchKey, []);
    }

    branchRoleMap.get(branchKey).push({
      role_name: detail.role_name,
      branch_uuid: detail.branch_uuid,
    });
  }

  // Check if any branch has more than one role
  for (const [branchKey, roles] of branchRoleMap.entries()) {
    if (roles.length > 1) {
      const branchName =
        branchKey === "TENANT_WIDE" ? "tenant-wide" : roles[0].branch_uuid;
      const roleNames = roles.map((r) => r.role_name).join(", ");

      throw new Error(
        `Branch conflict: Cannot assign multiple roles to the same branch. ` +
          `Branch "${branchName}" has roles: ${roleNames}. ` +
          `Please assign only one role per branch.`
      );
    }
  }

  // If tenant-wide role exists, there should only be one assignment
  if (branchRoleMap.has("TENANT_WIDE") && assignmentDetails.length > 1) {
    throw new Error(
      "Tenant-wide role detected. Cannot combine with other role assignments. " +
        "Tenant-wide roles provide access to all branches."
    );
  }
}

export async function createTenantUserRepo({
  tentUuid,
  user_name,
  user_email,
  user_country_code = null,
  user_phone = null,
  password,
  role_assignments = [],
  is_owner = false,
}) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Check email uniqueness
  const existing = await prisma.tbl_tent_users1.findFirst({
    where: { user_email, tent_id: tenant.tent_id },
  });
  if (existing) throw new Error("Email already exists for this tenant");

  // 3️⃣ Validate role assignments
  await validateRoleAssignments(role_assignments, tenant.tent_id);

  // 4️⃣ Resolve role assignments with branch context
  const assignmentData = [];
  const assignmentDetails = [];

  for (const assignment of role_assignments) {
    const { role_uuid, branch_uuid } = assignment;

    // Get role
    const role = await prisma.tbl_roles.findFirst({
      where: {
        role_uuid,
        tent_id: tenant.tent_id,
        is_active: true,
      },
      select: { role_id: true, role_name: true },
    });

    if (!role) {
      throw new Error(`Role not found: ${role_uuid}`);
    }

    // Get branch if specified
    let branchId = null;
    if (branch_uuid) {
      const branch = await prisma.tbl_branches.findFirst({
        where: { branch_uuid, tent_id: tenant.tent_id },
        select: { branch_id: true },
      });

      if (!branch) {
        throw new Error(`Invalid branch: ${branch_uuid}`);
      }

      branchId = branch.branch_id;
    }

    assignmentData.push({
      role_id: role.role_id,
      branch_id: branchId,
    });

    assignmentDetails.push({
      role_id: role.role_id,
      role_name: role.role_name,
      branch_id: branchId,
      branch_uuid: branch_uuid || null,
    });
  }

  // 5️⃣ Validate branch conflicts
  validateBranchConflicts(assignmentDetails);

  // 6️⃣ Create user with role assignments
  const hashed = await hashPassword(password);
  const user_uuid = generateShortUUID();

  return await prisma.$transaction(async (tx) => {
    const created = await tx.tbl_tent_users1.create({
      data: {
        tent_id: tenant.tent_id,
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

    if (assignmentData.length > 0) {
      await tx.tbl_user_roles.createMany({
        data: assignmentData.map((assignment) => ({
          user_id: created.user_id,
          role_id: assignment.role_id,
          branch_id: assignment.branch_id,
        })),
        skipDuplicates: true,
      });
    }

    // Fetch created user with roles
    const userWithRoles = await tx.tbl_tent_users1.findUnique({
      where: { user_id: created.user_id },
      include: {
        tbl_user_roles: {
          include: {
            tbl_roles: true,
            tbl_branches: {
              select: { branch_uuid: true, branch_name: true },
            },
          },
        },
      },
    });

    return {
      user_uuid,
      user_name,
      user_email,
      is_owner,
      roles: userWithRoles.tbl_user_roles.map((ur) => ({
        role_uuid: ur.tbl_roles.role_uuid,
        role_name: ur.tbl_roles.role_name,
        branch: ur.tbl_branches
          ? {
              branch_uuid: ur.tbl_branches.branch_uuid,
              branch_name: ur.tbl_branches.branch_name,
            }
          : null,
        scope: ur.branch_id === null ? "tenant" : "branch",
      })),
    };
  });
}

/**
 * Update a tenant user and their role
 */
export async function updateTenantUserRepo({
  userUuid,
  user_name,
  user_email,
  user_country_code,
  user_phone,
  role_assignments = undefined,
}) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_id: true, tent_id: true },
  });
  if (!user) throw new Error("User not found");

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

  // Process role assignments if provided
  let assignmentData = null;

  if (role_assignments !== undefined) {
    if (role_assignments.length === 0) {
      assignmentData = [];
    } else {
      await validateRoleAssignments(role_assignments, user.tent_id);

      assignmentData = [];
      const assignmentDetails = [];

      for (const assignment of role_assignments) {
        const { role_uuid, branch_uuid } = assignment;

        const role = await prisma.tbl_roles.findFirst({
          where: {
            role_uuid,
            tent_id: user.tent_id,
            is_active: true,
          },
          select: { role_id: true, role_name: true },
        });

        if (!role) {
          throw new Error(`Role not found: ${role_uuid}`);
        }

        let branchId = null;
        if (branch_uuid) {
          const branch = await prisma.tbl_branches.findFirst({
            where: { branch_uuid, tent_id: user.tent_id },
            select: { branch_id: true },
          });

          if (!branch) {
            throw new Error(`Invalid branch: ${branch_uuid}`);
          }

          branchId = branch.branch_id;
        }

        assignmentData.push({
          role_id: role.role_id,
          branch_id: branchId,
        });

        assignmentDetails.push({
          role_id: role.role_id,
          role_name: role.role_name,
          branch_id: branchId,
          branch_uuid: branch_uuid || null,
        });
      }

      validateBranchConflicts(assignmentDetails);
    }
  }

  return await prisma.$transaction(async (tx) => {
    await tx.tbl_tent_users1.update({
      where: { user_uuid: userUuid },
      data: {
        user_name,
        user_email,
        user_country_code,
        user_phone,
        modified_on: new Date(),
      },
    });

    if (assignmentData !== null) {
      await tx.tbl_user_roles.deleteMany({
        where: { user_id: user.user_id },
      });

      if (assignmentData.length > 0) {
        await tx.tbl_user_roles.createMany({
          data: assignmentData.map((assignment) => ({
            user_id: user.user_id,
            role_id: assignment.role_id,
            branch_id: assignment.branch_id,
          })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await tx.tbl_tent_users1.findUnique({
      where: { user_id: user.user_id },
      include: {
        tbl_user_roles: {
          include: {
            tbl_roles: true,
            tbl_branches: {
              select: { branch_uuid: true, branch_name: true },
            },
          },
        },
      },
    });

    return {
      user_uuid: updated.user_uuid,
      user_name: updated.user_name,
      user_email: updated.user_email,
      roles: updated.tbl_user_roles.map((ur) => ({
        role_uuid: ur.tbl_roles.role_uuid,
        role_name: ur.tbl_roles.role_name,
        branch: ur.tbl_branches
          ? {
              branch_uuid: ur.tbl_branches.branch_uuid,
              branch_name: ur.tbl_branches.branch_name,
            }
          : null,
        scope: ur.branch_id === null ? "tenant" : "branch",
      })),
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
        include: {
          tbl_roles: true,
          tbl_branches: {
            select: { branch_uuid: true, branch_name: true },
          },
        },
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
    roles: user.tbl_user_roles.map((ur) => ({
      role_uuid: ur.tbl_roles.role_uuid,
      role_name: ur.tbl_roles.role_name,
      role_type: ur.tbl_roles.role_type,
      branch: ur.tbl_branches
        ? {
            branch_uuid: ur.tbl_branches.branch_uuid,
            branch_name: ur.tbl_branches.branch_name,
          }
        : null,
      scope: ur.branch_id === null ? "tenant" : "branch",
    })),
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

/**
 * Get user menu based on their role assignments for a specific branch
 */
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
  if (branch.tent_id !== user.tent_id) {
    throw new Error("Branch does not belong to user's organization");
  }

  const currentBranchId = branch.branch_id;

  // 3️⃣ Get user's role assignments for this branch context
  const userRoleAssignments = await prisma.tbl_user_roles.findMany({
    where: { user_id: user.user_id },
    include: {
      tbl_roles: true,
    },
  });

  if (!userRoleAssignments.length) {
    return { mainNavigation: [], footerNavigation: [] };
  }

  // 4️⃣ Determine which roles apply to the current branch
  const eligibleRoleIds = [];

  for (const assignment of userRoleAssignments) {
    // ✅ Check assignment.branch_id (not role.branch_id)
    if (assignment.branch_id === null) {
      // Tenant-wide role - applies to all branches
      eligibleRoleIds.push(assignment.role_id);
    } else if (assignment.branch_id === currentBranchId) {
      // Branch-specific role for this exact branch
      eligibleRoleIds.push(assignment.role_id);
    }
  }

  if (!eligibleRoleIds.length) {
    return { mainNavigation: [], footerNavigation: [] };
  }

  // 5️⃣ Fetch permissions for eligible roles
  const permissionRows = await prisma.tbl_role_permissions.findMany({
    where: { role_id: { in: eligibleRoleIds } },
    include: { tbl_menus: true },
  });

  // 6️⃣ Merge permissions per menu (union of all roles)
  const mergedPermissions = new Map();

  for (const rp of permissionRows) {
    const menu = rp.tbl_menus;
    if (!menu) continue;

    const existing = mergedPermissions.get(menu.menu_id) || {
      menu,
      permissions: {
        read: false,
        add: false,
        update: false,
        delete: false,
      },
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

  // 7️⃣ Filter menus user can access (must have read permission)
  const accessibleMenus = [...mergedPermissions.values()]
    .filter((m) => m.permissions.read)
    .map((m) => ({ ...m.menu, permissions: m.permissions }))
    .sort((a, b) => a.sort_order - b.sort_order);

  // 8️⃣ Build hierarchical navigation structure
  const menuMap = {};
  const mainGroups = {};
  const footerGroups = {};

  // Create menu nodes
  accessibleMenus.forEach((menu) => {
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
  });

  // Build parent-child hierarchy
  accessibleMenus.forEach((menu) => {
    if (menu.parent_menu_id && menuMap[menu.parent_menu_id]) {
      menuMap[menu.parent_menu_id].subItems.push(menuMap[menu.menu_id]);
    }
  });

  // Group into main navigation and footer navigation
  accessibleMenus.forEach((menu) => {
    // Only include top-level menus (no parent)
    if (!menu.parent_menu_id) {
      if (menu.is_main_menu) {
        if (!mainGroups[menu.menu_group]) {
          mainGroups[menu.menu_group] = [];
        }
        mainGroups[menu.menu_group].push(menuMap[menu.menu_id]);
      }

      if (menu.is_footer_menu) {
        if (!footerGroups[menu.menu_group]) {
          footerGroups[menu.menu_group] = [];
        }
        footerGroups[menu.menu_group].push(menuMap[menu.menu_id]);
      }
    }
  });

  // 9️⃣ Return formatted navigation
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
