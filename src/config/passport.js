import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { pool } from "./db.js";
import { generateShortUUID } from "../utils/generateUUID.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        // Check if user exists
        const [userRows] = await pool.query(
          `SELECT u.*, t.tent_uuid 
           FROM tbl_tent_users1 u 
           JOIN tbl_tent_master1 t ON u.tent_id = t.tent_id
           WHERE u.user_email = ?`,
          [email]
        );

        if (userRows.length > 0) {
          // User exists → Login flow
          return done(null, userRows[0]);
        }

        // If not, create a new tent + user (owner)
        const tent_uuid = generateShortUUID();

        const [tentResult] = await pool.query(
          `INSERT INTO tbl_tent_master1 (tent_uuid, tent_email, is_email_verified)
           VALUES (?, ?, ?, ?)`,
          [tent_uuid, email, true]
        );

        const tent_id = tentResult.insertId;
        const user_uuid = generateShortUUID();

        await pool.query(
          `INSERT INTO tbl_tent_users1 
           (tent_id, user_uuid, user_name, user_email, is_owner)
           VALUES (?, ?, ?, ?, ?)`,
          [tent_id, user_uuid, name, email, true]
        );

        const newUser = {
          user_uuid,
          tent_uuid,
          user_email: email,
          user_name: name,
        };

        return done(null, newUser);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;
