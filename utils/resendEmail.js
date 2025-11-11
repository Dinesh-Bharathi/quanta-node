import { Resend } from "resend";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const resend = new Resend(process.env.RESEND_API_KEY);

// Fix __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadTemplate(templateName) {
  const filePath = path.join(__dirname, "..", "templates", templateName);
  return await readFile(filePath, "utf8");
}

export async function sendEmail({ to, subject, html }) {
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";

  const response = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (response.error) {
    console.error("Resend sending error:", response.error);
    throw new Error("Failed to send email");
  }

  return response;
}
