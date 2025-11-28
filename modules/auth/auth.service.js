import crypto from "crypto";
import prisma from "../../config/prismaClient.js";
import { generateShortUUID } from "../../utils/generateUUID.js";
import { generateToken } from "../../utils/generateToken.js";
import { comparePassword, hashPassword } from "../../utils/hashPassword.js";
import { createDefaultSetupForTenant } from "./tenantSetup.js";
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendWelcomeEmail,
} from "../../services/emails/emailService.js";
import { sanitizeResponse } from "../../utils/sanitizeResponse.js";
import {
  createTenantCore,
  createTenantPermissions,
} from "./auth.repository.js";

/**
 * Create or return existing global_user with email uniqueness.
 * Uses provided prisma client/transactionable client (client may be prisma or tx).
 *
 * Returns: { global_user_id, global_user_uuid, email, name }
 */
export async function createOrGetGlobalUser(client, { name, email }) {
  const normalized = email.trim().toLowerCase();
  try {
    // look for existing
    const existing = await client.tbl_global_users.findFirst({
      where: { email: normalized },
      select: {
        global_user_id: true,
        global_user_uuid: true,
        email: true,
        name: true,
      },
    });

    if (existing) return existing;

    const global_user_uuid = generateShortUUID();

    const created = await client.tbl_global_users.create({
      data: {
        global_user_uuid,
        email: normalized,
        name,
      },
      select: {
        global_user_id: true,
        global_user_uuid: true,
        email: true,
        name: true,
      },
    });

    return created;
  } catch (error) {
    // Handle race condition where another process inserted the same email concurrently.
    if (error?.code === "P2002") {
      console.log(
        "Global user create race detected; fetching existing record",
        {
          email: normalized,
        }
      );
      const fallback = await client.tbl_global_users.findFirst({
        where: { email: normalized },
        select: {
          global_user_id: true,
          global_user_uuid: true,
          email: true,
          name: true,
        },
      });
      if (fallback) return fallback;
    }

    // otherwise rethrow
    throw error;
  }
}

/**
 * Check whether an EMAIL_VERIFICATION token was created in the last `windowMs` (default 2 minutes)
 * Returns true if recently sent.
 */
export async function checkRecentVerificationAttempt(
  tenant_user_id,
  lastModified,
  windowMs = 2 * 60 * 1000
) {
  try {
    if (!tenant_user_id) return false;

    // Check token table for recent EMAIL_VERIFICATION token
    const recentToken = await prisma.tbl_tokens.findFirst({
      where: {
        tenant_user_id,
        token_type: "EMAIL_VERIFICATION",
        created_on: {
          gte: new Date(Date.now() - windowMs),
        },
      },
      orderBy: { created_on: "desc" },
    });

    if (recentToken) return true;

    if (lastModified) {
      const twoMinutesAgo = new Date(Date.now() - windowMs);
      if (new Date(lastModified) > twoMinutesAgo) return true;
    }

    return false;
  } catch (err) {
    console.error("Error in checkRecentVerificationAttempt", err);
    // Fail open — don't block registration if check fails.
    return false;
  }
}

/**
 * Register user (signup)
 *
 * Input:
 *  - user_name
 *  - user_email
 *  - password
 *
 * Returns object matching controller expectations:
 *  - verification_sent / verification_resent / tenant_pending
 */
