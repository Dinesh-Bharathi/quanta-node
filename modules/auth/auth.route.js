import { Router } from "express";
import {
  loginController,
  getSessionController,
  logoutController,
  changePasswordController,
  registerUserController,
  verifyEmailController,
  registerTenantController,
  resendVerificationController,
} from "./auth.controller.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import {
  loginValidation,
  changePasswordValidation,
  registerValidation,
  resendVerificationValidation,
} from "./auth.validation.js";
import passport from "passport";
import { generateToken } from "../../utils/generateToken.js";

const router = Router();

router.post("/signup", registerValidation, registerUserController);
router.post(
  "/resend-verification",
  resendVerificationValidation,
  resendVerificationController
);
router.get("/verify-email/:token", verifyEmailController);
router.post("/register-tenant/:userUuid", registerTenantController);
router.post("/login", loginValidation, cryptoMiddleware, loginController);

router.get(
  "/google/login",
  passport.authenticate("google-login", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/login/callback",
  passport.authenticate("google-login", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed`,
  }),
  async (req, res) => {
    try {
      const { user_uuid, tent_uuid, user_email } = req.user;

      // Generate JWT token
      const token = generateToken({
        user_uuid,
        tent_uuid,
        user_email,
      });

      // Set secure HTTP-only cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: "/",
      });

      // Redirect to dashboard
      res.redirect(`${process.env.CLIENT_URL}/dashboard`);
    } catch (error) {
      console.error("OAuth login callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=server_error`);
    }
  }
);

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
    failureRedirect: `${process.env.CLIENT_URL}/signup?error=auth_failed`,
  }),
  async (req, res) => {
    try {
      const { user_uuid, tent_uuid } = req.user;

      // If the user has a tenant → direct login flow
      if (tent_uuid) {
        return res.redirect(`${process.env.CLIENT_URL}/dashboard`);
      }

      // If no tenant → onboarding
      return res.redirect(
        `${process.env.CLIENT_URL}/signup/onboarding?user_uuid=${user_uuid}`
      );
    } catch (error) {
      console.error("OAuth signup callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/signup?error=server_error`);
    }
  }
);

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

router.get("/session", verifyToken, cryptoMiddleware, getSessionController);
router.post("/logout", verifyToken, logoutController);
router.post(
  "/change-password",
  verifyToken,
  changePasswordValidation,
  cryptoMiddleware,
  changePasswordController
);

export default router;
