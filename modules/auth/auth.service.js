import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { comparePassword, hashPassword } from "../../utils/hashPassword.js";
import { createDefaultSetupForTenant } from "./tenantSetup.js";
import {
  sendMagicLinkEmail,
  sendWelcomeEmail,
} from "../../services/emails/emailService.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";
import {
  createTenantCore,
  createTenantPermissions,
} from "./auth.repository.js";

/**
 * Step 1: Create user and send magic link
 * NO ROLE ASSIGNMENT - Roles are assigned when user creates/joins organization
 */
export async function registerUser({ user_name, user_email, password }) {
  // 1️⃣ Check if user exists
  const existingUser = await prisma.tbl_tent_users1.findUnique({
    where: { user_email },
    select: {
      user_id: true,
      user_uuid: true,
      user_name: true,
      user_email: true,
      is_email_verified: true,
      tent_id: true,
    },
  });

  // ==========================
  // CASE 1: USER EXISTS + NOT VERIFIED
  // ==========================
  if (existingUser && !existingUser.is_email_verified) {
    console.log("📧 Resending verification link to existing unverified user");

    // Check rate limiting (prevent spam)
    const recentlySent = await checkRecentVerificationAttempt(
      existingUser.user_id
    );
    if (recentlySent) {
      throw new Error(
        "Verification email was recently sent. Please check your inbox or wait 2 minutes."
      );
    }

    await sendMagicLinkEmail(existingUser);

    // Update timestamp for rate limiting
    await prisma.tbl_tent_users1.update({
      where: { user_id: existingUser.user_id },
      data: { modified_on: new Date() },
    });

    return {
      status: "verification_resent",
      message:
        "Account exists but not verified. A new verification link has been sent.",
      user_email: existingUser.user_email,
    };
  }

  // ==========================
  // CASE 2: USER EXISTS + VERIFIED + NO TENANT
  // ==========================
  if (existingUser && existingUser.is_email_verified && !existingUser.tent_id) {
    console.log("✅ User verified but tenant not created - redirecting");

    return {
      status: "tenant_pending",
      redirect: `/signup/onboarding?user_uuid=${existingUser.user_uuid}`,
      message: "Email verified. Please complete organization setup.",
      user_uuid: existingUser.user_uuid,
      user_email: existingUser.user_email,
    };
  }

  // ==========================
  // CASE 3: USER EXISTS + VERIFIED + HAS TENANT
  // ==========================
  if (existingUser && existingUser.is_email_verified && existingUser.tent_id) {
    throw new Error(
      "This email is already registered. Please login or use a different email."
    );
  }

  // ==========================
  // CASE 4: NEW USER — CREATE RECORD
  // ==========================
  const user_uuid = generateShortUUID();
  const hashedPwd = await hashPassword(password);

  const newUser = await prisma.tbl_tent_users1.create({
    data: {
      user_uuid,
      user_name,
      user_email,
      password: hashedPwd,
      is_owner: false,
      is_email_verified: false,
      tent_id: null, // No tenant yet
    },
    select: {
      user_id: true,
      user_uuid: true,
      user_name: true,
      user_email: true,
    },
  });

  // ✅ NO ROLE ASSIGNMENT HERE - Roles assigned when user creates organization

  // Send verification email
  await sendMagicLinkEmail(newUser);

  console.log("📧 Verification email sent to new user:", newUser.user_email);

  return {
    status: "verification_sent",
    message: "Verification email sent successfully. Please check your inbox.",
    user_uuid: newUser.user_uuid,
    user_name: newUser.user_name,
    user_email: newUser.user_email,
  };
}

/**
 * Check if verification email was sent recently (rate limiting)
 */
async function checkRecentVerificationAttempt(userId) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_id: userId },
    select: { modified_on: true },
  });

  if (!user) return false;

  const now = new Date();
  const minutesSinceLastUpdate = (now - user.modified_on) / (1000 * 60);

  return minutesSinceLastUpdate < 2; // 2 minute cooldown
}

/**
 * Resend verification email
 */
