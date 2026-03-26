/**
 * offlineService.ts
 * GMS — Offline-Aware Action Wrappers
 *
 * Wraps the four write actions that must work offline:
 *   - Member check-in
 *   - Member check-out
 *   - Walk-in register
 *   - Walk-in checkout
 *
 * Flow:
 *   1. Try the real API call (via existing service)
 *   2. If it fails due to network (not a 4xx error) → enqueue in IndexedDB
 *   3. Update local UI state optimistically
 *   4. Return result so caller behaves the same whether online or offline
 *
 * The caller (StaffDashboard, WalkInDesk) doesn't need to know whether
 * the action was sent live or queued — it always gets a success response.
 */

import { memberService } from "../services/memberService";
import { walkInService } from "../services/walkInService";
import { syncManager } from "./syncManager";
import { useAuthStore } from "../store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  // Axios network errors have no response
  const e = err as { response?: unknown; code?: string };
  if (!e.response && !e.code) return true;
  if (e.code === "ERR_NETWORK" || e.code === "ECONNABORTED") return true;
  return false;
}

function getToken(): string {
  return useAuthStore.getState().token ?? "";
}

// ─── Member check-in ─────────────────────────────────────────────────────────

export const offlineCheckIn = async (
  gymId: string,
  memberName: string,
): Promise<{ success: boolean; queued: boolean; message: string }> => {
  try {
    const res = await memberService.checkIn(gymId);
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err; // real error (403 expired, 400 etc) — rethrow

    // Queue for later sync
    await syncManager.enqueue({
      url: `/members/${gymId}/checkin`,
      method: "PATCH",
      body: {},
      label: `Check-in: ${memberName} (${gymId})`,
      token: getToken(),
    });

    return {
      success: true,
      queued: true,
      message: `${memberName} checked in (offline — will sync when internet restores).`,
    };
  }
};

// ─── Member check-out ─────────────────────────────────────────────────────────

export const offlineCheckOut = async (
  gymId: string,
  memberName: string,
): Promise<{ success: boolean; queued: boolean; message: string }> => {
  try {
    const res = await memberService.checkOut(gymId);
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err;

    await syncManager.enqueue({
      url: `/members/${gymId}/checkout`,
      method: "PATCH",
      body: {},
      label: `Check-out: ${memberName} (${gymId})`,
      token: getToken(),
    });

    return {
      success: true,
      queued: true,
      message: `${memberName} checked out (offline — will sync when internet restores).`,
    };
  }
};

// ─── Walk-in register ─────────────────────────────────────────────────────────

export interface WalkInRegisterPayload {
  name: string;
  passType: "regular" | "student" | "couple";
  amount: number;
}

export const offlineWalkInRegister = async (
  payload: WalkInRegisterPayload,
): Promise<{
  success: boolean;
  queued: boolean;
  message: string;
  walkId?: string;
}> => {
  try {
    const res = await walkInService.register(payload);
    return {
      success: true,
      queued: false,
      message: res.message,
      walkId: res.walkIn?.walkId,
    };
  } catch (err) {
    if (!isNetworkError(err)) throw err;

    await syncManager.enqueue({
      url: "/walkin/register",
      method: "POST",
      body: payload as unknown as Record<string, unknown>,
      label: `Walk-in: ${payload.name} (${payload.passType})`,
      token: getToken(),
    });

    return {
      success: true,
      queued: true,
      message: `Walk-in registered for ${payload.name} (offline — will sync when internet restores).`,
    };
  }
};

// ─── Walk-in checkout ─────────────────────────────────────────────────────────

export const offlineWalkInCheckOut = async (
  walkId: string,
  name: string,
): Promise<{ success: boolean; queued: boolean; message: string }> => {
  try {
    const res = await walkInService.checkOut(walkId);
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err;

    await syncManager.enqueue({
      url: "/walkin/checkout",
      method: "POST",
      body: { walkId },
      label: `Walk-in checkout: ${name} (${walkId})`,
      token: getToken(),
    });

    return {
      success: true,
      queued: true,
      message: `${name} checked out (offline — will sync when internet restores).`,
    };
  }
};
