// scripts/backfill-global-users.js
import prisma from "../config/prismaClient.js"; // adjust path to your prisma client
import { generateShortUUID } from "../utils/generateUUID.js"; // adjust as needed

async function main() {
  console.log(
    "Backfill: create global users for distinct tenant user emails..."
  );

  // 1. get unique emails from tbl_tenant_users
  const emails =
    await prisma.$queryRaw`SELECT DISTINCT user_email FROM tbl_tenant_users WHERE user_email IS NOT NULL`;

  for (const row of emails) {
    const email = row.user_email;
    // check if global exists
    const existing = await prisma.tbl_global_users.findFirst({
      where: { email },
    });

    if (existing) {
      console.log("skipping", email);
      continue;
    }

    const global_uuid = generateShortUUID();
    const created = await prisma.tbl_global_users.create({
      data: {
        global_user_uuid: global_uuid,
        email,
        name: null,
      },
    });

    // update all tenant users with this email to point to global_user_id
    await prisma.tbl_tenant_users.updateMany({
      where: { user_email: email },
      data: { global_user_id: created.global_user_id },
    });

    console.log("Created global user for", email);
  }

  console.log("Backfill finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