export async function resendVerificationService(user_email) {
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_email },
    select: {
      user_id: true,
      user_uuid: true,
      user_name: true,
      user_email: true,
      is_email_verified: true,
      tent_id: true,
      modified_on: true,
    },
  });

  // Generic response to prevent user enumeration
  if (!user) {
    return {
      message:
        "If an account exists with this email, a verification link has been sent.",
      data: null,
    };
  }

  // Already verified
  if (user.is_email_verified) {
    // Check if tenant exists
    if (user.tent_id) {
      return {
        message: "Your email is already verified. Please login to continue.",
        data: null,
      };
    } else {
      return {
        message:
          "Your email is verified. Please complete organization registration.",
        data: {
          redirect: `/signup/onboarding?user_uuid=${user.user_uuid}`,
        },
      };
    }
  }

  // Rate limiting check
  const recentlySent = await checkRecentVerificationAttempt(user.user_id);
  if (recentlySent) {
    throw new Error(
      "Please wait a few minutes before requesting another verification email."
    );
  }

  // Send new verification link
  await sendMagicLinkEmail(user);

  // Update timestamp
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
 * Step 2: Register tenant for verified user
 */
export async function registerTenantForUser(userUuid, data) {
  // 1. Validate user
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: {
      user_id: true,
      user_uuid: true,
      user_name: true,
      user_email: true,
      is_email_verified: true,
      tent_id: true,
    },
  });

  if (!user) throw new Error("User not found");
  if (!user.is_email_verified)
    throw new Error("Please verify your email first");
  if (user.tent_id) throw new Error("User already linked to a tenant");

  // 2. Create core tenant setup inside transaction
  const core = await createTenantCore(prisma, user, data, data.plan_uuid);

  // 3. Setup permissions outside transaction
  await createTenantPermissions(prisma, core.roles);

  // 4. Send welcome email (best effort)
  sendWelcomeEmail(
    { user_name: user.user_name, user_email: user.user_email },
    { tent_name: core.tenant.tent_name }
  ).catch((e) => console.error("Email error:", e));

  // 5. Create JWT
  const token = generateToken({
    userId: Number(core.updatedUser.user_id),
    tent_uuid: core.tenant.tent_uuid,
    user_uuid: core.updatedUser.user_uuid,
    user_email: core.updatedUser.user_email,
    is_owner: true,
  });

  return sanitizeResponse({
    token,
    tent_uuid: core.tenant.tent_uuid,
    branch_uuid: core.branch.branch_uuid,
    user_uuid: core.updatedUser.user_uuid,
  });
}
/**
 * Authenticate user by email and password
 */
export async function authenticateUser({ email, password }) {
  const user = await prisma.tbl_tent_users1.findFirst({
    where: { user_email: email },
    include: {
      tbl_tent_master1: true,
      tbl_branches: true,
    },
  });

  if (!user) throw new Error("Invalid credentials");

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = generateToken({
    user_uuid: user.user_uuid,
    user_email: user.user_email,
  });

  return {
    token,
    user_uuid: user.user_uuid,
    tent_uuid: user.tbl_tent_master1?.tent_uuid || null,
    branch_uuid: user.tbl_branches?.branch_uuid || null,
  };
}

/**
 * Get active session with full user context
 */
