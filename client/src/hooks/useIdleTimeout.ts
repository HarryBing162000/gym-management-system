/**
 * useIdleTimeout.ts
 * GMS — Super Admin Idle Timeout Hook
 *
 * Watches mouse, keyboard, click, and scroll events.
 * If none fire within `idleMinutes`, the `onIdle` callback is called.
 * A warning fires `warningSeconds` before the timeout so the user
 * can extend their session.
 *
 * Usage:
 *   useIdleTimeout({ idleMinutes: 15, warningSeconds: 60, onIdle, onWarn, onReset })
 */

import { useEffect, useRef, useCallback } from "react";

interface UseIdleTimeoutOptions {
  idleMinutes: number; // total idle time before logout
  warningSeconds: number; // seconds before logout to show warning
  onIdle: () => void; // called when idle timeout fires
  onWarn: () => void; // called when warning window starts
  onReset: () => void; // called when activity detected during warning
}

export function useIdleTimeout({
  idleMinutes,
  warningSeconds,
  onIdle,
  onWarn,
  onReset,
}: UseIdleTimeoutOptions) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWarning = useRef(false);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
  }, []);

  const resetTimers = useCallback(() => {
    clearTimers();

    // If warning was showing and user is active — notify parent to hide it
    if (isWarning.current) {
      isWarning.current = false;
      onReset();
    }

    const totalMs = idleMinutes * 60 * 1000;
    const warnMs = totalMs - warningSeconds * 1000;

    // Warning fires first
    warnTimer.current = setTimeout(() => {
      isWarning.current = true;
      onWarn();

      // Then idle fires after the warning window
      idleTimer.current = setTimeout(() => {
        isWarning.current = false;
        onIdle();
      }, warningSeconds * 1000);
    }, warnMs);
  }, [idleMinutes, warningSeconds, onIdle, onWarn, onReset, clearTimers]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    const handleActivity = () => resetTimers();

    events.forEach((e) =>
      window.addEventListener(e, handleActivity, { passive: true }),
    );

    // Start the timer on mount
    resetTimers();

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, handleActivity));
    };
  }, [resetTimers, clearTimers]);
}
