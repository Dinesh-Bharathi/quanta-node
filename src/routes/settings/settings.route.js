import { Router } from "express";
import {
  getTentDetails,
  getUserProfile,
  updateUserProfile,
} from "../../controllers/settings/profile/profile.controller.js";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/user-profile/:userUuid",
  verifyToken,
  cryptoMiddleware,
  getUserProfile
);

router.put(
  "/user-profile/:userUuid",
  verifyToken,
  cryptoMiddleware,
  updateUserProfile
);

router.get(
  "/tent-details/:tentUuid",
  verifyToken,
  cryptoMiddleware,
  getTentDetails
);

export default router;