export async function registerUser({ user_name, user_email, password }) {
  const email = user_email.trim().toLowerCase();
  const name = user_name?.trim();

  try {
    // Try to find tenant-level user (tenant-scoped)
    const existingUser = await prisma.tbl_tenant_users.findFirst({
      where: { user_email: email },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
        user_name: true,
        user_email: true,
        is_email_verified: true,
        tenant_id: true,
        modified_on: true,
        global_user_id: true,
      },
    });

    // CASE: exists but not verified => resend
    if (existingUser && !existingUser.is_email_verified) {
      console.info("User exists but not verified; preparing resend", {
        tenant_user_id: existingUser.tenant_user_id,
        email,
      });

      const recentlySent = await checkRecentVerificationAttempt(
        existingUser.tenant_user_id,
        existingUser.modified_on
      );
      if (recentlySent) {
        throw new Error(
          "Verification email was recently sent. Please check your inbox or wait 2 minutes before requesting again."
        );
      }

      await sendMagicLinkEmail({
        tenant_user_id: existingUser.tenant_user_id.toString(),
        tenant_user_uuid: existingUser.tenant_user_uuid,
        user_email: existingUser.user_email,
        user_name: existingUser.user_name,
      });

      // update modified_on to mark send
      await prisma.tbl_tenant_users.update({
        where: { tenant_user_id: existingUser.tenant_user_id },
        data: { modified_on: new Date() },
      });

      return {
        status: "verification_resent",
        message:
          "Account exists but not verified. A new verification link has been sent to your email.",
        tenant_user_uuid: existingUser.tenant_user_uuid,
        user_email: existingUser.user_email,
      };
    }

    // CASE: verified + no tenant => onboarding redirect
    if (
      existingUser &&
      existingUser.is_email_verified &&
      !existingUser.tenant_id
    ) {
      console.info("Verified user, no tenant - redirect to onboarding", {
        email,
        tenant_user_uuid: existingUser.tenant_user_uuid,
      });

      return {
        status: "tenant_pending",
        redirect: `/signup/onboarding?tenant_user_uuid=${existingUser.tenant_user_uuid}`,
        message: "Email verified. Please complete your organization setup.",
        tenant_user_uuid: existingUser.tenant_user_uuid,
        user_email: existingUser.user_email,
      };
    }

    // CASE: verified + has tenant => conflict
    if (
      existingUser &&
      existingUser.is_email_verified &&
      existingUser.tenant_id
    ) {
      console.log("User already registered with tenant", {
        email,
        tenant_id: existingUser.tenant_id,
      });
      const err = new Error(
        "This email is already registered. Please login or use a different email."
      );
      err.code = "ALREADY_REGISTERED_WITH_TENANT";
      throw err;
    }

    // CASE: new user => create global_user (if missing) + tenant_user inside transaction
    console.info("Creating new user (global + tenant_user).", { email });

    const tenant_user_uuid = generateShortUUID();
    const hashedPwd = await hashPassword(password);

    const { newUser } = await prisma.$transaction(
      async (tx) => {
        // ensure global user exists (create or get)
        const globalUser = await createOrGetGlobalUser(tx, { name, email });

        // create tenant_user (tenant_id null until onboarding)
        const createdTenantUser = await tx.tbl_tenant_users.create({
          data: {
            tenant_user_uuid,
            user_name: name,
            user_email: email,
            password: hashedPwd,
            is_owner: false,
            is_email_verified: false,
            global_user_id: globalUser.global_user_id,
          },
          select: {
            tenant_user_id: true,
            tenant_user_uuid: true,
            user_name: true,
            user_email: true,
            global_user_id: true,
          },
        });

        return { newUser: createdTenantUser };
      },
      { timeout: 15000 }
    );

    // Send verification email (outside transaction; best effort to succeed)
    await sendMagicLinkEmail({
      tenant_user_id: newUser.tenant_user_id.toString(),
      tenant_user_uuid: newUser.tenant_user_uuid,
      user_email: newUser.user_email,
      user_name: newUser.user_name,
    });

    console.info("Verification email sent for new user", {
      tenant_user_uuid: newUser.tenant_user_uuid,
      email: newUser.user_email,
    });

    return {
      status: "verification_sent",
      message:
        "Registration successful! Please check your email to verify your account.",
      tenant_user_uuid: newUser.tenant_user_uuid,
      user_email: newUser.user_email,
    };
  } catch (error) {
    console.error("Register User Service Error", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Prisma unique constraint on tenant_user_uuid or unique tenant user email
    if (error?.code === "P2002") {
      // map to user-friendly message
      const friendly = new Error("This email is already registered");
      friendly.code = "P2002";
      throw friendly;
    }

    // custom business error
    if (error.code === "ALREADY_REGISTERED_WITH_TENANT") throw error;

    // otherwise surface
    throw error;
  }
}

/**
 * Resend Verification Service
 */
