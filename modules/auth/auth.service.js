import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { comparePassword, hashPassword } from "../../utils/hashPassword.js";
import { createDefaultSetupForTenant } from "./tenantSetup.js";
import {
  sendMagicLinkEmail,
  sendWelcomeEmail,
} from "../../services/emailService.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";

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
  const {
    tent_name,
    tent_phone,
    tent_email,
    tent_address1,
    tent_address2,
    tent_state,
    tent_country,
    tent_postalcode,
    tent_registration_number,
    plan_uuid,
  } = data;

  // 1️⃣ Validate user
  const user = await prisma.tbl_tent_users1.findUnique({
    where: { user_uuid: userUuid },
    select: {
      user_id: true,
      user_uuid: true,
      user_name: true, // ✅ Add user_name for welcome email
      user_email: true,
      is_email_verified: true,
      tent_id: true,
    },
  });

  if (!user) throw new Error("User not found");

  if (!user.is_email_verified) {
    throw new Error("Please verify your email first");
  }

  if (user.tent_id) {
    throw new Error("User already linked to a tenant. Please login.");
  }

  // 2️⃣ Validate required fields
  // if (!tent_name || !tent_country || !tent_state) {
  //   throw new Error("Tenant name, country, and state are required");
  // }

  // 3️⃣ Check if email is already used by another tenant
  if (tent_email) {
    const existingTenant = await prisma.tbl_tent_master1.findFirst({
      where: { tent_email },
    });
    if (existingTenant) {
      throw new Error(
        "This email is already registered with another organization"
      );
    }
  }

  const tent_uuid = generateShortUUID();
  const branch_uuid = generateShortUUID();

  // 4️⃣ Create tenant, branch, and default setup in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create tenant
    const tenant = await tx.tbl_tent_master1.create({
      data: {
        tent_uuid,
        tent_name,
        tent_phone,
        tent_email: tent_email || user.user_email,
        tent_address1,
        tent_address2,
        tent_state,
        tent_country,
        tent_postalcode,
        tent_registration_number,
        tent_status: true,
      },
    });

    // Create HQ branch
    const branch = await tx.tbl_branches.create({
      data: {
        branch_uuid,
        tent_id: tenant.tent_id,
        branch_name: tent_name,
        is_hq: true,
        status: true,
        address1: tent_address1,
        address2: tent_address2,
        country: tent_country,
        state: tent_state,
        postal_code: tent_postalcode,
        phone: tent_phone,
      },
    });

    // Link user to tenant as owner
    const updatedUser = await tx.tbl_tent_users1.update({
      where: { user_uuid: userUuid },
      data: {
        tent_id: tenant.tent_id,
        is_owner: true,
      },
    });

    // Create default roles and assign Super Admin to owner
    await createDefaultSetupForTenant(
      tx,
      tenant.tent_id,
      updatedUser.user_id,
      plan_uuid
    );

    return sanitizeResponse({ tenant, branch, updatedUser });
  });

  // 5️⃣ Send welcome email after successful registration
  try {
    await sendWelcomeEmail(
      {
        user_name: user.user_name,
        user_email: user.user_email,
        user_uuid: user.user_uuid,
      },
      {
        tent_name: result.tenant.tent_name,
        tent_uuid: result.tenant.tent_uuid,
      }
    );
  } catch (emailError) {
    // Log error but don't fail the registration
    console.error("⚠️ Failed to send welcome email:", emailError);
    // Registration was successful, so we continue
  }

  // 6️⃣ Generate session token
  const token = generateToken({
    userId: Number(user.user_id),
    tent_uuid: result.tenant.tent_uuid,
    user_uuid: result.updatedUser.user_uuid,
    user_email: result.updatedUser.user_email,
    is_owner: true,
  });

  return sanitizeResponse({
    token,
    tent_uuid: result.tenant.tent_uuid,
    branch_uuid: result.branch.branch_uuid,
    user_uuid: result.updatedUser.user_uuid,
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
      tbl_branches: true, // 🔥 user's assigned branch
    },
  });

  if (!user) throw new Error("Invalid credentials");

  const isMatch = await comparePassword(password, user.password);
  if (!isMatch) throw new Error("Invalid credentials");

  const token = generateToken({
    user_uuid: user.user_uuid,
    user_email: user.user_email,
    tent_uuid: user.tent_id ? user.tbl_tent_master1?.tent_uuid : null,
    branch_uuid: user.branch_id ? user.tbl_branches?.branch_uuid : null,
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
      tbl_tent_master1: true,
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
