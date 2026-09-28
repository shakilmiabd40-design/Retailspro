import "server-only";
import nodemailer from "nodemailer";

/**
 * Sends real email via Gmail SMTP, using a Gmail address + App Password (not the normal Gmail password —
 * the shop owner generates one at https://myaccount.google.com/apppasswords, which requires 2-Step
 * Verification to be turned on for that Google account).
 *
 * Configure with:
 *   GMAIL_USER=youraddress@gmail.com
 *   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16 characters, no spaces)
 */

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let transporterUser = "";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter || transporterUser !== user) {
    transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    transporterUser = user;
  }
  return transporter;
}

export const mailConfigured = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

export interface SendMailInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export type SendMailResult = { ok: true } | { ok: false; error: string };

/** Sends one email to one or more recipients. Never throws — always returns a result. */
export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<SendMailResult> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "Email isn't configured yet — set GMAIL_USER and GMAIL_APP_PASSWORD." };
  const recipients = [...new Set(to.map((e) => e.trim()).filter(Boolean))];
  if (!recipients.length) return { ok: false, error: "No recipient email address." };
  try {
    await t.sendMail({ from: `RetailPro <${process.env.GMAIL_USER}>`, to: recipients, subject, html, text });
    return { ok: true };
  } catch (err) {
    console.error("[mail] send failed", err);
    return { ok: false, error: (err as Error).message || "Send failed" };
  }
}
