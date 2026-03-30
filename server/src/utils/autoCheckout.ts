/**
 * autoCheckout.ts
 * GMS — Auto Walk-out Cron Job
 *
 * Runs daily at the gym's configured closing time (Asia/Manila).
 * Finds all walk-ins that are still checked in for today and
 * marks them as checked out with checkOut = closing time.
 *
 * Setup: call initAutoCheckoutCron() once in server.ts after DB connects.
 *
 * Cron schedule is rebuilt every time it runs so if the owner changes
 * the closing time in Settings, it takes effect the next day automatically.
 */

import cron from "node-cron";
import WalkIn from "../models/WalkIn";
import Settings from "../models/Settings";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTodayManila = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

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
}> => {
  const today = getTodayManila();

  // Get closing time from Settings
  const settings = await Settings.findOne({}).select("closingTime").lean();
  const closingTimeStr =
    (settings?.closingTime as string | undefined) ?? "22:00";
  const { hour, minute } = parseClosingTime(closingTimeStr);

  // Build closing time Date in Manila timezone
  // We create it as UTC then adjust — Manila is UTC+8
  const now = new Date();
  const manilaOffset = 8 * 60; // minutes
  const localOffset = now.getTimezoneOffset(); // minutes (negative for UTC+)
  const closingDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0,
    0,
  );
  // Shift from Manila time to UTC for storage
  closingDate.setMinutes(closingDate.getMinutes() - manilaOffset - localOffset);

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
      `[autoCheckout] ${today} — checked out ${checkedOut} walk-in(s) at closing time ${closingTimeStr} (Manila)`,
    );
  } else {
    console.log(
      `[autoCheckout] ${today} — no open walk-ins at closing time ${closingTimeStr}`,
    );
  }

  return { checkedOut, closingTime: closingTimeStr };
};

// ─── Cron job ─────────────────────────────────────────────────────────────────

let _cronTask: cron.ScheduledTask | null = null;

/**
 * Initialize the auto-checkout cron job.
 * Call once in server.ts after MongoDB connects.
 *
 * The cron re-reads Settings on every run, so closing time changes
 * made by the owner take effect automatically the next day.
 *
 * Schedule: reads closing time from DB at startup.
 * Default: 22:00 Manila time = cron "0 22 * * *"
 */
export const initAutoCheckoutCron = async (): Promise<void> => {
  // Read current closing time to set initial schedule
  const settings = await Settings.findOne({}).select("closingTime").lean();
  const closingTimeStr =
    (settings?.closingTime as string | undefined) ?? "22:00";
  const { hour, minute } = parseClosingTime(closingTimeStr);

  // Cron expression: "minute hour * * *" in Manila timezone
  const cronExpr = `${minute} ${hour} * * *`;

  console.log(
    `[autoCheckout] Cron initialized — runs at ${closingTimeStr} Manila time (${cronExpr})`,
  );

  // Stop existing task if server hot-reloads
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
      timezone: "Asia/Manila",
    },
  );
};