export async function resendVerificationService(user_email) {
  const email = user_email.trim().toLowerCase();

  try {
    const user = await prisma.tbl_tenant_users.findFirst({
      where: { user_email: email },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
        user_name: true,
        user_email: true,
        is_email_verified: true,
        tenant_id: true,
        modified_on: true,
      },
    });

    if (!user) {
      console.info(
        "Resend verification requested for non-existent email (no-op to avoid enumeration).",
        { email }
      );
      return {
        status: "user_not_found",
        message:
          "If an account exists with this email, a verification link has been sent.",
        data: null,
      };
    }

    if (user.is_email_verified && user.tenant_id) {
      return {
        status: "already_verified_with_tenant",
        message: "Your email is already verified. Please login to continue.",
        data: null,
      };
    }

    if (user.is_email_verified && !user.tenant_id) {
      return {
        status: "already_verified_no_tenant",
        message:
          "Your email is verified. Please complete your organization registration.",
        data: {
          tenant_user_uuid: user.tenant_user_uuid,
          redirect: `/signup/onboarding?tenant_user_uuid=${user.tenant_user_uuid}`,
        },
      };
    }

    // not verified -> rate limit check
    const recentlySent = await checkRecentVerificationAttempt(
      user.tenant_user_id,
      user.modified_on
    );
    if (recentlySent) {
      console.log("Rate limit hit for resend verification", {
        tenant_user_id: user.tenant_user_id,
        email,
      });
      throw new Error(
        "Verification email was recently sent. Please check your inbox or wait 2 minutes before requesting again."
      );
    }

    // send magic link
    await sendMagicLinkEmail({
      tenant_user_id: user.tenant_user_id.toString(),
      tenant_user_uuid: user.tenant_user_uuid,
      user_email: user.user_email,
      user_name: user.user_name,
    });

    // update modified_on for rate limiting
    await prisma.tbl_tenant_users.update({
      where: { tenant_user_id: user.tenant_user_id },
      data: { modified_on: new Date() },
    });

    console.info("Verification email resent", {
      tenant_user_id: user.tenant_user_id,
      email,
    });

    return {
      status: "verification_sent",
      message: "A new verification link has been sent to your email address.",
      data: { user_email: user.user_email },
    };
  } catch (error) {
    console.error("Resend Verification Service Error", {
      message: error.message,
      code: error.code,
    });
    throw error;
  }
}

/**
 * Register Tenant (Onboarding) — reuses your createTenantCore and permission creation logic.
 *
 * Flow:
 *  1) Validates tenant_user exists and email verified
 *  2) Ensures user not linked to tenant yet
 *  3) Calls createTenantCore (transaction inside repository)
 *  4) Calls createTenantPermissions (outside tx)
 *  5) Sends welcome email (best effort)
 *  6) Generates auth token and returns sanitized result
 */
