// import { loadTemplate, sendEmail } from "../utils/nodemailer.js";
import { loadTemplate, sendEmail } from "../utils/resendEmail.js";
import { generateToken } from "../utils/generateToken.js";

export async function sendMagicLinkEmail(user) {
  const token = generateToken(
    {
      user_uuid: user.user_uuid,
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

  // await sendEmail({
  //   from: `"Quanta Auth" <${process.env.SMTP_USER}>`,
  //   to: user.user_email,
  //   subject: "Welcome to Quanta – Verify your email",
  //   html,
  // });
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(user, tenant) {
  const clientUrl = process.env.CLIENT_URL;
  const currentYear = new Date().getFullYear();
  const dashboardUrl = `${clientUrl}/dashboard`;

  let html = await loadTemplate("welcomeEmail.html");

  html = html
    .replace(/{{user_name}}/g, user.user_name)
    .replace(/{{user_email}}/g, user.user_email)
    .replace(/{{tent_name}}/g, tenant.tent_name)
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
  const dashboardUrl = `${clientUrl}/dashboard`;

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
