import {
  authenticateUser,
  getActiveSession,
  registerTenantForUser,
  registerUser,
  resendVerificationService,
  updateUserPassword,
} from "./auth.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import prisma from "../../config/prismaClient.js";
import jwt from "jsonwebtoken";

/**
 * POST /api/auth/register
 * Create new user and send verification email
 */
export const registerUserController = async (req, res, next) => {
  try {
    const { user_name, user_email, password } = req.body;

    // Validation
    if (!user_name || !user_email || !password) {
      return errorResponse(res, "Name, email, and password are required", 400);
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user_email)) {
      return errorResponse(res, "Invalid email format", 400);
    }

    // Password strength validation
    if (password.length < 8) {
      return errorResponse(
        res,
        "Password must be at least 8 characters long",
        400
      );
    }

    const result = await registerUser(req.body);

    // Handle different registration statuses
    if (result.status === "verification_sent") {
      return successResponse(
        res,
        result.message,
        {
          user_uuid: result.user_uuid,
          user_email: result.user_email,
        },
        201
      );
    }

    if (result.status === "verification_resent") {
      return successResponse(res, result.message, {
        user_email: result.user_email,
      });
    }

    if (result.status === "tenant_pending") {
      return successResponse(res, result.message, {
        user_uuid: result.user_uuid,
        user_email: result.user_email,
        redirect: result.redirect,
      });
    }
  } catch (error) {
    console.error("❌ Register User error:", error);
    next(error);
  }
};

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
export const resendVerificationController = async (req, res, next) => {
  try {
    const { user_email } = req.body;

    if (!user_email) {
      return errorResponse(res, "Email is required", 400);
    }

    const result = await resendVerificationService(user_email);

    return successResponse(res, result.message, result.data);
  } catch (error) {
    console.error("❌ Resend Verification Error:", error);
    next(error);
  }
};

/**
 * GET /api/auth/verify-email/:token
 * Verify user email from magic link
 */
export const verifyEmailController = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Update user verification status
    const user = await prisma.tbl_tent_users1.update({
      where: { user_uuid: decoded.user_uuid },
      data: { is_email_verified: true },
      select: {
        user_uuid: true,
        user_email: true,
        tent_id: true,
      },
    });

    console.log("✅ Email verified for user:", user.user_email);

    // Redirect to organization setup
    return res.redirect(
      `${process.env.CLIENT_URL}/signup/onboarding?user_uuid=${user.user_uuid}&verified=true`
    );
  } catch (error) {
    console.error("❌ Email verification error:", error);

    // Redirect to failure page with error info
    const errorType =
      error.name === "TokenExpiredError" ? "expired" : "invalid";
    return res.redirect(
      `${process.env.CLIENT_URL}/signup/verification-failed?error=${errorType}`
    );
  }
};

/**
 * STEP 3: Register tenant (after email verified)
 * - Links user → tenant
 * - Creates Super Admin, Admin, and default setup
 */
export const registerTenantController = async (req, res) => {
  try {
    const result = await registerTenantForUser(req.params.userUuid, req.body);

    res.cookie("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, "Tenant registered successfully", {
      tent_uuid: result.tent_uuid,
      branch_uuid: result.branch_uuid,
      user_uuid: result.user_uuid,
    });
  } catch (error) {
    console.error("Register Tenant error:", error);
    return errorResponse(
      res,
      error.message || "Tenant registration failed",
      400
    );
  }
};

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
export const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return errorResponse(res, "Email and password are required", 400);
    }

    // Authenticate user
    const result = await authenticateUser({ email, password });

    // Set secure HTTP-only cookie
    res.cookie("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return successResponse(
      res,
      "Login successful",
      {
        user: result.user,
        tenant: result.tenant,
        default_branch_uuid: result.default_branch_uuid,
        subscription: result.subscription,
      },
      200
    );
  } catch (error) {
    console.error("❌ Login error:", error);

    // Don't expose internal errors to client
    const message =
      error.message === "Invalid credentials"
        ? "Invalid email or password"
        : error.message;

    return errorResponse(res, message, 401);
  }
};

/**
 * GET /api/auth/session
 * Get current user session data
 */
export const getSessionController = async (req, res, next) => {
  try {
    const { user_uuid } = req.user; // From auth middleware

    if (!user_uuid) {
      return errorResponse(
        res,
        "Invalid session. Missing user identifier.",
        401
      );
    }

    const session = await getActiveSession(user_uuid);

    return successResponse(res, "Session validated successfully", session);
  } catch (error) {
    console.error("❌ Get session error:", error);
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Clear user session
 */
export const logoutController = async (req, res) => {
  try {
    // Clear cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    });

    return successResponse(res, "Logged out successfully", null);
  } catch (error) {
    console.error("❌ Logout error:", error);
    return errorResponse(res, "Logout failed", 500);
  }
};

/**
 * Change password for logged-in user
 */
export const changePasswordController = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { user_uuid } = req.user;

    if (!currentPassword || !newPassword) {
      return errorResponse(
        res,
        "Both current and new passwords are required",
        400
      );
    }

    await updateUserPassword(user_uuid, currentPassword, newPassword);

    return successResponse(res, "Password changed successfully");
  } catch (error) {
    console.error("Change password error:", error);
    return errorResponse(res, error.message || "Password change failed", 400);
  }
};
