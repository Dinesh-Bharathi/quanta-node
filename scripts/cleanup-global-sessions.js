import prisma from "../config/prismaClient.js";

export async function cleanupExpiredGlobalSessions() {
  const now = new Date();

  const deleted = await prisma.tbl_global_sessions.deleteMany({
    where: { expires_at: { lt: now } },
  });

  console.log(`🧹 Cleaned ${deleted.count} expired global sessions`);
}

cleanupExpiredGlobalSessions()
  .catch(console.error)
  .finally(() => process.exit());
