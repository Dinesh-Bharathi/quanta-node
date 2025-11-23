import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prismaClient.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import { createDefaultSetupForTenant } from "../modules/auth/tenantSetup.js";
import { sendGoogleSignupEmail } from "../services/emailService.js";

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

        // 🔍 Find user by email with roles and branches
        const user = await prisma.tbl_tent_users1.findFirst({
          where: { user_email: email },
          include: {
            tbl_tent_master1: true,
            tbl_user_roles: {
              include: {
                tbl_roles: true,
                tbl_branches: {
                  select: {
                    branch_uuid: true,
                    branch_name: true,
                  },
                },
              },
            },
          },
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
// passport.use(
//   "google-signup",
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: `${process.env.SERVER_URL}/api/auth/google/signup/callback`,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       const email = profile.emails?.[0]?.value;
//       const name = profile.displayName;
//       const firstName = profile.name?.givenName || name;
//       const lastName = profile.name?.familyName || "";

//       if (!email) {
//         return done(null, false, {
//           message: "Google account email not found.",
//         });
//       }

//       try {
//         // 🔍 Check if user already exists
//         const existingUser = await prisma.tbl_tent_users1.findFirst({
//           where: { user_email: email },
//           include: { tbl_tent_master1: true },
//         });

//         if (existingUser) {
//           return done(null, false, {
//             message: "User already exists. Please login instead.",
//           });
//         }

//         // 🔁 Transaction for tenant + user creation
//         const result = await prisma.$transaction(async (tx) => {
//           // 🔹 1. Create new tenant with default name
//           const tent_uuid = generateShortUUID();

//           // Generate a default tenant name from user's name or email
//           const defaultTentName = name
//             ? `${name}'s Account`
//             : email.split("@")[0] + "'s Account";

//           const newTenant = await tx.tbl_tent_master1.create({
//             data: {
//               tent_uuid,
//               tent_name: defaultTentName, // ✅ Required field
//               tent_email: email,
//               is_email_verified: true,
//               tent_status: true, // Assuming active by default
//             },
//           });

//           // 🔹 2. Create tenant owner user
//           const user_uuid = generateShortUUID();
//           const newUser = await tx.tbl_tent_users1.create({
//             data: {
//               tent_id: newTenant.tent_id,
//               user_uuid,
//               user_name: name,
//               user_email: email,
//               is_owner: true,
//               is_email_verified: true,
//             },
//           });

//           // 🔹 3. Initialize tenant setup (roles, menus, subscription, branches, etc.)
//           await createDefaultSetupForTenant(
//             tx,
//             newTenant.tent_id,
//             newUser.user_id
//           );

//           return { newTenant, newUser };
//         });

//         const { newTenant, newUser } = result;

//         const userData = {
//           user_uuid: newUser.user_uuid,
//           user_email: newUser.user_email,
//           user_name: newUser.user_name,
//           tent_uuid: newTenant.tent_uuid,
//         };

//         return done(null, userData);
//       } catch (error) {
//         console.error("Google signup error:", error);
//         return done(error, null);
//       }
//     }
//   )
// );

passport.use(
  "google-signup",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.SERVER_URL}/api/auth/google/signup/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName || "";
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";

        if (!email) {
          return done(null, false, {
            message: "Google account email not found.",
          });
        }

        // 1️⃣ Check if user already exists
        const existingUser = await prisma.tbl_tent_users1.findFirst({
          where: { user_email: email },
          include: {
            tbl_tent_master1: true, // Check if tenant exists
          },
        });

        if (existingUser) {
          // Existing user → check if tenant exists
          return done(null, {
            user_uuid: existingUser.user_uuid,
            user_email: existingUser.user_email,
            user_name: existingUser.user_name,
            tent_uuid: existingUser.tbl_tent_master1?.tent_uuid || null,
            isNewUser: false, // Flag to indicate existing user
          });
        }

        // 2️⃣ Create a new user WITHOUT tenant
        const user_uuid = generateShortUUID();

        const newUser = await prisma.tbl_tent_users1.create({
          data: {
            user_uuid,
            user_name: name,
            user_email: email,
            is_owner: false,
            is_email_verified: true, // Auto-verified via Google
            tent_id: null, // IMPORTANT: No tenant yet
          },
        });

        // 3️⃣ Send welcome email to new Google user
        try {
          await sendGoogleSignupEmail({
            user_name: newUser.user_name,
            user_email: newUser.user_email,
          });
        } catch (emailError) {
          console.error("⚠️ Failed to send Google signup email:", emailError);
          // Don't fail the signup if email fails
        }

        return done(null, {
          user_uuid: newUser.user_uuid,
          user_email: newUser.user_email,
          user_name: newUser.user_name,
          tent_uuid: null, // No tenant yet
          isNewUser: true, // Flag to indicate new user
        });
      } catch (error) {
        console.error("Google signup error:", error);
        return done(error, null);
      }
    }
  )
);

export default passport;
