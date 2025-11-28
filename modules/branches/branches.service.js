// services/branch.service.js

import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";

/**
 * List branches for a tenant
 */
export async function listBranchesService({ tenantUuid }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  return prisma.tbl_branches.findMany({
    where: {
      tenant_id: tenant.tenant_id,
      status: true,
    },
    orderBy: [{ is_hq: "desc" }, { branch_name: "asc" }],
    select: {
      branch_uuid: true,
      branch_name: true,
      address1: true,
      address2: true,
      phone_code: true,
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
}

/**
 * Create a new branch
 */
export async function createBranchService({
  tenantUuid,
  branch_name,
  address1,
  address2,
  phone_code,
  phone,
  country,
  state,
  postal_code,
  is_hq = false,
}) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const branch_uuid = generateShortUUID();

  return prisma.tbl_branches.create({
    data: {
      branch_uuid,
      tenant_id: tenant.tenant_id,
      branch_name,
      address1,
      address2,
      phone_code,
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
      is_hq: true,
      address1: true,
      address2: true,
      phone_code: true,
      phone: true,
      country: true,
      state: true,
      postal_code: true,
      created_on: true,
    },
  });
}

/**
 * Get branch details
 */
export async function getBranchDetailsService({ tenantUuid, branchUuid }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const branch = await prisma.tbl_branches.findFirst({
    where: {
      tenant_id: tenant.tenant_id,
      branch_uuid: branchUuid,
      status: true,
    },
    select: {
      branch_uuid: true,
      branch_name: true,
      is_hq: true,
      address1: true,
      address2: true,
      phone_code: true,
      phone: true,
      country: true,
      state: true,
      postal_code: true,
      created_on: true,
      modified_on: true,
      status: true,
    },
  });

  if (!branch) throw new Error("Branch not found");

  return branch;
}

/**
 * Update a branch
 */
export async function updateBranchService({ tenantUuid, branchUuid, updates }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const allowedFields = {
    branch_name: updates.branch_name,
    address1: updates.address1,
    address2: updates.address2,
    phone_code: updates.phone_code,
    phone: updates.phone,
    country: updates.country,
    state: updates.state,
    postal_code: updates.postal_code,
    modified_on: new Date(),
  };

  const updated = await prisma.tbl_branches.updateMany({
    where: {
      tenant_id: tenant.tenant_id,
      branch_uuid: branchUuid,
      status: true,
    },
    data: allowedFields,
  });

  if (updated.count === 0) {
    throw new Error("Branch not found or cannot update");
  }

  return getBranchDetailsService({ tenantUuid, branchUuid });
}

/**
 * Soft delete a branch
 */
export async function deleteBranchService({ tenantUuid, branchUuid }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const deleted = await prisma.tbl_branches.updateMany({
    where: {
      tenant_id: tenant.tenant_id,
      branch_uuid: branchUuid,
      status: true,
    },
    data: {
      status: false,
      modified_on: new Date(),
    },
  });

  if (deleted.count === 0) {
    throw new Error("Branch not found");
  }

  return { branch_uuid: branchUuid, deleted: true };
}

/**
 * Get users belonging to a branch
 */
export async function getBranchUsersService({ tenantUuid, branchUuid }) {
  const tenant = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tenantUuid },
    select: { tenant_id: true },
  });

  if (!tenant) throw new Error("Tenant not found");

  const branch = await prisma.tbl_branches.findFirst({
    where: {
      tenant_id: tenant.tenant_id,
      branch_uuid: branchUuid,
      status: true,
    },
    select: {
      branch_id: true,
    },
  });

  if (!branch) throw new Error("Branch not found");

  return prisma.tbl_tenant_users.findMany({
    where: {
      tenant_id: tenant.tenant_id,
      branch_id: branch.branch_id,
    },
    orderBy: { created_on: "asc" },
    select: {
      tenant_user_uuid: true,
      user_name: true,
      user_email: true,
      user_phone: true,
      user_country_code: true,
      is_owner: true,
      is_email_verified: true,
      created_on: true,
      modified_on: true,
    },
  });
}
