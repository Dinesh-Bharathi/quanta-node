// services/users.service.js

import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";

/**
 * Validate role assignments with strict rules
 */
async function validateRoleAssignments(roleAssignments, tenantId) {
  if (!Array.isArray(roleAssignments)) {
    throw new Error("role_assignments must be an array");
  }

  if (roleAssignments.length === 0) {
    throw new Error("At least one role must be assigned");
  }

  const seen = new Set();
  const roleUuids = [];
  const branchUuids = [];

  for (const assignment of roleAssignments) {
    const { role_uuid, branch_uuid } = assignment;

    if (!role_uuid) throw new Error("role_uuid is required");

    const key = `${role_uuid}:${branch_uuid ?? "TENANT"}`;

    if (seen.has(key)) {
      throw new Error("Duplicate role assignment detected");
    }

    seen.add(key);
    roleUuids.push(role_uuid);

    if (branch_uuid) branchUuids.push(branch_uuid);
  }

  // Validate roles
  const roles = await prisma.tbl_roles.findMany({
    where: {
      role_uuid: { in: roleUuids },
      tenant_id: tenantId,
      is_active: true,
    },
    select: { role_uuid: true, role_name: true },
  });

  if (roles.length !== roleUuids.length) {
    throw new Error("Some roles are invalid or inactive");
  }

  // Validate branches
  if (branchUuids.length > 0) {
    const branches = await prisma.tbl_branches.findMany({
      where: {
        branch_uuid: { in: branchUuids },
        tenant_id: tenantId,
      },
      select: { branch_uuid: true },
    });

    if (branches.length !== branchUuids.length) {
      throw new Error("Some branches are invalid for this tenant");
    }
  }

  // Prevent mixing tenant-wide & branch-specific
  const hasTenantWide = roleAssignments.some((a) => !a.branch_uuid);
  const hasBranchSpecific = roleAssignments.some((a) => a.branch_uuid);

  if (hasTenantWide && hasBranchSpecific) {
    throw new Error(
      "Cannot combine tenant-wide roles with branch-specific roles"
    );
  }

  // Prevent multiple roles assigned to same branch
  const branchMap = {};
  for (const a of roleAssignments) {
    const key = a.branch_uuid ?? "TENANT";
    branchMap[key] = branchMap[key] || [];
    branchMap[key].push(a.role_uuid);
  }

  for (const branchKey in branchMap) {
    if (branchMap[branchKey].length > 1) {
      throw new Error(
        `Cannot assign multiple roles to the same branch (${branchKey})`
      );
    }
  }
}

/**
 * GET tenant users
 */
