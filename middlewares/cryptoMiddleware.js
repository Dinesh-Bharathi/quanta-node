import CryptoJS from "crypto-js";

/**
 * AES Encryption/Decryption Middleware
 * Automatically decrypts request body and encrypts response data
 */

const secretKey = CryptoJS.enc.Latin1.parse(process.env.ENCRYPTION_KEY);

// Helper to generate random IV
function randomString(length, chars) {
  let result = "";
  for (let i = length; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

/** 🔓 Decrypt incoming request data */
function decryptData(encryptedString) {
  if (
    !encryptedString ||
    typeof encryptedString !== "string" ||
    !encryptedString.includes(":")
  ) {
    throw new Error("Invalid encrypted data format.");
  }

  const [publicKey, cipherText] = encryptedString.split(":");

  const ivKey = CryptoJS.enc.Latin1.parse(publicKey);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(cipherText),
  });

  const bytes = CryptoJS.AES.decrypt(cipherParams, secretKey, { iv: ivKey });
  const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

  try {
    return JSON.parse(decryptedText);
  } catch (err) {
    throw new Error("Decryption failed: Invalid JSON.");
  }
}

/** 🔒 Encrypt response data */
function encryptData(data) {
  const ivKey = CryptoJS.enc.Latin1.parse(
    randomString(
      16,
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    )
  );
  const publicKey = CryptoJS.enc.Latin1.stringify(ivKey);

  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), secretKey, {
    iv: ivKey,
  }).toString();

  return `${publicKey}:${encrypted}`;
}

/**
 * Express Middleware
 * Decrypts request body automatically and encrypts the response
 */
export const cryptoMiddleware = (req, res, next) => {
  try {
    // 1️⃣ Decrypt request body if exists
    if (req.body && typeof req.body.data === "string") {
      req.body = decryptData(req.body.data);
    }

    // 2️⃣ Intercept `res.json` to encrypt response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      try {
        const encryptedResponse = encryptData(data);
        return originalJson({ data: encryptedResponse });
      } catch (err) {
        console.error("Encryption failed:", err.message);
        return originalJson({ error: "Encryption failed" });
      }
    };

    next();
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return res.status(400).json({ error: "Invalid encrypted payload" });
  }
};
