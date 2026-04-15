/**
 * emailService.ts
 * LakasGMS — Nodemailer + Gmail SMTP Email Service
 *
 * Replaces Resend SDK — Gmail allows sending to ANY email address.
 * Resend free tier was restricted to verified emails only.
 *
 * Sender: lakasgmsm@gmail.com (Gmail App Password auth)
 *
 * When you get a custom domain later:
 *   1. Add domain to Resend
 *   2. Swap back to Resend SDK
 *   3. Change FROM to noreply@yourdomain.com
 *
 * Env vars required (add to Render):
 *   GMAIL_USER=lakasgmsm@gmail.com
 *   GMAIL_APP_PASSWORD=mmclnkjflpbvhkgs
 *
 * Function signatures are identical to the old Resend version —
 * no other files need to change.
 */

import nodemailer from "nodemailer";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ─── Transporter ──────────────────────────────────────────────────────────────
// FIX: added connection timeouts + pool so Render doesn't hang on slow SMTP.
// - connectionTimeout: fail fast if Gmail SMTP doesn't respond in 5s
// - greetingTimeout: max time to wait for SMTP greeting
// - socketTimeout: max time for any single SMTP operation
// - pool: reuse connections instead of creating a new one per email (faster)
const transporter = nodemailer.createTransport({
  // FIX: use Gmail's IPv4 address directly instead of hostname.
  // Render blocks outbound IPv6 — DNS was resolving smtp.gmail.com to an
  // IPv6 address (2404:6800:...) causing ENETUNREACH.
  // 74.125.130.108 is Gmail SMTP IPv4 — bypasses IPv6 DNS resolution entirely.
  host: "74.125.130.108",
  port: 465,
  secure: true, // STARTTLS
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
    // servername required when using IP directly instead of hostname
    servername: "smtp.gmail.com",
  },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
  pool: true,
  maxConnections: 3,
} as nodemailer.TransportOptions);

// Verify transporter on startup so we know immediately if credentials are wrong
transporter.verify((err) => {
  if (err) {
    console.error("[emailService] SMTP connection failed:", err.message);
  } else {
    console.log("[emailService] Gmail SMTP ready ✅");
  }
});

const FROM = `LakasGMS <${process.env.GMAIL_USER}>`;

// ─── Set Password Email ───────────────────────────────────────────────────────
// Sent by Super Admin when creating a new owner account.
// Owner has no password yet — this email is their invitation.

export const sendSetPasswordEmail = async ({
  to,
  ownerName,
  gymName,
  token,
}: {
  to: string;
  ownerName: string;
  gymName: string;
  token: string;
}): Promise<void> => {
  const link = `${CLIENT_URL}/set-password?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: `You've been invited to manage ${gymName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
          <div style="max-width: 520px; margin: 40px auto; background: #1a1a1a; border-radius: 12px; overflow: hidden;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FF6B1A, #FFB800); padding: 32px 40px;">
              <h1 style="color: #000; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
                LakasGMS
              </h1>
              <p style="color: rgba(0,0,0,0.6); margin: 4px 0 0; font-size: 13px;">
                You have been invited as a gym owner
              </p>
            </div>

            <!-- Body -->
            <div style="padding: 36px 40px;">
              <p style="color: #fff; font-size: 15px; margin: 0 0 8px;">
                Hi <strong>${ownerName}</strong>,
              </p>
              <p style="color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0 0 28px;">
                Your owner account for <strong style="color: #FFB800;">${gymName}</strong> has been created.
                Click the button below to set your password and access your dashboard.
              </p>

              <!-- CTA Button -->
              <a href="${link}"
                style="display: inline-block; background: #FFB800; color: #000; font-weight: 700;
                       font-size: 14px; text-decoration: none; padding: 14px 32px;
                       border-radius: 8px; letter-spacing: 0.3px;">
                Set My Password →
              </a>

              <!-- Expiry notice -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin: 24px 0 0; line-height: 1.5;">
                This link expires in <strong style="color: rgba(255,255,255,0.5);">24 hours</strong>.
                If you did not expect this email, you can safely ignore it.
              </p>

              <!-- Fallback link -->
              <p style="color: rgba(255,255,255,0.2); font-size: 11px; margin: 16px 0 0; word-break: break-all;">
                Or copy this link: ${link}
              </p>
            </div>

            <!-- Footer -->
            <div style="padding: 20px 40px; border-top: 1px solid rgba(255,255,255,0.07);">
              <p style="color: rgba(255,255,255,0.2); font-size: 11px; margin: 0;">
                LakasGMS · Sent by your system administrator
              </p>
            </div>

          </div>
        </body>
      </html>
    `,
  });
};

// ─── Reset Password Email ─────────────────────────────────────────────────────
// Sent when owner clicks "Forgot password" on the login page.
// Token expires in 1 hour.

export const sendResetPasswordEmail = async ({
  to,
  ownerName,
  token,
}: {
  to: string;
  ownerName: string;
  token: string;
}): Promise<void> => {
  const link = `${CLIENT_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Reset your LakasGMS password",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
          <div style="max-width: 520px; margin: 40px auto; background: #1a1a1a; border-radius: 12px; overflow: hidden;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FF6B1A, #FFB800); padding: 32px 40px;">
              <h1 style="color: #000; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
                LakasGMS
              </h1>
              <p style="color: rgba(0,0,0,0.6); margin: 4px 0 0; font-size: 13px;">
                Password reset request
              </p>
            </div>

            <!-- Body -->
            <div style="padding: 36px 40px;">
              <p style="color: #fff; font-size: 15px; margin: 0 0 8px;">
                Hi <strong>${ownerName}</strong>,
              </p>
              <p style="color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.6; margin: 0 0 28px;">
                We received a request to reset your password. Click the button below
                to choose a new password. If you didn't request this, you can safely ignore this email.
              </p>

              <!-- CTA Button -->
              <a href="${link}"
                style="display: inline-block; background: #FF6B1A; color: #fff; font-weight: 700;
                       font-size: 14px; text-decoration: none; padding: 14px 32px;
                       border-radius: 8px; letter-spacing: 0.3px;">
                Reset My Password →
              </a>

              <!-- Expiry notice -->
              <p style="color: rgba(255,255,255,0.3); font-size: 12px; margin: 24px 0 0; line-height: 1.5;">
                This link expires in <strong style="color: rgba(255,255,255,0.5);">1 hour</strong>.
              </p>

              <!-- Fallback link -->
              <p style="color: rgba(255,255,255,0.2); font-size: 11px; margin: 16px 0 0; word-break: break-all;">
                Or copy this link: ${link}
              </p>
            </div>

            <!-- Footer -->
            <div style="padding: 20px 40px; border-top: 1px solid rgba(255,255,255,0.07);">
              <p style="color: rgba(255,255,255,0.2); font-size: 11px; margin: 0;">
                LakasGMS · If you didn't request this, no action is needed.
              </p>
            </div>

          </div>
        </body>
      </html>
    `,
  });
};
