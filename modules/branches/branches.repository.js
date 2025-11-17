// modules/branches/branches.repository.js
import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { hashPassword } from "../../utils/hashPassword.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

/**
 * List branches for a tenant
 */
export async function listBranchesRepo(tentUuid) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const branches = await prisma.tbl_branches.findMany({
    where: {
      tent_id: tenant.tent_id,
      status: true, // <-- use `status` (your schema) not `is_active`
    },
    orderBy: { is_hq: "desc" },
    select: {
      branch_uuid: true,
      branch_name: true,
      address1: true,
      address2: true,
      phone: true,
      country: true,
      state: true,
      postal_code: true,
      is_hq: true,
      created_on: true,
      modified_on: true,
    },
  });

  return branches;
}

/**
 * Create a new branch
 */
export async function createBranchRepo({
  tentUuid,
  branch_name,
  address1,
  address2,
  phone,
  country,
  state,
  postal_code,
  is_hq = false,
}) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const branch_uuid = generateShortUUID();

  const branch = await prisma.tbl_branches.create({
    data: {
      branch_uuid,
      tent_id: tenant.tent_id,
      branch_name,
      address1,
      address2,
      phone,
      country,
      state,
      postal_code,
      is_hq,
      status: true,
    },
    select: {
      branch_uuid: true,
      branch_name: true,
      address1: true,
      address2: true,
      phone: true,
      country: true,
      state: true,
      postal_code: true,
      is_hq: true,
      created_on: true,
    },
  });

  return branch;
}

/**
 * Get branch details
 */
export async function getBranchDetailsRepo({ tentUuid, branchUuid }) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const branch = await prisma.tbl_branches.findFirst({
    where: {
      tent_id: tenant.tent_id,
      branch_uuid: branchUuid,
      status: true,
    },
    select: {
      branch_uuid: true,
      branch_name: true,
      address1: true,
      address2: true,
      phone: true,
      country: true,
      state: true,
      postal_code: true,
      is_hq: true,
      status: true,
      created_on: true,
      modified_on: true,
    },
  });

  if (!branch) throw new Error("Branch not found");
  return branch;
}

/**
 * Update branch
 */
export async function updateBranchRepo({ tentUuid, branchUuid, updates }) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  // Only allow updating fields we expect
  const up = {
    branch_name: updates.branch_name,
    address1: updates.address1,
    address2: updates.address2,
    phone: updates.phone,
    country: updates.country,
    state: updates.state,
    postal_code: updates.postal_code,
    // do not allow switching tent_id or branch_uuid
    modified_on: new Date(),
  };

  const result = await prisma.tbl_branches.updateMany({
    where: {
      tent_id: tenant.tent_id,
      branch_uuid: branchUuid,
      status: true,
    },
    data: up,
  });

  if (result.count === 0) throw new Error("Branch not found or cannot update");

  return getBranchDetailsRepo({ tentUuid, branchUuid });
}

/**
 * Soft-delete branch (status = false)
 */
export async function deleteBranchRepo({ tentUuid, branchUuid }) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const result = await prisma.tbl_branches.updateMany({
    where: {
      tent_id: tenant.tent_id,
      branch_uuid: branchUuid,
      status: true,
    },
    data: {
      status: false,
      modified_on: new Date(),
    },
  });

  if (result.count === 0) throw new Error("Branch not found");
  return { branchUuid, deleted: true };
}

/**
 * Get users for a branch
 */
export async function getBranchUsersRepo({ tentUuid, branchUuid }) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const branch = await prisma.tbl_branches.findFirst({
    where: {
      tent_id: tenant.tent_id,
      branch_uuid: branchUuid,
      status: true,
    },
    select: { branch_id: true },
  });
  if (!branch) throw new Error("Branch not found");

  const users = await prisma.tbl_tent_users1.findMany({
    where: {
      tent_id: tenant.tent_id, // user must belong to same tenant
      branch_id: branch.branch_id, // and specifically to this branch
    },
    select: {
      user_uuid: true,
      user_name: true,
      user_email: true,
      user_country_code: true,
      user_phone: true,
      is_owner: true,
      is_email_verified: true,
      created_on: true,
      modified_on: true,
    },
    orderBy: { created_on: "asc" },
  });

  return users;
}

/**
 * Create user under a branch
 * Note: user.tent_id should be tenant.tent_id and branch_id = branch.branch_id
 */
export async function createBranchUserRepo({
  tentUuid,
  branchUuid,
  user_name,
  user_email,
  password,
  user_country_code = null,
  user_phone = null,
  role_uuid = null,
  is_owner = false,
}) {
  const tenant = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: { tent_id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const branch = await prisma.tbl_branches.findFirst({
    where: {
      tent_id: tenant.tent_id,
      branch_uuid: branchUuid,
      status: true,
    },
    select: { branch_id: true },
  });
  if (!branch) throw new Error("Branch not found");

  // check email not already used in tenant
  const existing = await prisma.tbl_tent_users1.findFirst({
    where: { user_email, tent_id: tenant.tent_id },
  });
  if (existing) throw new Error("Email already registered for this tenant");

  const user_uuid = generateShortUUID();
  const hashed = await hashPassword(password);

  const user = await prisma.tbl_tent_users1.create({
    data: {
      tent_id: tenant.tent_id, // correct: tenant id here
      branch_id: branch.branch_id, // branch assignment
      user_uuid,
      user_name,
      user_email,
      password: hashed,
      user_country_code,
      user_phone,
      is_owner,
      is_email_verified: false,
    },
    select: {
      user_uuid: true,
      user_name: true,
      user_email: true,
      user_phone: true,
      is_owner: true,
      created_on: true,
    },
  });

  // Optionally assign role if provided (role_uuid should be tenant or branch-scoped)
  if (role_uuid) {
    const role = await prisma.tbl_roles.findUnique({
      where: { role_uuid },
      select: { role_id: true, tent_id: true, branch_id: true },
    });
    if (!role) throw new Error("Role not found");

    // ensure role belongs to same tenant OR same branch
    if (
      String(role.tent_id) !== String(tenant.tent_id) &&
      String(role.branch_id) !== String(branch.branch_id)
    ) {
      throw new Error("Role does not belong to tenant/branch");
    }

    await prisma.tbl_user_roles.create({
      data: { user_id: user.user_id, role_id: role.role_id },
    });
  }

  return user;
}

/**
 * Assign existing user to a branch
 */
export async function assignUserToBranchRepo({ userUuid, branchUuid }) {
  const branch = await prisma.tbl_branches.findUnique({
    where: { branch_uuid: branchUuid },
    select: { branch_id: true, tent_id: true },
  });
  if (!branch) throw new Error("Branch not found");

  // find user
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: { user_id: true, tent_id: true },
  });
  if (!user) throw new Error("User not found");

  // ensure user belongs to same tenant
  if (String(user.tent_id) !== String(branch.tent_id)) {
    throw new Error("User and branch belong to different tenants");
  }

  const updated = await prisma.tbl_tent_users1.update({
    where: { user_uuid: userUuid },
    data: { branch_id: branch.branch_id, modified_on: new Date() },
    select: { user_uuid: true, branch_id: true },
  });

  return sanitizeResponse(updated);
}
