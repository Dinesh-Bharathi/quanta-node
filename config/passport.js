// config/passport.js

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prismaClient.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import { createGlobalSession } from "../modules/auth/auth.service.js";
import { sendGoogleSignupEmail } from "../services/emails/emailService.js";

// ======================================================================
// GOOGLE LOGIN STRATEGY (Existing Users Only)
// ======================================================================
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
          return done(null, false, { message: "Google email not found." });
        }

        // Fetch all tenant accounts for this email
        const tenantAccounts = await prisma.tbl_tenant_users.findMany({
          where: { user_email: email },
          include: {
            tenant: {
              select: {
                tenant_uuid: true,
                tenant_name: true,
              },
            },
            userRoles: {
              include: {
                role: true,
                branch: {
                  select: {
                    branch_uuid: true,
                    branch_name: true,
                    is_hq: true,
                  },
                },
              },
            },
          },
        });

        if (tenantAccounts.length === 0) {
          return done(null, false, {
            message: "No tenant accounts found. Please sign up first.",
          });
        }

        // Build tenants array for step 2
        const tenants = tenantAccounts.map((acc) => ({
          tenant_user_uuid: acc.tenant_user_uuid,
          tenant_uuid: acc.tenant?.tenant_uuid || null,
          tenant_name: acc.tenant?.tenant_name || null,
          is_owner: acc.is_owner,
          is_email_verified: acc.is_email_verified,
          hasPassword: !!acc.password,
          passwordMatched: true, // Google login bypasses password
          roles: acc.userRoles.map((ur) => ur.role.role_name),
        }));

        // Create global login session (step 1 → step 2)
        const globalSession = await createGlobalSession({
          email,
          tenantUserUuids: tenants.map((t) => t.tenant_user_uuid),
        });

        return done(null, {
          tenants,
          matchedAny: true,
          global_session_uuid: globalSession.global_session_uuid,
        });
      } catch (err) {
        console.error("Google Login Error:", err);
        return done(err, null);
      }
    }
  )
);

// ======================================================================
// GOOGLE SIGNUP STRATEGY
// Creates a GLOBAL USER + TENTANT USER (tenant_id=null)
// ======================================================================
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

        if (!email) {
          return done(null, false, { message: "Google email not found." });
        }

        // Look for global user
        let globalUser = await prisma.tbl_global_users.findUnique({
          where: { email },
        });

        if (!globalUser) {
          globalUser = await prisma.tbl_global_users.create({
            data: {
              global_user_uuid: generateShortUUID(),
              email,
              name,
            },
          });
        }

        // Look for tenant user
        let tenantUser = await prisma.tbl_tenant_users.findFirst({
          where: { user_email: email },
        });

        const isNewUser = !tenantUser;

        if (!tenantUser) {
          tenantUser = await prisma.tbl_tenant_users.create({
            data: {
              tenant_user_uuid: generateShortUUID(),
              user_email: email,
              user_name: name,
              tenant_id: null,
              is_owner: false,
              is_email_verified: true,
              global_user_id: globalUser.global_user_id,
            },
          });

          sendGoogleSignupEmail({ user_name: name, user_email: email }).catch(
            (err) => console.error("Failed to send Google signup email:", err)
          );
        }

        // Create global temporary session
        const globalSession = await createGlobalSession({
          email,
          tenantUserUuids: [tenantUser.tenant_user_uuid],
        });

        return done(null, {
          tenant_user_uuid: tenantUser.tenant_user_uuid,
          isNewUser,
          global_session_uuid: globalSession.global_session_uuid,
        });
      } catch (err) {
        console.error("Google Signup Error:", err);
        return done(err, null);
      }
    }
  )
);

export default passport;
