import crypto from "crypto";

/**
 * Generates a unique 8-character alphanumeric ID.
 * Example: 'a9f3d2b7'
 */
export const generateShortUUID = () => {
  return crypto.randomBytes(4).toString("hex"); // 8 chars
};
