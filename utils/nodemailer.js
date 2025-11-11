import nodemailer from "nodemailer";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // SSL port 465 = secure
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Optional: verify connection startup
transporter.verify((err) => {
  if (err) {
    console.error("SMTP Connection Error:", err);
  } else {
    console.log("SMTP Server ready to send mail");
  }
});

export default transporter;

transporter.verify((err) => {
  if (err) {
    console.error("Email server connection error:", err);
  } else {
    console.log("Email server is ready to send messages");
  }
});

/**
 * Load an HTML email template from /templates
 */
export async function loadTemplate(templateName) {
  const filePath = path.join(__dirname, "..", "templates", templateName);
  return await readFile(filePath, "utf8");
}

/**
 * Send email
 */
export async function sendEmail(mailOptions) {
  return await transporter.sendMail(mailOptions);
}
