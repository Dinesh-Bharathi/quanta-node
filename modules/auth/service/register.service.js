import prisma from "../../../config/prismaClient.js";
import { generateShortUUID } from "../../../utils/generateUUID.js";
import { generateToken } from "../../../utils/generateToken.js";
import { comparePassword, hashPassword } from "../../../utils/hashPassword.js";
import {
  sendMagicLinkEmail,
  sendWelcomeEmail,
} from "../../../services/emails/emailService.js";
import {
  createTenantCore,
  createTenantPermissions,
} from "../auth.repository.js";

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
        const err = new Error(
          "Verification email was recently sent. Please check your inbox or wait 2 minutes before requesting again."
        );
        err.code = "VERIFICATION_RECENTLY_SEND";
        throw err;
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
        global_user_id: existingUser.global_user_id,
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
export async function registerTenantForUser(userUuid, data, req) {
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

    const tenant_session_uuid = generateShortUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await prisma.tbl_tenant_sessions.create({
      data: {
        tenant_session_uuid,
        tenant_user_id: core.updatedUser.tenant_user_id,
        tenant_id: core.tenant?.tenant_id || null,
        ip_address: req.ip,
        user_agent: req.userAgent,
        expires_at: expiresAt,
        is_active: true,
      },
    });

    // generate JWT token for immediate login
    const token = generateToken(
      {
        tenant_session_uuid,
        tenant_user_id: core.updatedUser.tenant_user_id.toString(),
        tenant_uuid: core.tenant.tenant_uuid,
        tenant_user_uuid: core.updatedUser.tenant_user_uuid,
        user_email: core.updatedUser.user_email,
        user_name: core.updatedUser.user_name,
        is_owner: true,
        tenant_id: core.tenant.tenant_id.toString(),
      },
      "24h"
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
