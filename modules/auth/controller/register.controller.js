import {
  registerTenantForUser,
  registerUser,
  resendVerificationService,
} from "../service/register.service.js";
import { successResponse, errorResponse } from "../../../utils/response.js";
import prisma from "../../../config/prismaClient.js";
import jwt from "jsonwebtoken";
import { generateToken } from "../../../utils/generateToken.js";
import { createGlobalSession } from "../service/login.service.js";

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

    const email = user_email.trim().toLowerCase();

    // -------------------------------------------------------------------
    // CASE A: user already registered + has tenant → BLOCK SIGNUP
    // -------------------------------------------------------------------
    if (result.status === "already_registered_with_tenant") {
      return errorResponse(
        res,
        "This email is already registered. Please login.",
        409
      );
    }

    // -------------------------------------------------------------------
    // CASE B: user exists but not verified → verification email sent/resent
    // -------------------------------------------------------------------
    if (
      result.status === "verification_sent" ||
      result.status === "verification_resent"
    ) {
      return successResponse(res, result.message, result, 201);
    }

    // -------------------------------------------------------------------
    // CASE C: verified user with NO tenant (tenant_pending)
    // → Redirect to onboarding
    // → Create global session + JWT cookie
    // -------------------------------------------------------------------
    if (result.status === "tenant_pending") {
      // Create global session (same as Google Signup)
      const globalSession = await createGlobalSession({
        email,
        tenantUserUuids: [result.tenant_user_uuid],
      });

      // Create global token
      const globalJwt = generateToken(
        {
          email,
          global_user_id: result.global_user_id.toString(),
          global_session_uuid: globalSession.global_session_uuid,
        },
        "7d"
      );

      // Set cookie
      res.cookie("global_token", globalJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return successResponse(res, result.message, {
        redirect: `/signup/onboarding?tenant_user_uuid=${result.tenant_user_uuid}`,
        tenant_user_uuid: result.tenant_user_uuid,
        user_email: email,
      });
    }

    // -------------------------------------------------------------------
    // CASE D: brand new user (verification_sent)
    // Manual flow requires verification before onboarding — no session yet.
    // -------------------------------------------------------------------
    if (result.status === "verification_sent") {
      return successResponse(res, result.message, result, 201);
    }

    return successResponse(res, result.message, result);
  } catch (error) {
    console.error("❌ Register User Controller Error:", error);

    if (error.code === "P2002") {
      return errorResponse(
        res,
        "This email is already registered globally",
        409
      );
    }

    if (error.code === "VERIFICATION_RECENTLY_SEND") {
      return errorResponse(res, error.message, 409);
    }

    if (error.code === "ALREADY_REGISTERED_WITH_TENANT") {
      return errorResponse(res, error.message, 409);
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
        user_email: true,
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
      const globalSession = await createGlobalSession({
        email: user.user_email,
        tenantUserUuids: [user.tenant_user_uuid],
      });

      // Create global token
      const globalJwt = generateToken(
        {
          email: user.user_email,
          global_user_id: result.global_user_id.toString(),
          global_session_uuid: globalSession.global_session_uuid,
        },
        "7d"
      );

      // Set cookie
      res.cookie("global_token", globalJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
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
      req.body,
      req
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
