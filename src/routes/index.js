import { Router } from "express";
import { pool } from "../config/db.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import authRoutes from "./auth.route.js";
import settingsRoutes from "./settings/settings.route.js";
import controlsRoutes from "./controls/controls.route.js";
import prisma from "../config/prismaClient.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API service is running 🚀",
  });
});

router.get("/check-db", async (req, res, next) => {
  try {
    const connection = await pool.getConnection();
    await connection.ping(); // lightweight health check
    connection.release();

    res.json({
      success: true,
      message: "Database connection is healthy ✅",
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed ❌",
      error: error.message,
    });
  }
});

router.get("/prisma", async (req, res, next) => {
  try {
    const tenants = await prisma.tbl_tent_master.findMany({
      where: { tent_status: "active" },
      select: { tent_id: true, tent_name: true, tent_email: true },
    });
    res.json({ data: tenants });
  } catch (error) {
    next(error);
  }
});

router.use("/auth", authRoutes);
router.use("/controls", controlsRoutes);
router.use("/settings", settingsRoutes);

export default router;
