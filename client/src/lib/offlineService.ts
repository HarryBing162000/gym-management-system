/**
 * offlineService.ts
 * GMS — Offline-Aware Action Wrappers
 *
 * Wraps write actions that must work offline:
 *   - Member check-in
 *   - Member check-out
 *   - Member renew (at-risk panel)
 *   - Walk-in register
 *   - Walk-in checkout
 *
 * Flow:
 *   1. Try the real API call (via existing service)
 *   2. If it fails due to network (not a 4xx error) → enqueue in IndexedDB
 *   3. Return result so caller behaves the same whether online or offline
 */

import { memberService } from "../services/memberService";
import { walkInService } from "../services/walkInService";
import { syncManager } from "./syncManager";
import { useAuthStore } from "../store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
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
    if (!isNetworkError(err)) throw err;

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

// ─── Member renew (at-risk panel) ─────────────────────────────────────────────
// Called from RenewModal in OwnerDashboard.
// memberService.renew() is just PATCH /members/:gymId — same as update.
// Queued with full renewal payload so sync fires the right update.

export interface RenewPayload {
  plan: string;
  expiresAt: string;
  paymentMethod: "cash" | "online";
  amountPaid: number;
  totalAmount?: number;
  status: string;
}

export const offlineRenew = async (
  gymId: string,
  memberName: string,
  payload: RenewPayload,
): Promise<{ success: boolean; queued: boolean; message: string }> => {
  try {
    const res = await memberService.renew(gymId, payload);
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err;

    await syncManager.enqueue({
      url: `/members/${gymId}`,
      method: "PATCH",
      body: payload as unknown as Record<string, unknown>,
      label: `Renew: ${memberName} (${gymId}) — ${payload.plan}`,
      token: getToken(),
    });

    return {
      success: true,
      queued: true,
      message: `${memberName.split(" ")[0]}'s renewal queued offline — will sync when internet restores.`,
    };
  }
};

// ─── Walk-in register ─────────────────────────────────────────────────────────

export interface WalkInRegisterPayload {
  name: string;
  phone?: string;
  passType: "regular" | "student" | "couple";
  amount?: number;
}

export interface OfflineDuplicateResult {
  isDuplicate: boolean;
  matchedLabel?: string;
}

export const checkWalkInDuplicate = async (
  name: string,
  phone?: string,
): Promise<OfflineDuplicateResult> => {
  const { offlineQueue } = await import("./offlineQueue");
  const pending = await offlineQueue.getPending();
  const today = new Date().toDateString();

  const duplicate = pending.find((entry) => {
    if (entry.url !== "/walkin/register") return false;
    if (new Date(entry.timestamp).toDateString() !== today) return false;

    const b = entry.body as { name?: string; phone?: string };
    const sameName = b.name?.toLowerCase().trim() === name.toLowerCase().trim();
    const samePhone =
      phone &&
      b.phone &&
      b.phone.replace(/\D/g, "") === phone.replace(/\D/g, "");

    return sameName || Boolean(samePhone);
  });

  if (duplicate) {
    const b = duplicate.body as { name?: string; passType?: string };
    return {
      isDuplicate: true,
      matchedLabel: `${b.name} (${b.passType}) — queued offline`,
    };
  }
  return { isDuplicate: false };
};

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
// date is passed through so the backend can find walk-ins from previous days
// (History tab checkout). Today's checkouts don't need it — backend falls back.

export const offlineWalkInCheckOut = async (
  walkId: string,
  name: string,
  date?: string,
): Promise<{ success: boolean; queued: boolean; message: string }> => {
  try {
    const res = await walkInService.checkOut(walkId, date);
    return { success: true, queued: false, message: res.message };
  } catch (err) {
    if (!isNetworkError(err)) throw err;

    await syncManager.enqueue({
      url: "/walkin/checkout",
      method: "PATCH",
      body: { walkId, date },
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
