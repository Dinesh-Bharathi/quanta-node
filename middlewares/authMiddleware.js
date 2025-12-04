// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { errorResponse } from "../utils/response.js";

export const verifyToken = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token)
      return errorResponse(res, "Tenant authentication token missing", 401);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg =
        err.name === "TokenExpiredError"
          ? "Your session has expired. Please log in again."
          : "Invalid tenant token.";
      return errorResponse(res, msg, 401);
    }

    const tenantSessionUUID = decoded.tenant_session_uuid;
    if (!tenantSessionUUID)
      return errorResponse(res, "Invalid token structure", 401);

    const session = await prisma.tbl_tenant_sessions.findFirst({
      where: {
        tenant_session_uuid: tenantSessionUUID,
        is_active: true,
        expires_at: { gt: new Date() },
      },
      include: { tenant_user: true, tenant: true },
    });

    if (!session)
      return errorResponse(res, "Tenant session expired or invalid", 401);

    req.user = {
      ...decoded,
      tenant_session_uuid: tenantSessionUUID,
      tenant_user_uuid: decoded.tenant_user_uuid,
      tenant_uuid: decoded.tenant_uuid,
      global_user_id: decoded.global_user_id,
      email: decoded.email,
    };

    req.session = session;
    return next();
  } catch (err) {
    console.error("❌ verifyTenantStrict error:", err);
    return errorResponse(res, "Authentication failed", 401);
  }
};
