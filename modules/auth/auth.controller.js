import {
  registerTenantForUser,
  registerUser,
  resendVerificationService,
  updateUserPassword,
  verifyResetToken,
  resetPassword,
  authenticateGlobalUser,
  createGlobalSession,
  getActiveTenantSession,
  invalidateTenantSession,
  validateTenantSession,
  finalizeTenantLogin,
  validateGlobalSession,
  requestPasswordResetForTenantUser,
} from "./auth.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import prisma from "../../config/prismaClient.js";
import jwt from "jsonwebtoken";

/**
 * REGISTER USER
 */
export const registerUserController = async (req, res) => {
  try {
    const { user_name, user_email, password } = req.body;

    const result = await registerUser({
      user_name,
      user_email,
      password,
    });

    return successResponse(
      res,
      result.message,
      result,
      result.status === "verification_sent" ? 201 : 200
    );
  } catch (error) {
    console.error("❌ Register User Controller Error:", error);

    if (error.code === "P2002") {
      return errorResponse(
        res,
        "This email is already registered globally",
        409
      );
    }

    if (error.code === "ALREADY_REGISTERED_WITH_TENANT") {
      return errorResponse(res, error.message, 409);
    }

    return errorResponse(res, "Internal server error", 500, error.message);
  }
};

/**
 * RESEND VERIFICATION
 */
export const resendVerificationController = async (req, res) => {
  try {
    const { user_email } = req.body;

    const result = await resendVerificationService(user_email);

    return successResponse(res, result.message, result.data || null, 200);
  } catch (error) {
    console.error("❌ Resend Verification Controller Error:", error);

    if (error.message.includes("wait") || error.message.includes("minutes")) {
      return errorResponse(res, error.message, 429);
    }

    return errorResponse(res, "Internal server error", 500, error.message);
  }
};

/**
 * VERIFY EMAIL
 */
export const verifyEmailController = async (req, res) => {
  const { token } = req.params;
  const CLIENT_URL = process.env.CLIENT_URL;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.tenant_user_uuid) {
      return res.redirect(
        `${CLIENT_URL}/signup/verification-failed?error=invalid`
      );
    }

    const user = await prisma.tbl_tenant_users.findUnique({
      where: { tenant_user_uuid: decoded.tenant_user_uuid },
      select: {
        tenant_user_id: true,
        tenant_user_uuid: true,
        is_email_verified: true,
        tenant_id: true,
      },
    });

    if (!user) {
      return res.redirect(
        `${CLIENT_URL}/signup/verification-failed?error=user_not_found`
      );
    }

    if (!user.is_email_verified) {
      await prisma.tbl_tenant_users.update({
        where: { tenant_user_uuid: decoded.tenant_user_uuid },
        data: { is_email_verified: true, modified_on: new Date() },
      });
    }

    if (!user.tenant_id) {
      return res.redirect(
        `${CLIENT_URL}/signup/onboarding?tenant_user_uuid=${user.tenant_user_uuid}&verified=true`
      );
    }

    return res.redirect(`${CLIENT_URL}/login?verified=true`);
  } catch (error) {
    console.error("❌ Verification Error:", error);
    return res.redirect(
      `${CLIENT_URL}/signup/verification-failed?error=invalid_or_expired`
    );
  }
};

/**
 * REGISTER TENANT (Onboarding Step)
 */
export const registerTenantController = async (req, res) => {
  try {
    const { token, result } = await registerTenantForUser(
      req.params.userUuid,
      req.body
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, "Tenant registered successfully", result, 200);
  } catch (error) {
    console.error("❌ Register Tenant Error:", error);
    return errorResponse(res, error.message, 400);
  }
};

/* ============================================================
   STEP 1 → EMAIL + PASSWORD  → GLOBAL_SESSION_UUID
   ============================================================ */
export const loginStep1Controller = async (req, res) => {
  try {
  } catch (error) {}
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return errorResponse(res, "Email and password are required", 400);
    }

    const authResult = await authenticateGlobalUser({
      email: email.trim().toLowerCase(),
      password,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const globalSession = await createGlobalSession({
      email: email.trim().toLowerCase(),
      tenantUserUuids: authResult.tenants.map((t) => t.tenant_user_uuid),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return successResponse(res, "Authenticated", {
      global_session_uuid: globalSession.global_session_uuid,
      tenants: authResult.tenants,
      matchedAny: authResult.matchedAny,
    });
  } catch (error) {
    console.error("❌ loginStep1Controller error:", error);
    return errorResponse(res, "Invalid email or password", 401);
  }
};

// GET /api/auth/tenant-select
export const getTenantSelectionController = async (req, res, next) => {
  try {
    const { global_session_uuid } = req.params;

    if (!global_session_uuid) {
      return errorResponse(res, "global_session_uuid is required", 400);
    }

    // Validate global session (email + tenantUserUuids)
    const session = await validateGlobalSession(global_session_uuid);

    const tenantUserUuids = session.tenantUserUuids;
    const email = session.email;

    if (!tenantUserUuids.length) {
      return errorResponse(res, "No tenant accounts found", 404);
    }

    // Fetch tenant user profiles for all UUIDs
    const tenantAccounts = await prisma.tbl_tenant_users.findMany({
      where: {
        tenant_user_uuid: { in: tenantUserUuids },
      },
      include: {
        tenant: {
          select: { tenant_uuid: true, tenant_name: true },
        },
        userRoles: {
          include: {
            role: { select: { role_name: true } },
          },
        },
      },
    });

    const tenants = tenantAccounts.map((acc) => ({
      tenant_user_uuid: acc.tenant_user_uuid,
      tenant_uuid: acc.tenant?.tenant_uuid || null,
      tenant_name: acc.tenant?.tenant_name || null,
      is_owner: acc.is_owner,
      is_email_verified: acc.is_email_verified,
      hasPassword: !!acc.password,
      roles: acc.userRoles.map((ur) => ur.role.role_name),
    }));

    return successResponse(res, "Tenant selection data loaded", {
      email,
      tenants,
      global_session_uuid,
    });
  } catch (err) {
    console.error("❌ Tenant-select error:", err);
    next(err);
  }
};

/* ============================================================
   STEP 2 → SELECT TENANT → CREATE TENANT_SESSION_UUID + JWT
   ============================================================ */
export const loginStep2Controller = async (req, res, next) => {
  try {
    const { global_session_uuid, tenant_user_uuid } = req.body;

    if (!global_session_uuid || !tenant_user_uuid) {
      return errorResponse(
        res,
        "global_session_uuid and tenant_user_uuid required",
        400
      );
    }

    const { token, payload } = await finalizeTenantLogin({
      global_session_uuid,
      tenant_user_uuid,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Attach JWT to secure cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, "Login successful", payload);
  } catch (error) {
    console.error("❌ loginStep2Controller error:", error);
    return next(error);
  }
};

/* ============================================================
   CHECK CURRENT TENANT SESSION
   ============================================================ */
export const sessionCheckController = async (req, res) => {
  try {
    const tenant_session_uuid = req.user?.tenant_session_uuid;

    console.log("tenant_session_uuid", tenant_session_uuid, req.user);

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
