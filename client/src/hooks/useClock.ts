/**
 * useClock.ts
 * GMS — Live Clock Hook
 *
 * Ticks every second and returns:
 *   - timeStr: current time in gym's timezone (e.g. "10:30 PM")
 *   - dateStr: current date (e.g. "Monday, April 1, 2026")
 *   - isClosingSoon: true when within 30 minutes of closingTime
 *   - closingLabel: formatted closing time (e.g. "10:00 PM")
 *
 * Reads timezone from gymStore — no hardcoded "Asia/Manila".
 * Used by OwnerLayout and StaffLayout topbars.
 */

import { useState, useEffect } from "react";
import { useGymStore } from "../store/gymStore";

interface ClockState {
  timeStr: string;
  dateStr: string;
  isClosingSoon: boolean;
  closingLabel: string;
}

export function useClock(): ClockState {
  const { getTimezone, settings } = useGymStore();
  const timezone = getTimezone();
  const closingTime = settings?.closingTime ?? "22:00";

  const getState = (): ClockState => {
    const now = new Date();

    const timeStr = now.toLocaleTimeString("en-PH", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const dateStr = now.toLocaleDateString("en-PH", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Parse closing time and check if within 30 minutes
    const [closingH, closingM] = closingTime.split(":").map(Number);
    const nowInTz = new Date(
      now.toLocaleString("en-US", { timeZone: timezone }),
    );
    const closingToday = new Date(nowInTz);
    closingToday.setHours(closingH, closingM, 0, 0);
    const diffMins = (closingToday.getTime() - nowInTz.getTime()) / 60000;
    const isClosingSoon = diffMins > 0 && diffMins <= 30;

    // Format closing label e.g. "10:00 PM"
    const suffix = closingH >= 12 ? "PM" : "AM";
    const displayH = closingH % 12 === 0 ? 12 : closingH % 12;
    const closingLabel = `${displayH}:${String(closingM).padStart(2, "0")} ${suffix}`;

    return { timeStr, dateStr, isClosingSoon, closingLabel };
  };

  const [state, setState] = useState<ClockState>(getState);

  useEffect(() => {
    const id = setInterval(() => setState(getState()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, closingTime]);

  return state;
}
