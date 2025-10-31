import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "./db.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import { createDefaultSetupForTenant } from "../services/auth/auth.service.js";

// ===== GOOGLE LOGIN STRATEGY =====
passport.use(
  "google-login",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/auth/google/login/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        const [userRows] = await pool.query(
          `SELECT u.*, t.tent_uuid 
           FROM tbl_tent_users1 u 
           JOIN tbl_tent_master1 t ON u.tent_id = t.tent_id
           WHERE u.user_email = ?`,
          [email]
        );

        if (userRows.length === 0) {
          // User not found — handle as login failure
          return done(null, false, {
            message: "No account found. Please sign up.",
          });
        }

        return done(null, userRows[0]);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// ===== GOOGLE SIGNUP STRATEGY =====
passport.use(
  "google-signup",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/auth/google/signup/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      const connection = await pool.getConnection();
      try {
        console.log("profile", profile);
        await connection.beginTransaction();

        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;

        // Check if user already exists
        const [existingUser] = await connection.query(
          `SELECT u.user_id FROM tbl_tent_users1 u WHERE u.user_email = ?`,
          [email]
        );

        console.log("existingUser", existingUser);

        if (existingUser.length > 0) {
          await connection.rollback();
          return done(null, false, {
            message: "User already exists. Please login.",
          });
        }

        // Create tenant
        const tent_uuid = generateShortUUID();
        const [tentResult] = await connection.query(
          `INSERT INTO tbl_tent_master1 (tent_uuid, tent_email, is_email_verified)
           VALUES (?, ?, ?)`,
          [tent_uuid, email, true]
        );
        const tent_id = tentResult.insertId;

        // Create user (owner)
        const user_uuid = generateShortUUID();
        const [userResult] = await connection.query(
          `INSERT INTO tbl_tent_users1 (tent_id, user_uuid, user_name, user_email, is_owner)
           VALUES (?, ?, ?, ?, ?)`,
          [tent_id, user_uuid, name, email, true]
        );
        const user_id = userResult.insertId;

        // Default setup (trial, roles, permissions)
        await createDefaultSetupForTenant(connection, tent_id, user_id);

        await connection.commit();

        const newUser = {
          user_uuid,
          tent_uuid,
          user_email: email,
          user_name: name,
        };

        return done(null, newUser);
      } catch (error) {
        await connection.rollback();
        return done(error, null);
      } finally {
        connection.release();
      }
    }
  )
);

export default passport;
