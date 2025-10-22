import { Router } from "express";
import { cryptoMiddleware } from "../../middlewares/cryptoMiddleware.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { getUserMenus } from "../../controllers/controls/controls.controller.js";

const router = Router();

router.get("/menu/:userUuid", getUserMenus);

export default router;
