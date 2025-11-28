import { Router } from "express";
import {
  getSessionController,
  logoutController,
  changePasswordController,
  registerUserController,
  verifyEmailController,
  registerTenantController,
  resendVerificationController,
  verifyResetPasswordTokenController,
  resetPasswordController,
  loginStep1Controller,
  loginStep2Controller,
  sessionCheckController,
  getTenantSelectionController,
  getTenantsForEmailController,
  sendPasswordResetForTenantController,
} from "./auth.controller.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import {
  changePasswordValidation,
  registerValidation,
  resendVerificationValidation,
} from "./auth.validation.js";
import passport from "passport";
import { generateToken } from "../../utils/generateToken.js";

const router = Router();
// --------------------------------------------------------
// STEP 1: Email + Password → identity/global session
// --------------------------------------------------------
router.post("/login/step1", cryptoMiddleware, loginStep1Controller);

router.get("/tenant-select/:global_session_uuid", getTenantSelectionController);

// --------------------------------------------------------
// STEP 2: Select Tenant → creates tenant session + JWT
// --------------------------------------------------------
router.post("/login/step2", loginStep2Controller);

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
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed`,
  }),
  async (req, res) => {
    // Frontend redirects to /tenant-select
    const global_session_uuid = req.user.global_session_uuid;

    return res.redirect(
      `${process.env.CLIENT_URL}/tenant-select?src=google&global_session_uuid=${global_session_uuid}`
    );
  }
);

// --------------------------------------------------------
// GOOGLE SIGNUP
// --------------------------------------------------------
router.get(
  "/google/signup",
  passport.authenticate("google-signup", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/signup/callback",
  passport.authenticate("google-signup", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/signup?src=google&error=google_failed`,
  }),
  async (req, res) => {
    const global_session_uuid = req.user.global_session_uuid;

    return res.redirect(
      `${process.env.CLIENT_URL}/tenant-select?global_session_uuid=${global_session_uuid}`
    );
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
router.post("/logout", logoutController);

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
router.post("/signup", registerValidation, registerUserController);
router.post(
  "/resend-verification",
  resendVerificationValidation,
  resendVerificationController
);
router.get("/verify-email/:token", verifyEmailController);
router.post("/register-tenant/:userUuid", registerTenantController);

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