export async function registerTenantForUser(userUuid, data) {
  try {
    // 1) validate user
    const user = await prisma.tbl_tenant_users.findUnique({
      where: { tenant_user_uuid: userUuid },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
        user_name: true,
        user_email: true,
        is_email_verified: true,
        tenant_id: true,
      },
    });

    if (!user) {
      console.log("Attempt to register tenant for missing user", { userUuid });
      throw new Error("User not found");
    }

    if (!user.is_email_verified) {
      console.log("Attempt to register tenant before email verification", {
        user: user.user_email,
      });
      throw new Error("Please verify your email first");
    }

    if (user.tenant_id) {
      console.log("User already linked to tenant", {
        user: user.user_email,
        tenant_id: user.tenant_id,
      });
      throw new Error("User already linked to a tenant");
    }

    console.info("Creating tenant core for user", {
      userUuid,
      email: user.user_email,
    });

    // create tenant core (repository handles transaction)
    const planUuid = data.plan_uuid || null;
    const core = await createTenantCore(prisma, user, data, planUuid);

    console.info("Tenant core created", {
      tenant_uuid: core.tenant.tenant_uuid,
      branch_uuid: core.branch.branch_uuid,
    });

    // create permissions (outside transaction)
    await createTenantPermissions(prisma, core.roles);
    console.info("Permissions created for new tenant", {
      tenant_id: core.tenant.tenant_id,
    });

    // send welcome email (best-effort)
    sendWelcomeEmail(
      { user_name: user.user_name, user_email: user.user_email },
      {
        tenant_name: core.tenant.tenant_name,
        tenant_uuid: core.tenant.tenant_uuid,
      }
    ).catch((e) => {
      console.error("Welcome email send failed (non-blocking)", e);
    });

    // generate JWT token for immediate login
    const token = generateToken(
      {
        tenant_user_id: core.updatedUser.tenant_user_id.toString(),
        tenant_uuid: core.tenant.tenant_uuid,
        tenant_user_uuid: core.updatedUser.tenant_user_uuid,
        user_email: core.updatedUser.user_email,
        user_name: core.updatedUser.user_name,
        is_owner: true,
        tenant_id: core.tenant.tenant_id.toString(),
      },
      15
    );

    return {
      token,
      result: {
        tenant_uuid: core.tenant.tenant_uuid,
        branch_uuid: core.branch.branch_uuid,
        tenant_user_uuid: core.updatedUser.tenant_user_uuid,
        user_email: core.updatedUser.user_email,
        user_name: core.updatedUser.user_name,
        is_owner: true,
      },
    };
  } catch (error) {
    console.error("Register Tenant Service Error", {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

/* ============================================================
   1. AUTHENTICATE GLOBAL USER BY EMAIL + PASSWORD
   ============================================================ */
export async function authenticateGlobalUser({
  email,
  password,
  ip = null,
  userAgent = null,
}) {
  // 1️⃣ Fetch all accounts with this email
  const tenantAccounts = await prisma.tbl_tenant_users.findMany({
    where: { user_email: email },
    include: {
      tenant: {
        // ✔ correct
        select: { tenant_uuid: true, tenant_name: true },
      },
      userRoles: {
        // ✔ correct
        include: { role: true },
      },
    },
  });

  if (!tenantAccounts || tenantAccounts.length === 0) {
    throw new Error("Invalid credentials");
  }

  const tenants = [];
  let matchedAny = false;

  // 2️⃣ Check password for each tenant account
  for (const acc of tenantAccounts) {
    const hasPassword = !!acc.password;
    let passwordMatched = false;

    if (hasPassword) {
      try {
        passwordMatched = await comparePassword(password, acc.password);
      } catch {}
    }

    if (passwordMatched) matchedAny = true;

    const roleSummary = acc.userRoles
      .map((ur) => ur.role?.role_name)
      .filter(Boolean);

    tenants.push({
      tenant_user_uuid: acc.tenant_user_uuid,
      tenant_uuid: acc.tenant?.tenant_uuid || null,
      tenant_name: acc.tenant?.tenant_name || null,
      is_owner: acc.is_owner,
      is_email_verified: acc.is_email_verified,
      roles: roleSummary,
      hasPassword,
      passwordMatched,
    });
  }

  if (!matchedAny) {
    throw new Error("Invalid credentials");
  }

  return { tenants, matchedAny };
}

/* ============================================================
   2. CREATE GLOBAL SESSION (SHORT LIVED)
   ============================================================ */
export async function createGlobalSession({
  email,
  tenantUserUuids,
  ip = null,
  userAgent = null,
}) {
  const global_session_uuid = generateShortUUID();
  const expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

  return prisma.tbl_global_sessions.create({
    data: {
      global_session_uuid,
      email,
      tenant_user_uuids: tenantUserUuids.join(","),
      expires_at,
    },
    select: {
      global_session_uuid: true,
      expires_at: true,
    },
  });
}

/* ============================================================
   3. VALIDATE GLOBAL SESSION (STEP 2)
   ============================================================ */
export async function validateGlobalSession(global_session_uuid) {
  const session = await prisma.tbl_global_sessions.findUnique({
    where: { global_session_uuid },
  });

  if (!session) throw new Error("Invalid session");

  if (session.expires_at < new Date()) {
    await prisma.tbl_global_sessions.delete({
      where: { global_session_uuid },
    });
    throw new Error("Session expired");
  }

  return {
    email: session.email,
    tenantUserUuids: session.tenant_user_uuids
      ? session.tenant_user_uuids.split(",")
      : [],
  };
}

/* ============================================================
   4. CONSUME GLOBAL SESSION (DELETE ON USE)
   ============================================================ */
export async function consumeGlobalSession(global_session_uuid) {
  try {
    await prisma.tbl_global_sessions.delete({
      where: { global_session_uuid },
    });
  } catch (err) {
    console.error("⚠ Failed to delete global session", err);
  }
}

/* ============================================================
   5. FINALIZE TENANT LOGIN (STEP 2)
   Creates tenant_session_uuid + JWT
   ============================================================ */
export async function finalizeTenantLogin({
  global_session_uuid,
  tenant_user_uuid,
  ip = null,
  userAgent = null,
}) {
  // 1️⃣ Validate global session and user selection
  const { tenantUserUuids } = await validateGlobalSession(global_session_uuid);

  if (!tenantUserUuids.includes(tenant_user_uuid)) {
    throw new Error("Unauthorized tenant selection");
  }

  // 2️⃣ Fetch tenant account
  const account = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid },
    include: {
      tenant: { select: { tenant_uuid: true, tenant_id: true } },
    },
  });

  if (!account) throw new Error("Tenant user not found");

  // 3️⃣ Create tenant session
  const tenant_session_uuid = generateShortUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await prisma.tbl_tenant_sessions.create({
    data: {
      tenant_session_uuid,
      tenant_user_id: account.tenant_user_id,
      tenant_id: account.tenant?.tenant_id || null,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt,
      is_active: true,
    },
  });

  // 4️⃣ Prepare JWT payload
  const payload = {
    tenant_session_uuid,
    tenant_user_uuid: account.tenant_user_uuid,
    tenant_uuid: account.tenant?.tenant_uuid || null,
    global_user_id: account.global_user_id.toString(),
    email: account.user_email,
  };

  const token = generateToken(payload, "24h");

  // 5️⃣ Destroy global session to prevent reuse
  await consumeGlobalSession(global_session_uuid);

  return { token, payload };
}

