import prisma from "../../../config/prismaClient.js";
import { generateShortUUID } from "../../../utils/generateUUID.js";
import { generateToken } from "../../../utils/generateToken.js";
import { comparePassword } from "../../../utils/hashPassword.js";

/* ============================================================
   1. AUTHENTICATE GLOBAL USER BY EMAIL + PASSWORD
   ============================================================ */
export async function authenticateGlobalUser({
  email,
  password,
  ip = null,
  userAgent = null,
}) {
  // 1️⃣ Fetch all accounts for that email
  const tenantAccounts = await prisma.tbl_tenant_users.findMany({
    where: { user_email: email },
    include: {
      tenant: { select: { tenant_uuid: true, tenant_name: true } },
      userRoles: { include: { role: true } },
      globalUser: true,
    },
  });

  if (!tenantAccounts || tenantAccounts.length === 0) {
    throw new Error("Invalid credentials");
  }

  const global_user_id = tenantAccounts[0]?.global_user_id;
  if (!global_user_id) throw new Error("Global user missing");

  const allTenants = [];
  const matchedTenantUUIDs = [];

  // 2️⃣ Evaluate password against ALL tenants
  for (const acc of tenantAccounts) {
    const hasPassword = !!acc.password;
    let passwordMatched = false;

    if (hasPassword) {
      try {
        passwordMatched = await comparePassword(password, acc.password);
      } catch {}
    }

    if (passwordMatched) {
      matchedTenantUUIDs.push(acc.tenant_user_uuid);
    }

    allTenants.push({
      tenant_user_uuid: acc.tenant_user_uuid,
      tenant_uuid: acc.tenant?.tenant_uuid,
      tenant_name: acc.tenant?.tenant_name,
      is_owner: acc.is_owner,
      is_email_verified: acc.is_email_verified,
      hasPassword,
      passwordMatched,
      roles: acc.userRoles.map((ur) => ur.role.role_name),
    });
  }

  if (matchedTenantUUIDs.length === 0) {
    throw new Error("Invalid credentials");
  }

  return {
    global_user_id,
    allTenants,
    matchedTenantUUIDs,
  };
}

/* ============================================================
   2. CREATE GLOBAL SESSION (SHORT LIVED)
   ============================================================ */
export async function createGlobalSession({
  email,
  tenantUserUuids,
  ip = null,
  userAgent = null,
}) {
  const global_session_uuid = generateShortUUID();
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7days

  return prisma.tbl_global_sessions.create({
    data: {
      global_session_uuid,
      email,
      tenant_user_uuids: tenantUserUuids.join(","),
      expires_at,
    },
    select: {
      global_user_id: true,
      global_session_uuid: true,
      expires_at: true,
    },
  });
}

/* ============================================================
   3. VALIDATE GLOBAL SESSION (STEP 2)
   ============================================================ */
export async function validateGlobalSession(global_session_uuid) {
  const session = await prisma.tbl_global_sessions.findUnique({
    where: { global_session_uuid },
  });

  if (!session) throw new Error("Invalid session");

  if (session.expires_at < new Date()) {
    await prisma.tbl_global_sessions.delete({
      where: { global_session_uuid },
    });
    throw new Error("Session expired");
  }

  return {
    email: session.email,
    tenantUserUuids: session.tenant_user_uuids
      ? session.tenant_user_uuids.split(",")
      : [],
  };
}

/* ============================================================
   4. FINALIZE TENANT LOGIN (STEP 2)
   Creates tenant_session_uuid + JWT
   ============================================================ */
export async function finalizeTenantLogin({
  global_session_uuid,
  tenant_user_uuid,
  ip = null,
  userAgent = null,
}) {
  // 1️⃣ Validate global session and user selection
  const { tenantUserUuids } = await validateGlobalSession(global_session_uuid);

  if (!tenantUserUuids.includes(tenant_user_uuid)) {
    throw new Error("Unauthorized tenant selection");
  }

  // 2️⃣ Fetch tenant account
  const account = await prisma.tbl_tenant_users.findUnique({
    where: { tenant_user_uuid },
    include: {
      tenant: { select: { tenant_uuid: true, tenant_id: true } },
    },
  });

  if (!account) throw new Error("Tenant user not found");

  // 3️⃣ Create tenant session
  const tenant_session_uuid = generateShortUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  await prisma.tbl_tenant_sessions.create({
    data: {
      tenant_session_uuid,
      tenant_user_id: account.tenant_user_id,
      tenant_id: account.tenant?.tenant_id || null,
      ip_address: ip,
      user_agent: userAgent,
      expires_at: expiresAt,
      is_active: true,
    },
  });

  // 4️⃣ Prepare JWT payload
  const payload = {
    tenant_session_uuid,
    tenant_user_uuid: account.tenant_user_uuid,
    tenant_uuid: account.tenant?.tenant_uuid || null,
    global_user_id: account.global_user_id.toString(),
    email: account.user_email,
  };

  const token = generateToken(payload, "24h");

  return { token, payload };
}