export async function getActiveSession(userUuid) {
  // 1️⃣ Fetch user with tenant and role assignments
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    include: {
      tbl_tent_master1: {
        include: {
          tbl_tenant_subscriptions: {
            include: {
              tbl_subscription_plans: true,
            },
            orderBy: { start_date: "desc" },
            take: 1,
          },
        },
      },
      tbl_user_roles: {
        include: {
          tbl_roles: true,
          tbl_branches: {
            select: {
              branch_uuid: true,
              branch_name: true,
              is_hq: true,
            },
          },
        },
      },
    },
  });

  if (!user) throw new Error("User not found");
  if (!user.tent_id) throw new Error("User not linked to any organization");

  const tenantId = user.tent_id;

  // 2️⃣ Determine accessible branches based on role assignments
  const branchIdsSet = new Set();
  let hasTenantWideAccess = false;

  // ✅ Check each role assignment (look at assignment.branch_id, not role.branch_id!)
  for (const assignment of user.tbl_user_roles) {
    if (assignment.branch_id === null) {
      // Tenant-wide role found - user can access ALL branches
      hasTenantWideAccess = true;
      break;
    } else if (assignment.branch_id) {
      // ✅ Only add if branch_id exists and is not null
      branchIdsSet.add(assignment.branch_id);
    }
  }

  // 3️⃣ Fetch accessible branches
  let allowedBranches = [];

  if (hasTenantWideAccess) {
    // Get all active branches for this tenant
    allowedBranches = await prisma.tbl_branches.findMany({
      where: {
        tent_id: tenantId,
        status: true,
      },
      select: {
        branch_uuid: true,
        branch_name: true,
        is_hq: true,
        status: true,
        address1: true,
        address2: true,
        state: true,
        country: true,
        postal_code: true,
      },
      orderBy: [{ is_hq: "desc" }, { branch_name: "asc" }],
    });
  } else if (branchIdsSet.size > 0) {
    // ✅ Filter out any undefined/null values before querying
    const validBranchIds = [...branchIdsSet].filter(
      (id) => id !== null && id !== undefined
    );

    if (validBranchIds.length > 0) {
      allowedBranches = await prisma.tbl_branches.findMany({
        where: {
          tent_id: tenantId,
          status: true,
          branch_id: { in: validBranchIds },
        },
        select: {
          branch_uuid: true,
          branch_name: true,
          is_hq: true,
          status: true,
          address1: true,
          address2: true,
          state: true,
          country: true,
          postal_code: true,
        },
        orderBy: [{ is_hq: "desc" }, { branch_name: "asc" }],
      });
    }
  }

  // 4️⃣ Build user roles summary
  const rolesSummary = user.tbl_user_roles.map((ur) => ({
    role_name: ur.tbl_roles.role_name,
    role_uuid: ur.tbl_roles.role_uuid,
    role_type: ur.tbl_roles.role_type,
    scope: ur.branch_id === null ? "tenant" : "branch",
    branch: ur.tbl_branches
      ? {
          branch_uuid: ur.tbl_branches.branch_uuid,
          branch_name: ur.tbl_branches.branch_name,
          is_hq: ur.tbl_branches.is_hq,
        }
      : null,
  }));

  const subscription =
    user.tbl_tent_master1?.tbl_tenant_subscriptions?.[0] || null;

  const subscriptionDetails = subscription
    ? {
        subscription_uuid: subscription.subscription_uuid,
        payment_status: subscription.payment_status,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        is_auto_renew: subscription.is_auto_renew,
        plan_details: subscription.tbl_subscription_plans
          ? {
              plan_name: subscription.tbl_subscription_plans.plan_name,
              plan_description:
                subscription.tbl_subscription_plans.plan_description,
              is_trial: subscription.tbl_subscription_plans.is_trial,
            }
          : null,
      }
    : null;

  // 5️⃣ Build session response
  return {
    user: {
      user_uuid: user.user_uuid,
      user_name: user.user_name,
      user_email: user.user_email,
      user_phone: user.user_phone,
      user_country_code: user.user_country_code,
      is_owner: user.is_owner,
      is_email_verified: user.is_email_verified,
      roles: rolesSummary,
    },
    tenant: {
      tent_uuid: user.tbl_tent_master1.tent_uuid,
      tent_name: user.tbl_tent_master1.tent_name,
      tent_email: user.tbl_tent_master1.tent_email,
      tent_phone: user.tbl_tent_master1.tent_phone,
      tent_logo: user.tbl_tent_master1.tent_logo,
      tent_address1: user.tbl_tent_master1.tent_address1,
      tent_address2: user.tbl_tent_master1.tent_address2,
      tent_state: user.tbl_tent_master1.tent_state,
      tent_country: user.tbl_tent_master1.tent_country,
      tent_postalcode: user.tbl_tent_master1.tent_postalcode,
      tent_registration_number: user.tbl_tent_master1.tent_registration_number,
      tent_status: user.tbl_tent_master1.tent_status,
    },
    branches: allowedBranches,
    subscription: subscriptionDetails,
    permissions: {
      has_tenant_wide_access: hasTenantWideAccess,
      accessible_branch_count: allowedBranches.length,
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
