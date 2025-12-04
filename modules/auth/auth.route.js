import { Router } from "express";
import {
  getSessionController,
  logoutController,
  changePasswordController,
  verifyResetPasswordTokenController,
  resetPasswordController,
  sessionCheckController,
  getTenantsForEmailController,
  sendPasswordResetForTenantController,
  logoutGlobalSession,
} from "./controller/auth.controller.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import {
  changePasswordValidation,
  registerValidation,
  resendVerificationValidation,
} from "./auth.validation.js";
import passport from "passport";
import { generateToken } from "../../utils/generateToken.js";
import { verifyGlobalOnly } from "../../middlewares/verifyGlobalOnly.js";
import prisma from "../../config/prismaClient.js";
import {
  getTenantSelectionController,
  loginStep1Controller,
  loginStep2Controller,
} from "./controller/login.controller.js";
import {
  registerTenantController,
  registerUserController,
  resendVerificationController,
  verifyEmailController,
} from "./controller/register.controller.js";

const router = Router();
// --------------------------------------------------------
// STEP 1: Email + Password → identity/global session
// --------------------------------------------------------
router.post("/login/step1", cryptoMiddleware, loginStep1Controller);

router.get(
  "/tenant-select",
  verifyGlobalOnly,
  cryptoMiddleware,
  getTenantSelectionController
);

// --------------------------------------------------------
// STEP 2: Select Tenant → creates tenant session + JWT
// --------------------------------------------------------
router.post(
  "/login/step2",
  verifyGlobalOnly,
  cryptoMiddleware,
  loginStep2Controller
);

// --------------------------------------------------------
// GOOGLE LOGIN
// --------------------------------------------------------
router.get(
  "/google/login",
  passport.authenticate("google-login", {
    scope: ["profile", "email"],
    // prompt: "select_account",
  })
);

router.get(
  "/google/login/callback",
  passport.authenticate("google-login", {
    session: false,
  }),
  async (req, res) => {
    try {
      // CASE 1: Strategy requested a custom redirect (handled inside google-login)
      if (req.user?.customRedirect) {
        return res.redirect(req.user.customRedirect);
      }

      // CASE 2: No user returned (Google error or unknown failure)
      if (!req.user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?src=google&error=google_failed`
        );
      }

      const { tenants, email, global_session_uuid } = req.user;

      if (!email || !global_session_uuid) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?src=google&error=invalid_session`
        );
      }

      // Fetch global_user_id properly
      const globalUser = await prisma.tbl_global_users.findUnique({
        where: { email },
      });

      if (!globalUser) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?src=google&error=no_global_user`
        );
      }

      // ----------------------------------------------------
      // ISSUE GLOBAL JWT (global auth context)
      // ----------------------------------------------------
      const globalJwt = generateToken(
        {
          email,
          global_user_id: globalUser.global_user_id.toString(),
          global_session_uuid,
        },
        "7d"
      );

      // ----------------------------------------------------
      // SET COOKIE
      // ----------------------------------------------------
      res.cookie("global_token", globalJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // ----------------------------------------------------
      // SUCCESS → Redirect to tenant selection
      // ----------------------------------------------------
      return res.redirect(`${process.env.CLIENT_URL}/tenant-select?src=google`);
    } catch (err) {
      console.error("❌ Google Login Callback Error:", err);
      return res.redirect(
        `${process.env.CLIENT_URL}/login?src=google&error=google_failed`
      );
    }
  }
);

// --------------------------------------------------------
// GOOGLE SIGNUP
// --------------------------------------------------------router.get(

router.get(
  "/google/signup",
  passport.authenticate("google-signup", {
    scope: ["profile", "email"],
    // prompt: "select_account",
  })
);

router.get(
  "/google/signup/callback",
  passport.authenticate("google-signup", {
    session: false,
  }),
  async (req, res) => {
    try {
      // Case 1: custom redirect directly from strategy
      if (req.user?.customRedirect) {
        // Set global token if available
        if (req.user.global_session_uuid && req.user.global_user_id) {
          const globalJwt = generateToken(
            {
              email: req.user.email,
              global_user_id: req.user.global_user_id.toString(),
              global_session_uuid: req.user.global_session_uuid,
            },
            "7d"
          );

          res.cookie("global_token", globalJwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
        }

        return res.redirect(req.user.customRedirect);
      }

      // Should not normally occur
      return res.redirect(
        `${process.env.CLIENT_URL}/signup?src=google&error=unexpected`
      );
    } catch (err) {
      console.error("Google Signup Callback Error:", err);
      return res.redirect(
        `${process.env.CLIENT_URL}/signup?src=google&error=google_failed`
      );
    }
  }
);

// --------------------------------------------------------
// CHECK CURRENT TENANT SESSION
// --------------------------------------------------------
router.get(
  "/active/session",
  verifyToken,
  cryptoMiddleware,
  sessionCheckController
);
router.get(
  "/tenant/session",
  verifyToken,
  cryptoMiddleware,
  getSessionController
);

// --------------------------------------------------------
// TENANT LOGOUT
// --------------------------------------------------------
router.post("/logout", verifyToken, logoutController);
router.post("/logout/session", verifyGlobalOnly, logoutGlobalSession);

router.get(
  "/google/link",
  // You would need authentication middleware here
  passport.authenticate("google-login", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/link/callback",
  passport.authenticate("google-login", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/settings?error=link_failed`,
  }),
  async (req, res) => {
    // Handle account linking logic here
    res.redirect(`${process.env.CLIENT_URL}/settings?success=linked`);
  }
);

//Signup & Onboarding
router.post(
  "/signup",
  registerValidation,
  cryptoMiddleware,
  registerUserController
);
router.post(
  "/resend-verification",
  resendVerificationValidation,
  cryptoMiddleware,
  resendVerificationController
);
router.get("/verify-email/:token", verifyEmailController);
router.post(
  "/register-tenant/:userUuid",
  verifyGlobalOnly,
  cryptoMiddleware,
  registerTenantController
);

router.post(
  "/change-password",
  verifyToken,
  changePasswordValidation,
  cryptoMiddleware,
  changePasswordController
);

// Forgot password & Reset
router.post("/forgot-password/tenants", getTenantsForEmailController);
router.post("/forgot-password/send", sendPasswordResetForTenantController);
router.get("/verify-reset-token", verifyResetPasswordTokenController);
router.post("/reset-password", resetPasswordController);

export default router;
