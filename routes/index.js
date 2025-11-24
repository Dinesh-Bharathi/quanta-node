import { Router } from "express";
import prisma from "../config/prismaClient.js";
import { loadTemplate, sendEmail } from "../utils/nodemailer.js";

import authRoutes from "../modules/auth/auth.route.js";
import settingsRoutes from "../modules/settings/settings.route.js";
import controlsRoutes from "../modules/controls/controls.route.js";
import subscriptionRoutes from "../modules/subscriptions/subscription.route.js";
import branchesRoutes from "../modules/branches/branches.route.js";

const router = Router();

router.get("/check-db", async (req, res) => {
  try {
    // ✅ Run a lightweight query to ensure Prisma → DB connectivity
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Database connection is healthy ✅",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Database health check failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed ❌",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

const sendWelcomeEmail = async (req, res) => {
  const { to, username } = req.body;

  if (!to || !username) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    let htmlContent = await loadTemplate("welcome.html");

    // simple variable injection
    htmlContent = htmlContent.replace("{{username}}", username);

    const info = await sendEmail({
      to,
      subject: "Welcome to My App",
      html: htmlContent,
    });

    return res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("Email Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to send email" });
  }
};
router.post("/welcome", sendWelcomeEmail);

router.use("/auth", authRoutes);
router.use("/controls", controlsRoutes);
router.use("/settings", settingsRoutes);
router.use("/subscription", subscriptionRoutes);
router.use("/branches", branchesRoutes);

export default router;
