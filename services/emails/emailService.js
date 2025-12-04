// import { loadTemplate, sendEmail } from "../utils/nodemailer.js";
import { loadTemplate, sendEmail } from "../../utils/resendEmail.js";
import { generateToken } from "../../utils/generateToken.js";

export async function sendMagicLinkEmail(user) {
  const token = generateToken(
    {
      tenant_user_uuid: user.tenant_user_uuid,
      user_email: user.user_email,
    },
    "15m"
  );

  const verifyUrl = `${process.env.SERVER_URL}/api/auth/verify-email/${token}`;
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();

  let html = await loadTemplate("signupVerification.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{verify_link}}/g, verifyUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: user.user_email,
    subject: "Welcome to Quanta – Verify your email",
    html,
  });

  console.log("📧 Magic verification email sent to:", user.user_email);
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(user, tenant) {
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();
  const dashboardUrl = `${clientUrl}/accesscheck`;

  let html = await loadTemplate("welcomeEmail.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{user_email}}/g, user.user_email)
    .replace(/{{tenant_name}}/g, tenant.tenant_name)
    .replace(/{{dashboard_url}}/g, dashboardUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: user.user_email,
    subject: "🎉 Welcome to Quanta – Your Account is Ready!",
    html,
  });

  console.log("✅ Welcome email sent to:", user.user_email);
}

/**
 * Send welcome email for Google OAuth signup (no verification needed)
 */
export async function sendGoogleSignupEmail(user) {
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();
  const dashboardUrl = `${clientUrl}/accesscheck`;

  let html = await loadTemplate("googleSignupEmail.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{user_email}}/g, user.user_email)
    .replace(/{{dashboard_url}}/g, dashboardUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: user.user_email,
    subject: "Welcome to Quanta – Account Created with Google",
    html,
  });

  console.log("✅ Google signup welcome email sent to:", user.user_email);
}

// Email helper: Send password reset email
export async function sendPasswordResetEmail(user, resetToken) {
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();
  const resetUrl = `${clientUrl}/reset-password?token=${resetToken}`;

  let html = await loadTemplate("passwordResetEmail.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{reset_url}}/g, resetUrl)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);

  await sendEmail({
    to: user.user_email,
    subject: "Password Reset Request – Quanta",
    html,
  });

  console.log("✅ Password reset email sent to:", user.user_email);
}

// Email helper: Send password reset success email
export async function sendPasswordResetSuccessEmail(user) {
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();
  const loginUrl = `${clientUrl}/login`;
  const resetTime = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  let html = await loadTemplate("passwordResetSuccessEmail.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{login_url}}/g, loginUrl)
    .replace(/{{reset_time}}/g, resetTime)
    .replace(/{{client_url}}/g, clientUrl)
    .replace(/{{current_year}}/g, currentYear);
  await sendEmail({
    to: user.user_email,
    subject: "Password Reset Successful – Quanta",
    html,
  });
  console.log("✅ Password reset success email sent to:", user.user_email);
}

export async function sendDeleteConfirmation({ to, subject, html }) {
  console.log("sendDeleteConfirmation", to, subject, html);
  await sendEmail({
    to,
    subject,
    html,
  });
}
