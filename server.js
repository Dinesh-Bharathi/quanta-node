// server.js
import app from "./app.js";
import dotenv from "dotenv";
import prisma from "./config/prismaClient.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to database");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("🛑 Prisma disconnected");
  process.exit(0);
});
