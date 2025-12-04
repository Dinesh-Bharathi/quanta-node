// config/passport.js

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prismaClient.js";
import { generateShortUUID } from "../utils/generateUUID.js";
import { sendGoogleSignupEmail } from "../services/emails/emailService.js";
import { createGlobalSession } from "../modules/auth/service/login.service.js";

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
        const email = profile.emails?.[0]?.value?.toLowerCase();

        if (!email) {
          return done(null, false, { message: "GOOGLE_EMAIL_NOT_FOUND" });
        }

        // 1️⃣ Fetch tenant user accounts for this email
        const tenantAccounts = await prisma.tbl_tenant_users.findMany({
          where: { user_email: email },
          include: {
            tenant: { select: { tenant_uuid: true, tenant_name: true } },
            userRoles: { include: { role: true } },
            globalUser: true, // needed to fetch global_user_id
          },
        });

        // ❌ Case 1: No accounts exist → redirect to signup
        if (tenantAccounts.length === 0) {
          return done(null, {
            customRedirect: `${process.env.CLIENT_URL}/signup?src=google&error=no_account`,
          });
        }

        // 2️⃣ Extract global_user_id from the first tenant
        const global_user_id = tenantAccounts[0].global_user_id;
        if (!global_user_id) {
          // Should never happen but handle safe case
          return done(null, {
            customRedirect: `${process.env.CLIENT_URL}/login?src=google&error=no_global_user`,
          });
        }

        // 3️⃣ Build tenants list (skip password)
        const tenants = tenantAccounts.map((acc) => ({
          tenant_user_uuid: acc.tenant_user_uuid,
          tenant_uuid: acc.tenant?.tenant_uuid || null,
          tenant_name: acc.tenant?.tenant_name || null,
          is_owner: acc.is_owner,
          is_email_verified: acc.is_email_verified,
          hasPassword: !!acc.password,
          passwordMatched: true,
          roles: acc.userRoles.map((ur) => ur.role.role_name),
        }));

        // 4️⃣ Create global session with all tenant_user_uuids
        const globalSession = await createGlobalSession({
          email,
          tenantUserUuids: tenants.map((t) => t.tenant_user_uuid),
        });

        // 5️⃣ Return structured data for callback
        return done(null, {
          email,
          global_user_id,
          tenants,
          global_session_uuid: globalSession.global_session_uuid,
        });
      } catch (err) {
        console.error("❌ Google Login Error:", err);
        return done(null, false, { message: "INTERNAL_ERROR" });
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
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const name = profile.displayName || "";

        if (!email) {
          return done(null, {
            customRedirect: `${process.env.CLIENT_URL}/signup?src=google&error=no_email`,
          });
        }

        // 1️⃣ Get or create global user
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

        // 2️⃣ Check tenant_user existence
        const existingTenantUser = await prisma.tbl_tenant_users.findFirst({
          where: { user_email: email },
        });

        // ─────────────────────────────────────────────────────────────
        // CASE A: Already has a tenant → Block Google signup
        // ─────────────────────────────────────────────────────────────
        if (existingTenantUser?.tenant_id) {
          return done(null, {
            customRedirect: `${process.env.CLIENT_URL}/signup?src=google&error=already_exists`,
          });
        }

        // ─────────────────────────────────────────────────────────────
        // CASE B: tenant_user exists but no tenant → Onboarding
        // ─────────────────────────────────────────────────────────────
        if (existingTenantUser && !existingTenantUser.tenant_id) {
          const session = await createGlobalSession({
            email,
            tenantUserUuids: [existingTenantUser.tenant_user_uuid],
          });

          return done(null, {
            global_session_uuid: session.global_session_uuid,
            tenant_user_uuid: existingTenantUser.tenant_user_uuid,
            global_user_id: globalUser.global_user_id,
            customRedirect: `${process.env.CLIENT_URL}/signup/onboarding?tenant_user_uuid=${existingTenantUser.tenant_user_uuid}&src=google`,
          });
        }

        // ─────────────────────────────────────────────────────────────
        // CASE C: Brand new user → Create tenant_user
        // ─────────────────────────────────────────────────────────────
        const newTenantUser = await prisma.tbl_tenant_users.create({
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

        sendGoogleSignupEmail({
          user_name: newTenantUser.user_name,
          user_email: newTenantUser.user_email,
        }).catch((e) => {
          console.error("Welcome email send failed (non-blocking)", e);
        });

        const session = await createGlobalSession({
          email,
          tenantUserUuids: [newTenantUser.tenant_user_uuid],
        });

        return done(null, {
          global_session_uuid: session.global_session_uuid,
          tenant_user_uuid: newTenantUser.tenant_user_uuid,
          global_user_id: globalUser.global_user_id,
          customRedirect: `${process.env.CLIENT_URL}/signup/onboarding?tenant_user_uuid=${newTenantUser.tenant_user_uuid}&src=google&new=true`,
        });
      } catch (err) {
        console.error("Google Signup Error:", err);
        return done(null, {
          customRedirect: `${process.env.CLIENT_URL}/signup?src=google&error=google_failed`,
        });
      }
    }
  )
);

export default passport;
