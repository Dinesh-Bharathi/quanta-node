export const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || 500;
  const message = err.message || "Something went wrong";

  // ----- SERVER SIDE LOGGING ONLY -----
  if (statusCode >= 500) {
    console.error("🔴 Internal Server Error:", {
      message,
      errorMessage: err.internalMessage || err.message,
      errorDetails: err.details || null,
      statusCode,
      timestamp: new Date().toISOString(),
      stack: err.stack, // logged but NEVER sent to frontend
    });
  } else if (statusCode >= 400) {
    console.warn("⚠️ Client Error:", {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  // ----- CLEAN CLIENT RESPONSE -----
  const response = {
    success: false,
    message,
    error: {
      code: getErrorCode(statusCode),
      statusCode,
    },
    timestamp: new Date().toISOString(),
  };

  // Include internal error message ONLY in dev mode (optional)
  if (process.env.NODE_ENV === "development" && err.internalMessage) {
    response.error.details = err.internalMessage;
  }

  res.status(statusCode).json(response);
};

function getErrorCode(statusCode) {
  const errorCodes = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
  };

  return errorCodes[statusCode] || "UNKNOWN_ERROR";
}
