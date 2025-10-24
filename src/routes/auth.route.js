import { Router } from "express";
import {
  register,
  login,
  getSession,
  logout,
  changePassword,
} from "../controllers/auth/auth.controller.js";
import { body } from "express-validator";
import { verifyToken } from "../middlewares/authMiddleware.js";
import { generateToken } from "../utils/generateToken.js";
import passport from "passport";
import { cryptoMiddleware } from "../middlewares/cryptoMiddleware.js";

const router = Router();

router.post(
  "/register",
  [
    body("tent_name").notEmpty(),
    body("tent_email").isEmail(),
    body("user_name").notEmpty(),
    body("user_email").isEmail(),
    body("password").isLength({ min: 6 }),
  ],
  register
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  cryptoMiddleware,
  login
);

router.get("/session", verifyToken, cryptoMiddleware, getSession);
router.post("/logout", verifyToken, logout);
router.post("/change-password", verifyToken, cryptoMiddleware, changePassword);

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Step 2: Callback after Google login
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const { user_uuid, tent_uuid, user_email } = req.user;

    const token = generateToken({
      user_uuid,
      tent_uuid,
      user_email,
    });

    // Set the token in HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.redirect(`${process.env.CLIENT_URL}/dashboard`);
  }
);

export default router;
