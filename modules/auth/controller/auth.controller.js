import {
  updateUserPassword,
  verifyResetToken,
  resetPassword,
  getActiveTenantSession,
  invalidateTenantSession,
  validateTenantSession,
  requestPasswordResetForTenantUser,
  invalidateGlobalSession,
} from "../service/auth.service.js";
import { successResponse, errorResponse } from "../../../utils/response.js";
import prisma from "../../../config/prismaClient.js";

/* ============================================================
   CHECK CURRENT TENANT SESSION
   ============================================================ */
export const sessionCheckController = async (req, res) => {
  try {
    const tenant_session_uuid = req.user?.tenant_session_uuid;

    if (!tenant_session_uuid) {
      return errorResponse(res, "No session found", 401);
    }

    const session = await validateTenantSession(tenant_session_uuid);
    if (!session) {
      return errorResponse(res, "Invalid or expired session", 401);
    }

    return successResponse(res, "Session active", {
      tenant_session_uuid,
      tenant_user_uuid: req.user.tenant_user_uuid,
      tenant_uuid: req.user.tenant_uuid,
      global_user_id: req.user.global_user_id,
    });
  } catch (error) {
    console.error("❌ sessionCheckController error:", error);
    return errorResponse(res, "Failed to verify session", 500);
  }
};

/* ============================================================
   LOGOUT (TENANT SCOPED) → DEACTIVATE TENANT_SESSION_UUID
   ============================================================ */
export const logoutController = async (req, res) => {
  try {
    const tenant_session_uuid = req.user?.tenant_session_uuid;

    if (tenant_session_uuid) {
      await invalidateTenantSession(tenant_session_uuid);
    }

    // Clear cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    });

    return successResponse(res, "Logged out successfully");
  } catch (error) {
    console.error("❌ Logout error:", error);
    return errorResponse(res, "Logout failed", 500);
  }
};

export const logoutGlobalSession = async (req, res) => {
  try {
    const global_session_uuid = req.global.global_session_uuid;

    if (global_session_uuid) {
      await invalidateGlobalSession(global_session_uuid);
    }
    // Clear cookie
    res.clearCookie("global_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    });

    return successResponse(res, "Session cleared successfully");
  } catch (error) {
    console.error("❌ Session Logout error:", error);
    return errorResponse(res, "Session Logout failed", 500);
  }
};

/**
 * GET /api/auth/fetchsession  (existing)
 * Return tenant-scoped session with full context.
 */
export const getSessionController = async (req, res, next) => {
  try {
    const { tenant_user_uuid, tenant_session_uuid } = req.user;

    if (!tenant_user_uuid || !tenant_session_uuid) {
      return errorResponse(res, "Invalid session", 401);
    }

    const sessionData = await getActiveTenantSession({
      tenant_user_uuid,
      tenant_session_uuid,
    });

    return successResponse(res, "Session valid", sessionData);
  } catch (error) {
    console.error("❌ Get session error:", error);
    next(error);
  }
};

/**
 * Change password for logged-in user
 */
export const changePasswordController = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { tenant_user_uuid } = req.user;

    if (!currentPassword || !newPassword) {
      return errorResponse(
        res,
        "Both current and new passwords are required",
        400
      );
    }

    await updateUserPassword(tenant_user_uuid, currentPassword, newPassword);

    return successResponse(res, "Password changed successfully");
  } catch (error) {
    console.error("Change password error:", error);
    return errorResponse(res, error.message || "Password change failed", 400);
  }
};

export const getTenantsForEmailController = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return errorResponse(res, "Email is required", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    const tenantUsers = await prisma.tbl_tenant_users.findMany({
      where: { user_email: normalizedEmail },
      include: {
        tenant: {
          select: {
            tenant_uuid: true,
            tenant_name: true,
          },
        },
      },
    });

    // Always return success — non-enumeration safe
    const tenants = tenantUsers.map((u) => ({
      tenant_user_uuid: u.tenant_user_uuid,
      tenant_uuid: u.tenant?.tenant_uuid || null,
      tenant_name: u.tenant?.tenant_name || null,
      is_owner: u.is_owner,
    }));

    return successResponse(res, "Tenants fetched", tenants, 200);
  } catch (error) {
    console.error("❌ getTenantsForEmail Error:", error);
    return errorResponse(res, "Internal server error", 500);
  }
};

export const sendPasswordResetForTenantController = async (req, res) => {
  try {
    const { email, tenant_user_uuid, resetAll } = req.body;

    if (!email?.trim()) {
      return errorResponse(res, "Email is required", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    const tenantUsers = await prisma.tbl_tenant_users.findMany({
      where: { user_email: normalizedEmail },
      include: {
        tenant: {
          select: { tenant_name: true },
        },
      },
    });

    if (tenantUsers.length === 0) {
      // Still return success — do not leak email existence
      return successResponse(res, "Password reset email(s) sent", null, 200);
    }

    let targets = [];

    if (resetAll === true) {
      targets = tenantUsers; // reset for all accounts
    } else if (tenant_user_uuid) {
      const tUser = tenantUsers.find(
        (u) => u.tenant_user_uuid === tenant_user_uuid
      );
      if (tUser) targets = [tUser];
    }

    if (targets.length === 0) {
      return successResponse(res, "Password reset email(s) sent", null, 200);
    }

    for (const account of targets) {
      await requestPasswordResetForTenantUser(account);
    }

    return successResponse(res, "Password reset email(s) sent", null, 200);
  } catch (error) {
    console.error("❌ sendPasswordResetForTenant Error:", error);
    return errorResponse(res, "Internal server error", 500);
  }
};

/**
 * GET /api/auth/verify-reset-token?token=xxx
 * Validate reset token
 */
export const verifyResetPasswordTokenController = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return errorResponse(res, "Token is required", 400);
    }

    const result = await verifyResetToken(token);

    if (!result.valid) {
      return errorResponse(res, result.error, 400);
    }

    return successResponse(res, "Token is valid", {
      tenant_user_uuid: result.tenant_user_uuid,
      email: result.email,
      name: result.name,
      tenant_name: result.tenant_name,
    });
  } catch (error) {
    console.error("❌ Verify Reset Token Error:", error);
    return errorResponse(res, "Unable to validate token", 500);
  }
};

/**
 * POST /api/auth/reset-password
 * Updates password after token validation
 */
export const resetPasswordController = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return errorResponse(res, "All fields are required", 400);
    }

    if (password !== confirmPassword) {
      return errorResponse(res, "Passwords do not match", 400);
    }

    if (password.length < 8) {
      return errorResponse(res, "Password must be at least 8 characters", 400);
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return errorResponse(res, result.error, 400);
    }

    return successResponse(res, result.message);
  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    return errorResponse(res, "Unable to reset password", 500);
  }
};
