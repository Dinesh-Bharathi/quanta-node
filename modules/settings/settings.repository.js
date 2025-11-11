import prisma from "../../config/prismaClient.js";

/**
 * Fetch user profile details by UUID
 */
export async function getUserProfileRepo(userUuid) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    include: {
      tbl_tent_master1: {
        select: {
          tent_id: true,
          tent_uuid: true,
          tent_name: true,
          tent_email: true,
          tent_logo: true,
          tent_country: true,
          tent_state: true,
          tent_status: true,
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  return {
    user_uuid: user.user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
    user_country_code: user.user_country_code,
    user_phone: user.user_phone,
    is_owner: Boolean(user.is_owner),
    tent: user.tbl_tent_master1
      ? {
          tent_id: user.tbl_tent_master1.tent_id,
          tent_uuid: user.tbl_tent_master1.tent_uuid,
          tent_name: user.tbl_tent_master1.tent_name,
          tent_email: user.tbl_tent_master1.tent_email,
          tent_logo: user.tbl_tent_master1.tent_logo,
          tent_country: user.tbl_tent_master1.tent_country,
          tent_state: user.tbl_tent_master1.tent_state,
          tent_status: user.tbl_tent_master1.tent_status,
        }
      : null,
  };
}

/**
 * Update user profile information
 */
export async function updateUserProfileRepo(userUuid, data) {
  const { user_name, user_email, user_phone } = data;

  const updatedUser = await prisma.tbl_tent_users1.update({
    where: { user_uuid: userUuid },
    data: {
      user_name,
      user_email,
      user_phone,
      modified_on: new Date(),
    },
    include: {
      tbl_tent_master1: {
        select: {
          tent_id: true,
          tent_uuid: true,
          tent_name: true,
          tent_email: true,
          tent_logo: true,
          tent_country: true,
          tent_state: true,
          tent_status: true,
        },
      },
    },
  });

  return {
    user_uuid: updatedUser.user_uuid,
    user_name: updatedUser.user_name,
    user_email: updatedUser.user_email,
    user_country_code: updatedUser.user_country_code,
    user_phone: updatedUser.user_phone,
    is_owner: Boolean(updatedUser.is_owner),
    tent: updatedUser.tbl_tent_master1,
  };
}

/**
 * Fetch tenant (organization) details by UUID
 */
export async function getTentDetailsRepo(tentUuid) {
  const tent = await prisma.tbl_tent_master1.findUnique({
    where: { tent_uuid: tentUuid },
    select: {
      tent_name: true,
      tent_country_code: true,
      tent_phone: true,
      is_mobile_verified: true,
      tent_email: true,
      is_email_verified: true,
      tent_logo: true,
      tent_address1: true,
      tent_address2: true,
      tent_state: true,
      tent_country: true,
      tent_postalcode: true,
      tent_status: true,
      created_on: true,
      modified_on: true,
    },
  });

  if (!tent) throw new Error("Tenant not found");

  return tent;
}