export async function getTenantUsersService({ tenantUuid, all, branchUuid }) {
  // 1️⃣ Validate tenant
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // 2️⃣ Build filter
  const where = {
    tenant_id: tenant.tenant_id,
  };

  if (!all && branchUuid) {
    const branch = await prisma.tbl_branches.findFirst({
      where: {
        branch_uuid: branchUuid,
        tenant_id: tenant.tenant_id,
      },
      select: { branch_id: true },
    });
    if (!branch) throw new Error("Branch not found");

    where.userRoles = {
      some: {
        OR: [
          { branch_id: branch.branch_id }, // branch-specific role
          { branch_id: null }, // tenant-wide role
        ],
      },
    };
  }

  // 3️⃣ Fetch users with roles
  const users = await prisma.tbl_tenant_users.findMany({
    where,
    include: {
      userRoles: {
        include: {
          role: true, // <-- FIXED relation name
          branch: {
            // <-- FIXED relation name
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

  // 4️⃣ Format response
  return users.map((u) => ({
    tenant_user_uuid: u.tenant_user_uuid,
    user_name: u.user_name,
    user_email: u.user_email,
    user_country_code: u.user_country_code,
    user_phone: u.user_phone,
    is_owner: u.is_owner,
    created_on: u.created_on,
    modified_on: u.modified_on,

    roles: u.userRoles.map((ur) => ({
      role_uuid: ur.role.role_uuid,
      role_name: ur.role.role_name,
      role_type: ur.role.role_type,

      scope: ur.branch_id === null ? "tenant" : "branch",

      branch: ur.branch
        ? {
            branch_uuid: ur.branch.branch_uuid,
            branch_name: ur.branch.branch_name,
          }
        : null,
    })),
  }));
}

/**
 * CREATE tenant user
 */
export async function createTenantUserService({
  tenantUuid,
  user_name,
  user_email,
  user_country_code = null,
  user_phone = null,
  password,
  role_assignments = [],
  is_owner = false,
}) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  // Email uniqueness inside tenant
  const existing = await prisma.tbl_tenant_users.findFirst({
    where: { user_email, tenant_id: tenant.tenant_id },
  });

  console.log("existing", existing);

  if (existing) throw new Error("Email already exists in this tenant");

  // Validate roles
  await validateRoleAssignments(role_assignments, tenant.tenant_id);

  const hashedPassword = await hashPassword(password);
  const tenant_user_uuid = generateShortUUID();

  return await prisma.$transaction(async (tx) => {
    const created = await tx.tbl_tenant_users.create({
      data: {
        tenant_id: tenant.tenant_id,
        tenant_user_uuid,
        user_name,
        user_email,
        user_country_code,
        user_phone,
        password: hashedPassword,
        is_owner,
        is_email_verified: false,
      },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
      },
    });

    // Build role assignment records
    const mappedAssignments = [];

    for (const a of role_assignments) {
      const role = await tx.tbl_roles.findFirst({
        where: {
          role_uuid: a.role_uuid,
          tenant_id: tenant.tenant_id,
        },
        select: { role_id: true },
      });

      let branchId = null;

      if (a.branch_uuid) {
        const branch = await tx.tbl_branches.findFirst({
          where: {
            branch_uuid: a.branch_uuid,
            tenant_id: tenant.tenant_id,
          },
          select: { branch_id: true },
        });
        branchId = branch.branch_id;
      }

      mappedAssignments.push({
        tenant_user_id: created.tenant_user_id,
        role_id: role.role_id,
        branch_id: branchId,
      });
    }

    if (mappedAssignments.length > 0) {
      await tx.tbl_user_roles.createMany({
        data: mappedAssignments,
      });
    }

    // Fetch final record
    const finalUser = await tx.tbl_tenant_users.findUnique({
      where: { tenant_user_id: created.tenant_user_id },
      include: {
        userRoles: {
          include: {
            role: true,
            branch: {
              select: {
                branch_uuid: true,
                branch_name: true,
              },
            },
          },
        },
      },
    });

    return {
      tenant_user_uuid,
      user_name: finalUser.user_name,
      user_email: finalUser.user_email,
      roles: finalUser.userRoles.map((ur) => ({
        role_uuid: ur.role.role_uuid,
        role_name: ur.role.role_name,
        scope: ur.branch_id ? "branch" : "tenant",
        branch: ur.branch
          ? {
              branch_uuid: ur.branch.branch_uuid,
              branch_name: ur.branch.branch_name,
            }
          : null,
      })),
    };
  });
}

/**
 * UPDATE tenant user
 */
export async function updateTenantUserService({
  userUuid,
  user_name,
  user_email,
  user_country_code,
  user_phone,
  role_assignments,
}) {
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
    select: { tenant_user_id: true, tenant_id: true, user_email: true },
  });

  if (!user) throw new Error("User not found");

  // Check email uniqueness
  if (user_email && user_email !== user.user_email) {
    const exists = await prisma.tbl_tenant_users.findFirst({
      where: {
        user_email,
        tenant_id: user.tenant_id,
        NOT: { tenant_user_id: user.tenant_user_id },
      },
    });

    if (exists) throw new Error("Email already exists in tenant");
  }

  // Process role updates if provided
  let mappedAssignments = null;

  if (role_assignments !== undefined) {
    await validateRoleAssignments(role_assignments, user.tenant_id);

    mappedAssignments = [];

    for (const a of role_assignments) {
      const role = await prisma.tbl_roles.findFirst({
        where: {
          role_uuid: a.role_uuid,
          tenant_id: user.tenant_id,
        },
        select: { role_id: true },
      });

      let branchId = null;
      if (a.branch_uuid) {
        const branch = await prisma.tbl_branches.findFirst({
          where: {
            branch_uuid: a.branch_uuid,
            tenant_id: user.tenant_id,
          },
          select: { branch_id: true },
        });

        branchId = branch.branch_id;
      }

      mappedAssignments.push({
        role_id: role.role_id,
        branch_id: branchId,
      });
    }
  }

  return await prisma.$transaction(async (tx) => {
    await tx.tbl_tenant_users.update({
      where: { tenant_user_uuid: userUuid },
      data: {
        user_name,
        user_email,
        user_country_code,
        user_phone,
        modified_on: new Date(),
      },
    });

    if (mappedAssignments !== null) {
      await tx.tbl_user_roles.deleteMany({
        where: { tenant_user_id: user.tenant_user_id },
      });

      if (mappedAssignments.length > 0) {
        await tx.tbl_user_roles.createMany({
          data: mappedAssignments.map((a) => ({
            tenant_user_id: user.tenant_user_id,
            role_id: a.role_id,
            branch_id: a.branch_id,
          })),
        });
      }
    }

    // fetch updated user
    const updated = await tx.tbl_tenant_users.findUnique({
      where: { tenant_user_id: user.tenant_user_id },
      include: {
        userRoles: {
          include: {
            role: true,
            branch: {
              select: { branch_uuid: true, branch_name: true },
            },
          },
        },
      },
    });

    return {
      tenant_user_uuid: userUuid,
      user_name: updated.user_name,
      user_email: updated.user_email,
      roles: updated.userRoles.map((ur) => ({
        role_uuid: ur.role.role_uuid,
        role_name: ur.role.role_name,
        scope: ur.branch_id ? "branch" : "tenant",
        branch: ur.branch
          ? {
              branch_uuid: ur.branch.branch_uuid,
              branch_name: ur.branch.branch_name,
            }
          : null,
      })),
    };
  });
}

/**
 * DELETE tenant user
 */
export async function deleteTenantUserService({ userUuid }) {
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
    select: { tenant_user_id: true },
  });

  if (!user) throw new Error("User not found");

  await prisma.tbl_user_roles.deleteMany({
    where: { tenant_user_id: user.tenant_user_id },
  });

  await prisma.tbl_tenant_users.delete({
    where: { tenant_user_uuid: userUuid },
  });

  return { deleted: true };
}

/**
 * Get a single user by UUID
 */
export async function getUserByUuidService(userUuid) {
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
    include: {
      userRoles: {
        include: {
          role: true,
          branch: {
            select: { branch_uuid: true, branch_name: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    tenant_user_uuid: user.tenant_user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
    user_country_code: user.user_country_code,
    user_phone: user.user_phone,
    is_owner: user.is_owner,

    roles: user.userRoles.map((ur) => ({
      role_uuid: ur.role.role_uuid,
      role_name: ur.role.role_name,
      scope: ur.branch_id ? "branch" : "tenant",
      branch: ur.branch
        ? {
            branch_uuid: ur.branch.branch_uuid,
            branch_name: ur.branch.branch_name,
          }
        : null,
    })),
  };
}
