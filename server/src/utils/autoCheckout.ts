/**
 * autoCheckout.ts
 * GMS — Auto Walk-out Cron Job
 *
 * Runs daily at the gym's configured closing time.
 * Timezone is read from Settings.timezone (no more hardcoded Asia/Manila).
 *
 * Setup: call initAutoCheckoutCron() once in server.ts after DB connects.
 */

import cron, { ScheduledTask } from "node-cron";
import WalkIn from "../models/WalkIn";
import Settings from "../models/Settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getTodayInTz = (timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

/**
 * Parse "HH:mm" into { hour, minute } for cron schedule.
 * Falls back to 22:00 if format is invalid.
 */
const parseClosingTime = (time?: string): { hour: number; minute: number } => {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return { hour: 22, minute: 0 };
  }
  const [h, m] = time.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    return { hour: 22, minute: 0 };
  }
  return { hour: h, minute: m };
};

// ─── Core checkout function ───────────────────────────────────────────────────
// Exported so it can also be called from the manual trigger route.

export const runAutoCheckout = async (): Promise<{
  checkedOut: number;
  closingTime: string;
  timezone: string;
}> => {
  // Read both closingTime and timezone from Settings
  const settings = await Settings.findOne({})
    .select("closingTime timezone")
    .lean();

  const closingTimeStr =
    (settings?.closingTime as string | undefined) ?? "22:00";
  const timezone = (settings?.timezone as string | undefined) ?? "Asia/Manila";

  const today = getTodayInTz(timezone);
  const { hour, minute } = parseClosingTime(closingTimeStr);

  // Build closing time Date in the gym's timezone
  // We create it as local time then shift to UTC for storage.
  // For a robust approach, use Intl to get the UTC offset for the timezone.
  const now = new Date();

  // Get the UTC offset for the gym's timezone at this moment (in minutes)
  const tzOffset = (() => {
    const tzDate = new Date(
      new Date().toLocaleString("en-US", { timeZone: timezone }),
    );
    return Math.round((now.getTime() - tzDate.getTime()) / 60000);
  })();

  const localOffset = now.getTimezoneOffset(); // server's local offset
  const closingDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  // Shift: remove server local offset, add gym timezone offset to get UTC
  closingDate.setMinutes(closingDate.getMinutes() + localOffset + tzOffset);

  // Find all walk-ins still inside today
  const result = await WalkIn.updateMany(
    { date: today, isCheckedOut: false },
    {
      $set: {
        isCheckedOut: true,
        checkOut: closingDate,
      },
    },
  );

  const checkedOut = result.modifiedCount;

  if (checkedOut > 0) {
    console.log(
      `[autoCheckout] ${today} — checked out ${checkedOut} walk-in(s) at ${closingTimeStr} (${timezone})`,
    );
  } else {
    console.log(
      `[autoCheckout] ${today} — no open walk-ins at ${closingTimeStr} (${timezone})`,
    );
  }

  return { checkedOut, closingTime: closingTimeStr, timezone };
};

// ─── Cron job ─────────────────────────────────────────────────────────────────

let _cronTask: ScheduledTask | null = null;

/**
 * Initialize the auto-checkout cron job.
 * Call once in server.ts after MongoDB connects.
 *
 * Reads closingTime AND timezone from Settings so both can be changed
 * at runtime by the owner.
 */
export const initAutoCheckoutCron = async (): Promise<void> => {
  const settings = await Settings.findOne({})
    .select("closingTime timezone")
    .lean();

  const closingTimeStr =
    (settings?.closingTime as string | undefined) ?? "22:00";
  const timezone = (settings?.timezone as string | undefined) ?? "Asia/Manila";

  const { hour, minute } = parseClosingTime(closingTimeStr);
  const cronExpr = `${minute} ${hour} * * *`;

  console.log(
    `[autoCheckout] Cron initialized — runs at ${closingTimeStr} (${timezone}) (${cronExpr})`,
  );

  if (_cronTask) {
    _cronTask.stop();
  }

  _cronTask = cron.schedule(
    cronExpr,
    async () => {
      console.log("[autoCheckout] Cron triggered — running auto-checkout...");
      try {
        await runAutoCheckout();
      } catch (err) {
        console.error("[autoCheckout] Cron error:", err);
      }
    },
    {
      timezone, // ← was hardcoded "Asia/Manila", now dynamic
    },
  );
};
