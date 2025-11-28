// middleware/verifyToken.js

import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { errorResponse } from "../utils/response.js";

export const verifyToken = async (req, res, next) => {
  try {
    // -----------------------------------------------------
    // TEMP DEV SKIP AUTH (SAFE FOR DEVELOPMENT ONLY)
    // -----------------------------------------------------
    const skipKey = req.headers["x-skip-auth"];
    const skipSecret = process.env.SKIP_AUTH_SECRET || "dev-skip-secret";

    if (skipKey && skipKey === skipSecret) {
      req.user = { skippedAuth: true };
      return next();
    }

    // -----------------------------------------------------
    // READ JWT TOKEN FROM COOKIE
    // -----------------------------------------------------
    const token = req.cookies.token;
    if (!token) {
      return errorResponse(res, "Authentication token missing", 401);
    }

    // -----------------------------------------------------
    // VERIFY JWT SIGNATURE
    // -----------------------------------------------------
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        const message =
          err.name === "TokenExpiredError"
            ? "Your session has expired. Please log in again."
            : "Invalid authentication token.";
        return errorResponse(res, message, 401);
      }

      // JWT MUST CONTAIN tenant_session_uuid
      const tenantSessionUUID = decoded.tenant_session_uuid;

      if (!tenantSessionUUID) {
        return errorResponse(res, "Invalid token structure", 401);
      }

      // -----------------------------------------------------
      // VALIDATE TENANT SESSION IN DB
      // -----------------------------------------------------
      const session = await prisma.tbl_tenant_sessions.findFirst({
        where: {
          tenant_session_uuid: tenantSessionUUID,
          is_active: true,
          expires_at: { gt: new Date() },
        },
        include: {
          tenant_user: true,
          tenant: true,
        },
      });

      if (!session) {
        return errorResponse(res, "Session expired or invalid", 401);
      }

      // -----------------------------------------------------
      // ATTACH DECODED DATA + SESSION RECORD TO REQUEST
      // -----------------------------------------------------
      req.user = {
        ...decoded,
        tenant_session_uuid: tenantSessionUUID,
        tenant_user_uuid: decoded.tenant_user_uuid,
        tenant_uuid: decoded.tenant_uuid,
        global_user_id: decoded.global_user_id,
        email: decoded.email,
      };

      req.session = session; // full DB session record

      next();
    });
  } catch (error) {
    console.error("❌ verifyToken Middleware Error:", error);
    return errorResponse(res, "Authentication failed", 500);
  }
};
