// middlewares/verifyGlobalOnly.js
import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";
import { errorResponse } from "../utils/response.js";

export const verifyGlobalOnly = async (req, res, next) => {
  try {
    const token =
      req.cookies?.global_token ||
      req.headers["authorization-global"] ||
      req.headers["x-global-token"];

    if (!token) return errorResponse(res, "Global session token missing", 401);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg =
        err.name === "TokenExpiredError"
          ? "Global session expired"
          : "Invalid global token";
      return errorResponse(res, msg, 401);
    }

    if (!decoded.global_user_id) {
      return errorResponse(res, "Invalid global token payload", 401);
    }

    // optional: validate DB session UUID if present in token
    if (decoded.global_session_uuid) {
      const gs = await prisma.tbl_global_sessions.findFirst({
        where: {
          global_session_uuid: decoded.global_session_uuid,
          email: decoded.email,
          expires_at: { gt: new Date() },
        },
      });

      if (!gs) return errorResponse(res, "Global session expired", 401);

      req.globalSession = gs;
    }

    req.global = {
      global_user_id: Number(decoded.global_user_id),
      global_user_uuid: decoded.global_user_uuid,
      email: decoded.email,
      global_session_uuid: decoded.global_session_uuid || null,
    };

    return next();
  } catch (err) {
    console.error("❌ verifyGlobalOnly error:", err);
    return errorResponse(res, "Global authentication failed", 401);
  }
};
