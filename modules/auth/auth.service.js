import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { hashPassword } from "../../utils/hashPassword.js";
import { createDefaultSetupForTenant } from "./tenantSetup.js";
import { sendMagicLinkEmail } from "../../services/emailService.js";

/**
 * Step 1: Create user and send magic link
 */
export async function registerUser({ user_name, user_email, password }) {
  const existingUser = await prisma.tbl_tent_users1.findUnique({
    where: { user_email },
  });

  // ✅ If user exists but not verified — resend verification
  if (existingUser) {
    if (!existingUser.is_email_verified) {
      console.log("Resending verification link to existing unverified user");

      await sendMagicLinkEmail(existingUser);

      throw new Error(
        "Account exists but not verified. A new verification link has been sent."
      );
    }

    // ❌ If verified, block duplicate registration
    throw new Error("Email already registered and verified.");
  }

  // ✅ Otherwise, create a new unverified user
  const user_uuid = generateShortUUID();
  const hashedPwd = await hashPassword(password);

  const user = await prisma.tbl_tent_users1.create({
    data: {
      user_uuid,
      user_name,
      user_email,
      password: hashedPwd,
      is_owner: false,
      is_email_verified: false,
    },
  });

  // Assign "New User" role
  const newUserRole = await prisma.tbl_roles.findFirst({
    where: { name: "New User", tent_id: null },
  });

  if (newUserRole) {
    await prisma.tbl_user_roles.create({
      data: {
        user_id: user.user_id,
        role_id: newUserRole.role_id,
      },
    });
  }

  await sendMagicLinkEmail(user);

  return {
    user_uuid: user.user_uuid,
    user_name: user.user_name,
    user_email: user.user_email,
  };
}

/**
 * Step 2: Register tenant for verified user
 */
export async function registerTenantForUser(userUuid, data) {
  const { tent_name, tent_phone, tent_email, plan_uuid } = data;

  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
  });

  if (!user) throw new Error("User not found");
  if (!user.is_email_verified)
    throw new Error("Please verify your email first");
  if (user.tent_id) throw new Error("User already linked to a tenant");

  const tent_uuid = generateShortUUID();

  const result = await prisma.$transaction(async (tx) => {
    // Get subscription plan
    const plan = await tx.tbl_subscription_plans.findUnique({
      where: { plan_uuid },
    });
    if (!plan) throw new Error("Invalid plan selected");

    // Create tenant
    const tenant = await tx.tbl_tent_master1.create({
      data: {
        tent_uuid,
        tent_name,
        tent_phone,
        tent_email,
      },
    });

    // Link user to tenant
    const updatedUser = await tx.tbl_tent_users1.update({
      where: { user_uuid: userUuid },
      data: {
        tent_id: tenant.tent_id,
        is_owner: true,
        is_email_verified: true,
      },
    });

    // Default setup with plan
    await createDefaultSetupForTenant(
      tx,
      tenant.tent_id,
      updatedUser.user_id,
      plan.plan_id
    );

    return { tenant, updatedUser };
  });

  const token = generateToken({
    tent_uuid: result.tenant.tent_uuid,
    user_email: result.updatedUser.user_email,
    user_uuid: result.updatedUser.user_uuid,
  });

  return {
    token,
    tent_uuid: result.tenant.tent_uuid,
    user_uuid: result.updatedUser.user_uuid,
  };
}

export async function resendVerificationService(user_email) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_email },
  });

  // Generic response for non-existing users to prevent enumeration
  if (!user) {
    return {
      message:
        "If an account exists with this email, a verification link has been sent.",
      data: null,
    };
  }

  // Already verified
  if (user.is_email_verified) {
    return {
      message: "Your email is already verified. You can log in.",
      data: null,
    };
  }

  // Optional: rate limit check (to avoid spamming)
  const now = new Date();
  const minutesSinceLastUpdate = (now - user.modified_on) / (1000 * 60);
  if (minutesSinceLastUpdate < 2) {
    throw new Error(
      "Please wait a few minutes before requesting another verification email."
    );
  }

  // Send new verification link
  await sendMagicLinkEmail(user);

  // Update timestamp for rate limiting
  await prisma.tbl_tent_users1.update({
    where: { user_id: user.user_id },
    data: { modified_on: new Date() },
  });

  return {
    message: "A new verification link has been sent to your email address.",
    data: { user_email },
  };
}

/**
 * Authenticate user by email and password
 */
export async function authenticateUser({ email, password }) {
  const user = await prisma.tbl_tent_users1.findFirst({
    where: { user_email: email },
    include: { tbl_tent_master1: true },
  });

  if (!user) throw new Error("Invalid credentials");

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = generateToken({
    user_uuid: user.user_uuid,
    user_email: user.user_email,
    tent_uuid: user.tbl_tent_master1.tent_uuid,
  });

  return {
    token,
    user_uuid: user.user_uuid,
    tent_uuid: user.tbl_tent_master1.tent_uuid,
  };
}

/**
 * Retrieve session info with tenant + user details
 */
export async function getActiveSession(userUuid) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    include: {
      tbl_tent_master1: true,
      tbl_user_roles: {
        include: {
          tbl_roles: true,
        },
      },
    },
  });

  if (!user) throw new Error("User not found");

  return {
    user: {
      user_uuid: user.user_uuid,
      user_name: user.user_name,
      user_email: user.user_email,
      user_phone: user.user_phone,
      is_owner: user.is_owner,
      roles: user.tbl_user_roles.map((r) => r.tbl_roles.name),
    },
    tenant: {
      tent_uuid: user.tbl_tent_master1.tent_uuid,
      tent_name: user.tbl_tent_master1.tent_name,
      tent_email: user.tbl_tent_master1.tent_email,
      tent_logo: user.tbl_tent_master1.tent_logo,
      tent_country: user.tbl_tent_master1.tent_country,
      tent_state: user.tbl_tent_master1.tent_state,
      tent_status: user.tbl_tent_master1.tent_status,
    },
  };
}

/**
 * Update user password securely
 */
export async function updateUserPassword(
  userUuid,
  currentPassword,
  newPassword
) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
  });

  if (!user) throw new Error("User not found");

  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const hashedNewPwd = await hashPassword(newPassword);

  await prisma.tbl_tent_users1.update({
    where: { user_uuid: userUuid },
    data: { password: hashedNewPwd, modified_on: new Date() },
  });

  return true;
}
