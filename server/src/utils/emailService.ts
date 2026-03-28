/**
 * emailService.ts
 * GMS — Resend Email Service
 *
 * Wraps Resend SDK for two transactional emails:
 *   1. setPasswordEmail  — sent when Super Admin creates an owner account
 *   2. resetPasswordEmail — sent when owner requests forgot-password
 *
 * Sender: onboarding@resend.dev (Resend default — works without custom domain)
 * Replace with noreply@yourdomain.com once you add a custom domain.
 *
 * Usage:
 *   await sendSetPasswordEmail({ to: "owner@gym.com", gymName: "IronCore", token: "..." })
 *   await sendResetPasswordEmail({ to: "owner@gym.com", token: "..." })
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Sender ───────────────────────────────────────────────────────────────────
// Using Resend's shared domain for now.
// When you add a custom domain, change this to: noreply@yourdomain.com
const FROM = "GMS <onboarding@resend.dev>";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

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

  await resend.emails.send({
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
                Gym Management System
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
                Gym Management System · Sent by your system administrator
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

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your GMS password",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0;">
          <div style="max-width: 520px; margin: 40px auto; background: #1a1a1a; border-radius: 12px; overflow: hidden;">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #FF6B1A, #FFB800); padding: 32px 40px;">
              <h1 style="color: #000; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
                Gym Management System
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
                Gym Management System · If you didn't request this, no action is needed.
              </p>
            </div>

          </div>
        </body>
      </html>
    `,
  });
};
