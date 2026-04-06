/**
 * autoCheckout.ts
 * LakasGMS — Auto Walk-out Cron Job
 *
 * Multi-tenant version: runs a cron job for each gym at their configured
 * closing time. Each gym has its own Settings document with ownerId.
 *
 * Setup: call initAutoCheckoutCron() once in index.ts after DB connects.
 */

import cron, { ScheduledTask } from "node-cron";
import WalkIn from "../models/WalkIn";
import Settings from "../models/Settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getTodayInTz = (timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

const parseClosingTime = (time?: string): { hour: number; minute: number } => {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return { hour: 22, minute: 0 };
  const [h, m] = time.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return { hour: 22, minute: 0 };
  return { hour: h, minute: m };
};

// ─── Core checkout function ───────────────────────────────────────────────────
// Checks out all open walk-ins for a specific gym (by ownerId).
// Exported so it can also be called from the manual trigger route.

export const runAutoCheckout = async (
  ownerId?: string,
): Promise<{
  checkedOut: number;
  closingTime: string;
  timezone: string;
}> => {
  // If ownerId provided (manual trigger), only process that gym.
  // Otherwise process all gyms (cron trigger).
  const filter = ownerId ? { ownerId } : {};
  const allSettings = await Settings.find(filter)
    .select("ownerId closingTime timezone")
    .lean();

  if (allSettings.length === 0) {
    return { checkedOut: 0, closingTime: "22:00", timezone: "Asia/Manila" };
  }

  let totalCheckedOut = 0;
  let lastClosingTime = "22:00";
  let lastTimezone = "Asia/Manila";

  for (const settings of allSettings) {
    const closingTimeStr = (settings?.closingTime as string) ?? "22:00";
    const timezone = (settings?.timezone as string) ?? "Asia/Manila";
    const gymOwnerId = (settings as any).ownerId?.toString();

    const today = getTodayInTz(timezone);
    const now = new Date();

    const tzDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: timezone }),
    );
    const tzOffset = Math.round((now.getTime() - tzDate.getTime()) / 60000);
    const localOffset = now.getTimezoneOffset();

    const { hour, minute } = parseClosingTime(closingTimeStr);
    const closingDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0,
    );
    closingDate.setMinutes(closingDate.getMinutes() + localOffset + tzOffset);

    const walkInFilter: Record<string, unknown> = {
      date: today,
      isCheckedOut: false,
    };
    if (gymOwnerId) walkInFilter.ownerId = gymOwnerId;

    const result = await WalkIn.updateMany(walkInFilter, {
      $set: { isCheckedOut: true, checkOut: closingDate },
    });

    totalCheckedOut += result.modifiedCount;
    lastClosingTime = closingTimeStr;
    lastTimezone = timezone;

    if (result.modifiedCount > 0) {
      console.log(
        `[autoCheckout] Gym ${gymOwnerId} — checked out ${result.modifiedCount} walk-in(s) at ${closingTimeStr} (${timezone})`,
      );
    }
  }

  return {
    checkedOut: totalCheckedOut,
    closingTime: lastClosingTime,
    timezone: lastTimezone,
  };
};

// ─── Cron job ─────────────────────────────────────────────────────────────────
// One cron job runs every minute and checks if any gym's closing time matches.
// This avoids needing one cron per gym and handles dynamic settings changes.

let _cronTask: ScheduledTask | null = null;

export const initAutoCheckoutCron = async (): Promise<void> => {
  console.log(
    "[autoCheckout] Cron initialized — checks every minute for gym closing times",
  );

  if (_cronTask) _cronTask.stop();

  // Run every minute — check all gyms to see if any match current closing time
  _cronTask = cron.schedule("* * * * *", async () => {
    try {
      const allSettings = await Settings.find({})
        .select("ownerId closingTime timezone")
        .lean();

      for (const settings of allSettings) {
        const closingTimeStr = (settings?.closingTime as string) ?? "22:00";
        const timezone = (settings?.timezone as string) ?? "Asia/Manila";
        const gymOwnerId = (settings as any).ownerId?.toString();

        // Get current time in this gym's timezone
        const nowInTz = new Date().toLocaleTimeString("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        // If current time matches closing time, run checkout for this gym
        if (nowInTz === closingTimeStr) {
          const today = getTodayInTz(timezone);
          const result = await WalkIn.updateMany(
            { ownerId: gymOwnerId, date: today, isCheckedOut: false },
            { $set: { isCheckedOut: true, checkOut: new Date() } },
          );

          if (result.modifiedCount > 0) {
            console.log(
              `[autoCheckout] Gym ${gymOwnerId} — auto-checked out ${result.modifiedCount} walk-in(s) at ${closingTimeStr} (${timezone})`,
            );
          }
        }
      }
    } catch (err) {
      console.error("[autoCheckout] Cron error:", err);
    }
  });
};
