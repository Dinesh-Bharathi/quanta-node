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
 * STEP 1: Register user (no tenant yet)
 * - Creates user
 * - Sends magic link for verification
 */
export const registerUserController = async (req, res) => {
  try {
    const result = await registerUser(req.body);
    return successResponse(res, "Verification email sent successfully", result);
  } catch (error) {
    console.error("Register User error:", error);
    return errorResponse(res, error.message || "Failed to create user", 400);
  }
};

export const resendVerificationController = async (req, res, next) => {
  try {
    const { user_email } = req.body;
    if (!user_email) return errorResponse(res, "Email is required", 400);

    const result = await resendVerificationService(user_email);

    return successResponse(res, result.message, result.data);
  } catch (error) {
    console.error("Resend Verification Error:", error);
    return errorResponse(
      res,
      error.message || "Failed to resend verification email",
      400
    );
  }
};

/**
 * STEP 2: Verify user email (GET link from email)
 * - Validates magic token
 * - Updates is_email_verified = true
 * - Redirects to org setup page
 */
export const verifyEmailController = async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    await prisma.tbl_tent_users1.update({
      where: { user_uuid: decoded.user_uuid },
      data: { is_email_verified: true },
    });

    return res.redirect(
      `${process.env.CLIENT_URL}/signup/organization?user_uuid=${decoded.user_uuid}`
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return res.redirect(`${process.env.CLIENT_URL}/signup/failed`);
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
 * Login user by email/password
 */
export const loginController = async (req, res, next) => {
  try {
    const { token, user_uuid, tent_uuid } = await authenticateUser(req.body);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, "Login successful", {
      user_uuid,
      tent_uuid,
    });
  } catch (error) {
    console.error("Login error:", error);
    return errorResponse(res, error.message || "Login failed", 401);
  }
};

/**
 * Validate current user session
 */
export const getSessionController = async (req, res, next) => {
  try {
    const { user_uuid } = req.user;

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
    console.error("Get session error:", error);
    return errorResponse(res, error.message || "Failed to fetch session", 400);
  }
};

/**
 * Logout user (clear auth cookie)
 */
export const logoutController = async (req, res, next) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
    });

    return successResponse(res, "Logged out successfully");
  } catch (error) {
    console.error("Logout error:", error);
    return errorResponse(res, error.message || "Logout failed", 400);
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