/* ============================================================
   6. VALIDATE TENANT SESSION (FOR VERIFYTOKEN)
   ============================================================ */
export async function validateTenantSession(tenant_session_uuid) {
  return prisma.tbl_tenant_sessions.findFirst({
    where: {
      tenant_session_uuid,
      is_active: true,
      expires_at: { gt: new Date() },
    },
    include: {
      tenant_user: true,
      tenant: true,
    },
  });
}

/* ============================================================
   7. INVALIDATE TENANT SESSION (LOGOUT)
   ============================================================ */
export async function invalidateTenantSession(tenant_session_uuid) {
  return prisma.tbl_tenant_sessions.updateMany({
    where: { tenant_session_uuid, is_active: true },
    data: {
      is_active: false,
      last_seen_at: new Date(),
    },
  });
}

/**
 * Get active session and full user/tenant context by session_uuid + tenant_user_uuid
 * This updates your existing getActiveSession logic to ensure the session is active in tbl_tenant_sessions.
 */
export async function getActiveTenantSession({
  tenant_user_uuid,
  tenant_session_uuid,
}) {
  // 1️⃣ Fetch tenant session from DB
  const session = await prisma.tbl_tenant_sessions.findUnique({
    where: { tenant_session_uuid },
  });

  if (!session || !session.is_active) {
    throw new Error("Session expired or invalid");
  }

  // Expiry check
  if (new Date(session.expires_at) < new Date()) {
    throw new Error("Session expired");
  }

  // 2️⃣ Fetch user + tenant + roles
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid },
    include: {
      tenant: {
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
      userRoles: {
        include: {
          role: true,
          branch: {
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

  // Authorization check
  if (session.tenant_user_id !== user.tenant_user_id) {
    throw new Error("Session does not belong to user");
  }

  // 3️⃣ Determine allowed branches
  const tenantId = user.tenant_id;
  const branchAccess = new Set();
  let hasTenantWide = false;

  for (const ur of user.userRoles) {
    if (!ur.branch_id) {
      hasTenantWide = true;
      break;
    }
    branchAccess.add(ur.branch_id);
  }

  let allowedBranches = [];

  if (hasTenantWide) {
    allowedBranches = await prisma.tbl_branches.findMany({
      where: { tenant_id: tenantId, status: true },
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
  } else {
    allowedBranches = await prisma.tbl_branches.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: { in: [...branchAccess] },
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
  }

  // 4️⃣ Build roles summary
  const rolesSummary = user.userRoles.map((ur) => ({
    role_name: ur.role.role_name,
    role_uuid: ur.role.role_uuid,
    role_type: ur.role.role_type,
    scope: ur.branch_id ? "branch" : "tenant",
    branch: ur.branch
      ? {
          branch_uuid: ur.branch.branch_uuid,
          branch_name: ur.branch.branch_name,
          is_hq: ur.branch.is_hq,
        }
      : null,
  }));

  // Subscription
  const subscription = user.tenant?.tbl_tenant_subscriptions?.[0] || null;
  const subscriptionDetails = subscription
    ? {
        subscription_uuid: subscription.subscription_uuid,
        payment_status: subscription.payment_status,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
        plan: subscription.tbl_subscription_plans
          ? {
              plan_name: subscription.tbl_subscription_plans.plan_name,
              plan_description:
                subscription.tbl_subscription_plans.plan_description,
              is_trial: subscription.tbl_subscription_plans.is_trial,
            }
          : null,
      }
    : null;

  // 5️⃣ Build final response
  return {
    session: {
      tenant_session_uuid,
      expires_at: session.expires_at,
      is_active: session.is_active,
    },
    user: {
      tenant_user_uuid: user.tenant_user_uuid,
      user_name: user.user_name,
      user_email: user.user_email,
      user_phone: user.user_phone,
      user_country_code: user.user_country_code,
      is_owner: user.is_owner,
      is_email_verified: user.is_email_verified,
      roles: rolesSummary,
    },
    tenant: {
      tenant_uuid: user.tenant.tenant_uuid,
      tenant_name: user.tenant.tenant_name,
      tenant_email: user.tenant.tenant_email,
      tenant_phone: user.tenant.tenant_phone,
      tenant_state: user.tenant.tenant_state,
      tenant_country: user.tenant.tenant_country,
      tenant_logo: user.tenant.tenant_logo,
    },
    branches: allowedBranches,
    subscription: subscriptionDetails,
    permissions: {
      has_tenant_wide_access: hasTenantWide,
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
  const user = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid: userUuid },
  });

  if (!user) throw new Error("User not found");

  const isMatch = await comparePassword(currentPassword, user.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const hashedNewPwd = await hashPassword(newPassword);

  await prisma.tbl_tenant_users.update({
    where: { tenant_user_uuid: userUuid },
    data: { password: hashedNewPwd, modified_on: new Date() },
  });

  return true;
}

/**
 * Initiate Forgot Password
 */

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const requestPasswordResetForTenantUser = async (tenantUser) => {
  try {
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(resetToken);

    await prisma.$transaction(async (tx) => {
      // Invalidate existing reset tokens
      await tx.tbl_tokens.updateMany({
        where: {
          tenant_user_id: tenantUser.tenant_user_id,
          token_type: "PASSWORD_RESET",
          used_at: null,
        },
        data: {
          used_at: new Date(),
        },
      });

      await tx.tbl_tokens.create({
        data: {
          token: hashedToken,
          token_type: "PASSWORD_RESET",
          tenant_user_id: tenantUser.tenant_user_id,
          expires_at: new Date(Date.now() + 3600 * 1000),
        },
      });
    });

    // Send per-tenant email
    await sendPasswordResetEmail(
      {
        tenant_name: tenantUser.tenant?.tenant_name || "Your Account",
        user_email: tenantUser.user_email,
        user_name: tenantUser.user_name,
      },
      resetToken
    );
  } catch (error) {
    console.error("❌ requestPasswordResetForTenantUser Error:", error);
  }
};

// Verify reset token
export const verifyResetToken = async (token) => {
  try {
    const hashedToken = hashToken(token);

    const tokenData = await prisma.tbl_tokens.findUnique({
      where: { token: hashedToken },
      include: {
        tenant_user: {
          select: {
            tenant_user_id: true,
            tenant_user_uuid: true,
            user_email: true,
            user_name: true,
            tenant: { select: { tenant_name: true } },
          },
        },
      },
    });

    if (!tokenData) {
      return { valid: false, error: "Invalid or expired token" };
    }

    if (tokenData.used_at) {
      return { valid: false, error: "Reset link already used" };
    }

    if (new Date() > tokenData.expires_at) {
      return { valid: false, error: "Reset link expired" };
    }

    return {
      valid: true,
      userId: tokenData.tenant_user.tenant_user_id,
      tenant_user_uuid: tokenData.tenant_user.tenant_user_uuid,
      email: tokenData.tenant_user.user_email,
      name: tokenData.tenant_user.user_name,
      tenant_name: tokenData.tenant_user.tenant?.tenant_name ?? null,
    };
  } catch (error) {
    console.error("❌ Verify Reset Token Error:", error);
    return { valid: false, error: "Verification failed" };
  }
};

// Reset password
export const resetPassword = async (token, newPassword) => {
  try {
    const validation = await verifyResetToken(token);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const hashedPassword = await hashPassword(newPassword);
    const hashedToken = hashToken(token);

    await prisma.$transaction(async (tx) => {
      // Update only this tenant account password
      await tx.tbl_tenant_users.update({
        where: { tenant_user_id: validation.userId },
        data: { password: hashedPassword },
      });

      // Mark THIS token as used
      await tx.tbl_tokens.update({
        where: { token: hashedToken },
        data: { used_at: new Date() },
      });

      // Invalidate other tokens for same tenant user
      await tx.tbl_tokens.updateMany({
        where: {
          tenant_user_id: validation.userId,
          token_type: "PASSWORD_RESET",
          used_at: null,
        },
        data: { used_at: new Date() },
      });
    });

    await sendPasswordResetSuccessEmail({
      user_email: validation.email,
      user_name: validation.name,
      tenant_name: validation.tenant_name,
    });

    return { success: true, message: "Password updated successfully" };
  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    return { success: false, error: "Failed to reset password" };
  }
};
