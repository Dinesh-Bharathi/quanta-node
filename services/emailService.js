// import { loadTemplate, sendEmail } from "../utils/nodemailer.js";
import { loadTemplate, sendEmail } from "../utils/resendEmail.js";
import { generateToken } from "../utils/generateToken.js";

export async function sendMagicLinkEmail(user) {
  const token = generateToken({
    user_uuid: user.user_uuid,
    user_email: user.user_email,
  });

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
