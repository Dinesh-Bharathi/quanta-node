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
  passport.authenticate("google-login", { scope: ["profile", "email"] })
);

router.get(
  "/google/login/callback",
  passport.authenticate("google-login", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/login?error=not_found`,
  }),
  (req, res) => {
    const { user_uuid, tent_uuid, user_email } = req.user;

    const token = generateToken({ user_uuid, tent_uuid, user_email });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
  }
);

router.get(
  "/google/signup",
  passport.authenticate("google-signup", { scope: ["profile", "email"] })
);

router.get(
  "/google/signup/callback",
  passport.authenticate("google-signup", {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/signup?error=exists`,
  }),
  (req, res) => {
    const { user_uuid, tent_uuid, user_email } = req.user;

    const token = generateToken({ user_uuid, tent_uuid, user_email });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
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
