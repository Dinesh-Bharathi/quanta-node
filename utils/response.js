/**
 * Standard API Response Helpers
 * Ensures consistent response structure across all endpoints
 */

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 */
export const successResponse = (
  res,
  message,
  data = null,
  statusCode = 200
) => {
  const response = {
    success: true,
    message,
    ...(data && { data }),
    timestamp: new Date().toISOString(),
  };

  return res.status(statusCode).json(response);
};

/**
 * Send error response with detailed logging
 * @param {Object} res - Express response object
 * @param {string} message - User-friendly error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} errorMessage - Detailed error for logging (not sent to client)
 * @param {Object} errorDetails - Additional error details for logging
 */
export const errorResponse = (
  res,
  message,
  statusCode = 500,
  errorMessage = null,
  errorDetails = null
) => {
  // Log detailed error server-side
  if (statusCode >= 500) {
    console.error("🔴 Internal Server Error:", {
      message,
      errorMessage,
      errorDetails,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  } else if (statusCode >= 400) {
    console.warn("⚠️ Client Error:", {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  // Send clean response to client
  const response = {
    success: false,
    message,
    error: {
      code: getErrorCode(statusCode),
      statusCode,
    },
    timestamp: new Date().toISOString(),
  };

  // Include errorMessage in development mode only
  if (process.env.NODE_ENV === "development" && errorMessage) {
    response.error.details = errorMessage;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {Array|Object} errors - Validation errors
 */
export const validationErrorResponse = (res, errors) => {
  console.warn("⚠️ Validation Error:", {
    errors,
    timestamp: new Date().toISOString(),
  });

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    error: {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      validationErrors: Array.isArray(errors) ? errors : [errors],
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Send unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export const unauthorizedResponse = (res, message = "Unauthorized access") => {
  return errorResponse(res, message, 401, "Authentication required");
};

/**
 * Send forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export const forbiddenResponse = (res, message = "Access forbidden") => {
  return errorResponse(res, message, 403, "Insufficient permissions");
};

/**
 * Send not found error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
export const notFoundResponse = (res, message = "Resource not found") => {
  return errorResponse(res, message, 404, message);
};

/**
 * Get error code from status code
 * @param {number} statusCode - HTTP status code
 * @returns {string} Error code
 */
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

/**
 * Handle Prisma errors and convert to appropriate HTTP responses
 * @param {Error} error - Prisma error
 * @returns {Object} { message, statusCode, errorMessage }
 */
export const handlePrismaError = (error) => {
  const prismaErrorMap = {
    P2002: {
      message: "A record with this information already exists",
      statusCode: 409,
      field: error.meta?.target?.[0] || "unknown field",
    },
    P2025: {
      message: "Record not found",
      statusCode: 404,
    },
    P2003: {
      message: "Invalid reference to related record",
      statusCode: 400,
    },
    P2014: {
      message: "Invalid relation reference",
      statusCode: 400,
    },
    P2016: {
      message: "Query interpretation error",
      statusCode: 400,
    },
    P2021: {
      message: "Table does not exist",
      statusCode: 500,
    },
    P2022: {
      message: "Column does not exist",
      statusCode: 500,
    },
  };

  const errorInfo = prismaErrorMap[error.code] || {
    message: "Database operation failed",
    statusCode: 500,
  };

  return {
    message: errorInfo.message,
    statusCode: errorInfo.statusCode,
    errorMessage: `Prisma Error ${error.code}: ${error.message}`,
    errorDetails: {
      code: error.code,
      meta: error.meta,
    },
  };
};

/**
 * Global error handler middleware
 * Place this at the end of your middleware chain
 */
export const globalErrorHandler = (err, req, res, next) => {
  // Handle Prisma errors
  if (err.code?.startsWith("P")) {
    const { message, statusCode, errorMessage, errorDetails } =
      handlePrismaError(err);
    return errorResponse(res, message, statusCode, errorMessage, errorDetails);
  }

  // Handle known application errors
  if (err.name === "ValidationError") {
    return validationErrorResponse(res, err.errors);
  }

  if (err.name === "JsonWebTokenError") {
    return unauthorizedResponse(res, "Invalid token");
  }

  if (err.name === "TokenExpiredError") {
    return unauthorizedResponse(res, "Token expired");
  }

  // Default internal server error
  console.error("🔴 Unhandled Error:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  return errorResponse(res, "Internal server error", 500, err.message, {
    name: err.name,
    stack: err.stack,
  });
};

export default {
  successResponse,
  errorResponse,
  validationErrorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  handlePrismaError,
  globalErrorHandler,
};
