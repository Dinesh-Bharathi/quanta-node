import {
  authenticateGlobalUser,
  createGlobalSession,
  finalizeTenantLogin,
  validateGlobalSession,
} from "../service/login.service.js";
import { successResponse, errorResponse } from "../../../utils/response.js";
import prisma from "../../../config/prismaClient.js";
import { generateToken } from "../../../utils/generateToken.js";

/* ============================================================
   STEP 1 → EMAIL + PASSWORD  → GLOBAL_SESSION_UUID
   ============================================================ */
export const loginStep1Controller = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return errorResponse(res, "Email and password are required", 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Step 1: Authenticate
    const authResult = await authenticateGlobalUser({
      email: normalizedEmail,
      password,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Step 2: Create global session for ONLY matched tenants
    const globalSession = await createGlobalSession({
      email: normalizedEmail,
      tenantUserUuids: authResult.matchedTenantUUIDs,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Step 3: Issue Global JWT
    const globalJwt = generateToken(
      {
        email: normalizedEmail,
        global_user_id: authResult.global_user_id.toString(),
        global_session_uuid: globalSession.global_session_uuid,
      },
      "7d"
    );

    res.cookie("global_token", globalJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Step 4: Return ALL tenants (not only matched ones)
    return successResponse(res, "Authenticated", {
      tenants: authResult.allTenants,
      global_session_uuid: globalSession.global_session_uuid,
    });
  } catch (error) {
    console.error("❌ loginStep1Controller error:", error);
    return errorResponse(res, "Invalid email or password", 401);
  }
};

// GET /api/auth/tenant-select
export const getTenantSelectionController = async (req, res, next) => {
  try {
    const { global_session_uuid, email } = req.global;

    if (!global_session_uuid) {
      return errorResponse(res, "Global session not found", 401);
    }

    // 1️⃣ Load session → contains ONLY matched tenant_user_uuids
    const session = await validateGlobalSession(global_session_uuid);
    const matchedUUIDs = session.tenantUserUuids;

    // 2️⃣ Fetch all tenants for this email
    const tenantAccounts = await prisma.tbl_tenant_users.findMany({
      where: { user_email: email },
      include: {
        tenant: { select: { tenant_uuid: true, tenant_name: true } },
        userRoles: { include: { role: true } },
      },
    });

    // 3️⃣ Build response
    const tenants = tenantAccounts.map((acc) => ({
      tenant_user_uuid: acc.tenant_user_uuid,
      tenant_uuid: acc.tenant?.tenant_uuid || null,
      tenant_name: acc.tenant?.tenant_name || null,
      is_owner: acc.is_owner,
      is_email_verified: acc.is_email_verified,
      hasPassword: !!acc.password,

      // passwordMatched only means THIS tenant matched login step 1
      passwordMatched: matchedUUIDs.includes(acc.tenant_user_uuid),

      // allowedToEnter → user can select this tenant
      allowed: matchedUUIDs.includes(acc.tenant_user_uuid),

      // roles
      roles: acc.userRoles.map((ur) => ur.role.role_name),
    }));

    return successResponse(res, "Tenant selection data loaded", {
      email,
      tenants,
      global_session_uuid,
    });
  } catch (err) {
    console.error("❌ Tenant-select error:", err);
    return errorResponse(err, "Unauthorised", 401);
  }
};

/* ============================================================
   STEP 2 → SELECT TENANT → CREATE TENANT_SESSION_UUID + JWT
   ============================================================ */
export const loginStep2Controller = async (req, res, next) => {
  try {
    const { global_session_uuid, email } = req.global;
    const { tenant_user_uuid } = req.body;

    if (!global_session_uuid || !tenant_user_uuid) {
      return errorResponse(
        res,
        "global_session_uuid and tenant_user_uuid required",
        400
      );
    }

    const { token, payload } = await finalizeTenantLogin({
      global_session_uuid,
      tenant_user_uuid,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return successResponse(res, "Login successful", payload);
  } catch (error) {
    console.error("❌ loginStep2Controller error:", error);
    return next(error);
  }
};
