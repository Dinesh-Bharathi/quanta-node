import crypto from "crypto";
import prisma from "../../../config/prismaClient.js";
import { comparePassword, hashPassword } from "../../../utils/hashPassword.js";
import {
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendWelcomeEmail,
} from "../../../services/emails/emailService.js";

/* ============================================================
    VALIDATE TENANT SESSION (FOR VERIFYTOKEN)
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
    INVALIDATE TENANT SESSION (LOGOUT)
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

export async function invalidateGlobalSession(global_session_uuid) {
  return prisma.tbl_global_sessions.updateMany({
    where: {
      global_session_uuid,
    },
    data: { expires_at: new Date() },
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
