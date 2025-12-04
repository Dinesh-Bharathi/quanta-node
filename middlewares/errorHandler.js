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
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    422: "Unprocessable entity",
    429: "Too manu requests",
    500: "Internal server error",
    502: "Bad gateway",
    503: "Service unavailable",
  };

  return errorCodes[statusCode] || "Unknown error";
}
