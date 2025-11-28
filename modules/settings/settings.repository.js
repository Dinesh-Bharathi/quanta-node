import prisma from "../../config/prismaClient.js";

/**
 * Fetch user profile details by UUID
 */
export async function getUserProfileRepo(userUuid) {
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
    include: {
      tbl_tenant: {
        select: {
          tenant_id: true,
          tenant_uuid: true,
          tenant_name: true,
          tenant_email: true,
          tenant_logo: true,
          tenant_country: true,
          tenant_state: true,
          tenant_status: true,
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  return {
    tenant_user_uuid: user.tenant_user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
    user_country_code: user.user_country_code,
    user_phone: user.user_phone,
    is_owner: Boolean(user.is_owner),
    tent: user.tbl_tenant
      ? {
          tenant_id: user.tbl_tenant.tenant_id,
          tenant_uuid: user.tbl_tenant.tenant_uuid,
          tenant_name: user.tbl_tenant.tenant_name,
          tenant_email: user.tbl_tenant.tenant_email,
          tenant_logo: user.tbl_tenant.tenant_logo,
          tenant_country: user.tbl_tenant.tenant_country,
          tenant_state: user.tbl_tenant.tenant_state,
          tenant_status: user.tbl_tenant.tenant_status,
        }
      : null,
  };
}

/**
 * Update user profile information
 */
export async function updateUserProfileRepo(userUuid, data) {
  const { user_name, user_email, user_phone } = data;

  const updatedUser = await prisma.tbl_tenant_users.update({
    where: { tenant_user_uuid: userUuid },
    data: {
      user_name,
      user_email,
      user_phone,
      modified_on: new Date(),
    },
    include: {
      tbl_tenant: {
        select: {
          tenant_id: true,
          tenant_uuid: true,
          tenant_name: true,
          tenant_email: true,
          tenant_logo: true,
          tenant_country: true,
          tenant_state: true,
          tenant_status: true,
        },
      },
    },
  });

  return {
    tenant_user_uuid: updatedUser.tenant_user_uuid,
    user_name: updatedUser.user_name,
    user_email: updatedUser.user_email,
    user_country_code: updatedUser.user_country_code,
    user_phone: updatedUser.user_phone,
    is_owner: Boolean(updatedUser.is_owner),
    tent: updatedUser.tbl_tenant,
  };
}

/**
 * Fetch tenant (organization) details by UUID
 */
export async function getTentDetailsRepo(tentUuid) {
  const tent = await prisma.tbl_tenant.findUnique({
    where: { tenant_uuid: tentUuid },
    select: {
      tenant_name: true,
      tenant_country_code: true,
      tenant_phone: true,
      is_mobile_verified: true,
      tenant_email: true,
      is_email_verified: true,
      tenant_logo: true,
      tenant_address1: true,
      tenant_address2: true,
      tenant_state: true,
      tenant_country: true,
      tenant_postalcode: true,
      tenant_status: true,
      created_on: true,
      modified_on: true,
    },
  });

  if (!tent) throw new Error("Tenant not found");

  return tent;
}
