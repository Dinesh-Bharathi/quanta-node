import { Router } from "express";
import {
  register,
  login,
  getSession,
  logout,
} from "../controllers/auth/auth.controller.js";
import { body } from "express-validator";
import { verifyToken } from "../middlewares/authMiddleware.js";

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
  login
);

router.get("/session", verifyToken, getSession);
router.post("/logout", verifyToken, logout);

export default router;
