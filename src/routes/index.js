import { Router } from "express";
import { pool } from "../config/db.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import authRoutes from "./auth.route.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Secure MySQL Express API is running 🚀",
  });
});

router.get("/check-db", async (req, res, next) => {
  try {
    const [tables] = await pool.query("SHOW TABLES");
    const tentUUID = generateShortUUID();
    res.json({ success: true, tables, tentUUID });
  } catch (error) {
    next(error);
  }
});

router.use("/auth", authRoutes);

export default router;
