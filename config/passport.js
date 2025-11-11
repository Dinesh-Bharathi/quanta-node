import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prismaClient.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import { createDefaultSetupForTenant } from "../modules/auth/tenantSetup.js";

// ==================================================
// ✅ GOOGLE LOGIN STRATEGY
// ==================================================
passport.use(
  "google-login",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/api/auth/google/login/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(null, false, {
            message: "Google account email not found.",
          });
        }

        // 🔍 Find user by email
        const user = await prisma.tbl_tent_users1.findFirst({
          where: { user_email: email },
          include: { tbl_tent_master1: true },
        });

        if (!user) {
          return done(null, false, {
            message: "No account found. Please sign up first.",
          });
        }

        const userData = {
          user_uuid: user.user_uuid,
          user_name: user.user_name,
          user_email: user.user_email,
          tent_uuid: user.tbl_tent_master1?.tent_uuid,
        };

        return done(null, userData);
      } catch (error) {
        console.error("Google login error:", error);
        return done(error, null);
      }
    }
  )
);

// ==================================================
// ✅ GOOGLE SIGNUP STRATEGY
// ==================================================
passport.use(
  "google-signup",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/api/auth/google/signup/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;

      if (!email) {
        return done(null, false, {
          message: "Google account email not found.",
        });
      }

      try {
        // 🔍 Check if user already exists
        const existingUser = await prisma.tbl_tent_users1.findUnique({
          where: { user_email: email },
          include: { tbl_tent_master1: true },
        });

        if (existingUser) {
          // ✅ Merge accounts if needed (optional enhancement)
          return done(null, false, {
            message: "User already exists. Please login instead.",
          });
        }

        // 🔁 Transaction for tenant + user creation
        const result = await prisma.$transaction(async (tx) => {
          // 🔹 1. Create new tenant
          const tent_uuid = generateShortUUID();
          const newTenant = await tx.tbl_tent_master1.create({
            data: {
              tent_uuid,
              tent_email: email,
              is_email_verified: true,
            },
          });

          // 🔹 2. Create tenant owner user
          const user_uuid = generateShortUUID();
          const newUser = await tx.tbl_tent_users1.create({
            data: {
              tent_id: newTenant.tent_id,
              user_uuid,
              user_name: name,
              user_email: email,
              is_owner: true,
              is_email_verified: true,
            },
          });

          // 🔹 3. Initialize tenant setup (roles, menus, subscription, etc.)
          await createDefaultSetupForTenant(
            tx,
            newTenant.tent_id,
            newUser.user_id
          );

          return { newTenant, newUser };
        });

        const { newTenant, newUser } = result;

        const userData = {
          user_uuid: newUser.user_uuid,
          user_email: newUser.user_email,
          user_name: newUser.user_name,
          tent_uuid: newTenant.tent_uuid,
        };

        return done(null, userData);
      } catch (error) {
        console.error("Google signup error:", error);
        return done(error, null);
      }
    }
  )
);

export default passport;
