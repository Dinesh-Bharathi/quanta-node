import { body } from "express-validator";

export const registerValidation = [
  body("user_name").notEmpty().withMessage("User name is required"),
  body("user_email").isEmail().withMessage("Valid user email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

export const resendVerificationValidation = [
  body("user_email").isEmail().withMessage("Valid email is required"),
];

export const loginValidation = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

export const changePasswordValidation = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];
