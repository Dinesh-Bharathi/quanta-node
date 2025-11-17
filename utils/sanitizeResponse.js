/**
 * Recursively removes internal DB-only fields such as numeric IDs,
 * timestamps (if needed), and relation foreign keys.
 * Keeps UUID-based identifiers and public fields.
 */
export function sanitizeResponse(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeResponse);
  } else if (obj && typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // 🔹 Skip internal fields you never expose
      if (
        key.endsWith("_id") || // db-only keys like plan_id, tent_id, etc.
        key === "id"
      ) {
        continue;
      }

      // 🔹 Recursively sanitize nested objects
      sanitized[key] =
        typeof value === "object" && value !== null
          ? sanitizeResponse(value)
          : value;
    }
    return sanitized;
  }
  return obj;
}
