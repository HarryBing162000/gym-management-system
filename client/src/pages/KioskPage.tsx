/**
 * KioskPage.tsx
 * IronCore GMS — Public Self Check-In Kiosk
 *
 * File location: client/src/pages/KioskPage.tsx
 *
 * Real API contracts (all require X-Kiosk-Token header):
 *   GET  /api/kiosk/search?q=           → { members: Member[] }
 *   POST /api/kiosk/member/checkin      → body: { gymId }
 *   POST /api/kiosk/member/checkout     → body: { gymId }
 *   GET  /api/kiosk/walkin/:walkId      → { walkIn: WalkIn }
 *   POST /api/kiosk/walkin/checkout     → body: { walkId }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useGymStore } from "../store/gymStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberStatus = "active" | "inactive" | "expired";
type PassType = "regular" | "student" | "couple";

interface Member {
  gymId: string;
  name: string;
  plan?: string;
  status: MemberStatus;
  expiresAt?: string;
  checkedIn: boolean;
  photoUrl?: string;
}

interface WalkIn {
  walkId: string;
  name: string;
  passType: PassType;
  checkIn: string;
  isCheckedOut: boolean;
  date: string;
}

type SearchResult =
  | { type: "member_list"; data: Member[] }
  | { type: "member"; data: Member }
  | { type: "walkin"; data: WalkIn }
  | null;

type KioskPhase =
  | "idle"
  | "searching"
  | "selecting"
  | "found"
  | "processing"
  | "success"
  | "error";

// ─── API Layer ────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    ?.VITE_API_URL ?? "http://localhost:5000";
const KIOSK_TOKEN =
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    ?.VITE_KIOSK_SECRET ?? "";
const FETCH_TIMEOUT_MS = 8000;

const kioskHeaders: HeadersInit = {
  "Content-Type": "application/json",
  "X-Kiosk-Token": KIOSK_TOKEN,
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError")
      throw new Error("TIMEOUT");
    throw err;
  } finally {
    clearTimeout(id);
  }
}

async function searchKiosk(query: string): Promise<SearchResult> {
  const trimmed = query.trim().toUpperCase();
  const res = await fetchWithTimeout(
    `${API_BASE}/api/kiosk/search?q=${encodeURIComponent(query.trim())}`,
    { headers: kioskHeaders },
  );
  if (!res.ok) return null;
  const body = await res.json();
  const members: Member[] = body.members ?? [];
  const walkIns: WalkIn[] = body.walkIns ?? [];

  if (!members.length && walkIns.length === 1)
    return { type: "walkin", data: walkIns[0] };

  if (/^WALK-\d+$/.test(trimmed) && walkIns.length) {
    const exact = walkIns.find((w) => w.walkId === trimmed);
    if (exact) return { type: "walkin", data: exact };
  }

  if (!members.length && !walkIns.length) return null;
  if (members.length === 1 && !walkIns.length)
    return { type: "member", data: members[0] };
  if (members.length > 1 || walkIns.length > 0)
    return { type: "member_list", data: members };
  return { type: "member", data: members[0] };
}

async function performMemberAction(
  gymId: string,
  action: "checkin" | "checkout",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/kiosk/member/${action}`,
      {
        method: "POST",
        headers: kioskHeaders,
        body: JSON.stringify({ gymId }),
      },
    );
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    return { ok: true };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === "TIMEOUT";
    return { ok: false, error: isTimeout ? "TIMEOUT" : "NETWORK_ERROR" };
  }
}

async function performWalkInAction(
  walkId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/kiosk/walkin/checkout`,
      {
        method: "POST",
        headers: kioskHeaders,
        body: JSON.stringify({ walkId }),
      },
    );
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    return { ok: true };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message === "TIMEOUT";
    return { ok: false, error: isTimeout ? "TIMEOUT" : "NETWORK_ERROR" };
  }
}

async function refetchMember(gymId: string): Promise<Member | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/kiosk/search?q=${encodeURIComponent(gymId)}`,
      { headers: kioskHeaders },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return body.members?.[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusColor(status: MemberStatus): string {
  return status === "active"
    ? "#22c55e"
    : status === "inactive"
      ? "#FFB800"
      : "#ef4444";
}

const PASS_COLORS: Record<PassType, string> = {
  regular: "#FF6B1A",
  student: "#60a5fa",
  couple: "#c084fc",
};

function resolveErrorMessage(error?: string): string {
  const map: Record<string, string> = {
    MEMBERSHIP_EXPIRED: "Membership expired — please see the front desk.",
    MEMBERSHIP_INACTIVE: "Membership inactive — please see the front desk.",
    ALREADY_CHECKED_IN: "Already checked in. See staff if this is an error.",
    NOT_CHECKED_IN: "Not currently checked in. See staff if this is an error.",
    ALREADY_CHECKED_OUT: "Already checked out. Have a great day!",
    TIMEOUT: "Request timed out — check your connection.",
    NETWORK_ERROR: "Connection error — please see the front desk.",
  };
  return error && map[error]
    ? map[error]
    : "Something went wrong. Please try again or see staff.";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div
        className="font-['Bebas_Neue'] text-[#FF6B1A] leading-none tracking-wide"
        style={{ fontSize: "clamp(1.8rem, 2.5vw, 2.8rem)" }}
      >
        {time.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })}
      </div>
      <div className="font-['Space_Mono'] text-[0.65rem] text-[#555] tracking-[0.15em] uppercase mt-1">
        {time.toLocaleDateString("en-PH", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </div>
    </div>
  );
}

function StandbyPulse({ offline }: { offline: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{
          background: offline ? "#ef4444" : "#22c55e",
          animation: "pulse-dot 2s ease-in-out infinite",
        }}
      />
      <span
        className="font-['Space_Mono'] text-[0.6rem] tracking-[0.2em]"
        style={{ color: offline ? "#ef4444" : "#22c55e" }}
      >
        {offline ? "NO CONNECTION" : "TERMINAL READY"}
      </span>
    </div>
  );
}

function Shimmer() {
  return (
    <div className="bg-[rgba(255,107,26,0.03)] border border-[rgba(255,107,26,0.08)] rounded p-7 flex items-center gap-6">
      <div
        className="w-20 h-20 rounded bg-white/5"
        style={{ animation: "shimmer-bg 1.5s infinite" }}
      />
      <div className="flex-1 flex flex-col gap-2.5">
        <div
          className="h-5 w-2/5 rounded bg-white/5"
          style={{ animation: "shimmer-bg 1.5s infinite" }}
        />
        <div
          className="h-3 w-1/4 rounded bg-white/[0.03]"
          style={{ animation: "shimmer-bg 1.5s 0.2s infinite" }}
        />
      </div>
    </div>
  );
}

function CountdownBar({ durationMs }: { durationMs: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setPct(Math.max(0, 100 - ((Date.now() - start) / durationMs) * 100));
    }, 50);
    return () => clearInterval(id);
  }, [durationMs]);
  return (
    <div className="h-0.5 bg-white/[0.06] rounded overflow-hidden mt-2.5">
      <div
        className="h-full bg-green-500 transition-[width] duration-[50ms] linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Banner({
  type,
  message,
  resetMs,
}: {
  type: "success" | "error";
  message: string;
  resetMs?: number;
}) {
  const color = type === "success" ? "#22c55e" : "#ef4444";
  return (
    <div
      className="rounded p-3.5 flex items-start gap-3"
      style={{
        background: `${color}0d`,
        border: `1px solid ${color}40`,
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        className="shrink-0 mt-0.5"
      >
        {type === "success" ? (
          <>
            <circle cx="9" cy="9" r="8" stroke={color} strokeWidth="1.5" />
            <path
              d="M5.5 9l2.5 2.5 4.5-4.5"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <circle cx="9" cy="9" r="8" stroke={color} strokeWidth="1.5" />
            <path
              d="M6 6l6 6M12 6l-6 6"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      <div className="flex-1">
        <span
          className="font-['Space_Mono'] text-[0.72rem] tracking-[0.08em]"
          style={{ color }}
        >
          {message}
        </span>
        {type === "success" && resetMs && <CountdownBar durationMs={resetMs} />}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  onAction,
  phase,
}: {
  member: Member;
  onAction: () => void;
  phase: KioskPhase;
}) {
  const isProcessing = phase === "processing";
  const isSuccess = phase === "success";
  const isBlocked = member.status === "expired" || member.status === "inactive";
  const actionLabel = member.checkedIn ? "CHECK OUT" : "CHECK IN";

  return (
    <div
      className="bg-[rgba(255,107,26,0.04)] border border-[rgba(255,107,26,0.22)] rounded p-7 flex items-center gap-7 relative overflow-hidden"
      style={{ animation: "fadeSlideIn 0.3s ease" }}
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-0.5 h-14 bg-[#FF6B1A]" />
      <div className="absolute top-0 left-0 w-14 h-0.5 bg-[#FF6B1A]" />

      {/* Avatar */}
      <div className="w-20 h-20 rounded shrink-0 overflow-hidden bg-[rgba(255,107,26,0.12)] border border-[rgba(255,107,26,0.28)] flex items-center justify-center">
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-['Bebas_Neue'] text-[1.8rem] text-[#FF6B1A]">
            {getInitials(member.name)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div
          className="font-['Bebas_Neue'] text-[#f5f5f5] tracking-[0.06em] leading-none mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: "clamp(1.4rem, 2vw, 1.9rem)" }}
        >
          {member.name}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-['Space_Mono'] text-[0.7rem] text-[#FF6B1A] tracking-[0.1em]">
            {member.gymId}
          </span>
          {member.plan && (
            <span className="font-['Space_Mono'] text-[0.65rem] text-[#555]">
              {member.plan}
            </span>
          )}
          <span
            className="font-['Space_Mono'] text-[0.6rem] border px-1.5 py-px rounded-sm tracking-[0.1em]"
            style={{
              color: getStatusColor(member.status),
              borderColor: getStatusColor(member.status),
            }}
          >
            {member.status.toUpperCase()}
          </span>
        </div>
        {member.expiresAt && (
          <div className="mt-1.5 font-['Space_Mono'] text-[0.6rem] text-[#3a3a3a] tracking-[0.08em]">
            EXPIRES {formatDate(member.expiresAt)}
          </div>
        )}
        {isBlocked && (
          <div className="mt-2 font-['Space_Mono'] text-[0.62rem] text-red-500 tracking-[0.07em]">
            {member.status === "expired"
              ? "MEMBERSHIP EXPIRED — PLEASE SEE THE FRONT DESK"
              : "MEMBERSHIP INACTIVE — PLEASE SEE THE FRONT DESK"}
          </div>
        )}
      </div>

      {/* Action */}
      {!isBlocked && (
        <button
          onClick={onAction}
          disabled={isProcessing || isSuccess}
          className="shrink-0 min-w-[130px] px-6 py-3.5 rounded-sm font-['Bebas_Neue'] text-[1.1rem] tracking-[0.12em] cursor-pointer transition-all duration-200 disabled:cursor-not-allowed"
          style={{
            background: isSuccess
              ? "rgba(34,197,94,0.1)"
              : member.checkedIn
                ? "transparent"
                : "#FF6B1A",
            border: isSuccess
              ? "1px solid #22c55e"
              : member.checkedIn
                ? "1px solid rgba(255,107,26,0.45)"
                : "none",
            color: isSuccess
              ? "#22c55e"
              : member.checkedIn
                ? "#FF6B1A"
                : "#1a1a1a",
          }}
        >
          {isProcessing ? "PROCESSING..." : isSuccess ? "✓  DONE" : actionLabel}
        </button>
      )}
    </div>
  );
}

function WalkInCard({
  walkIn,
  onAction,
  phase,
}: {
  walkIn: WalkIn;
  onAction: () => void;
  phase: KioskPhase;
}) {
  const isProcessing = phase === "processing";
  const isSuccess = phase === "success";
  const passColor = PASS_COLORS[walkIn.passType] ?? "#FFB800";
  const isAlreadyOut = walkIn.isCheckedOut;
  const actionLabel = isAlreadyOut
    ? "CHECKED OUT"
    : walkIn.checkIn
      ? "CHECK OUT"
      : "CHECK IN";

  return (
    <div
      className="rounded p-7 flex items-center gap-7 relative overflow-hidden"
      style={{
        background: `${passColor}08`,
        border: `1px solid ${passColor}28`,
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      <div
        className="absolute top-0 left-0 w-0.5 h-14"
        style={{ background: passColor }}
      />
      <div
        className="absolute top-0 left-0 w-14 h-0.5"
        style={{ background: passColor }}
      />

      {/* Pass badge */}
      <div
        className="w-20 h-20 shrink-0 rounded flex flex-col items-center justify-center gap-1"
        style={{
          background: `${passColor}14`,
          border: `1px solid ${passColor}38`,
        }}
      >
        <span className="text-[1.6rem]">🎫</span>
        <span
          className="font-['Space_Mono'] text-[0.52rem] tracking-[0.1em]"
          style={{ color: passColor }}
        >
          {walkIn.passType.toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1">
        <div
          className="font-['Bebas_Neue'] text-[#f5f5f5] tracking-[0.06em] leading-none mb-1.5"
          style={{ fontSize: "clamp(1.4rem, 2vw, 1.9rem)" }}
        >
          {walkIn.walkId}
        </div>
        <div className="flex gap-2.5 items-center flex-wrap">
          <span className="font-['Space_Mono'] text-[0.65rem] text-[#555]">
            {walkIn.name}
          </span>
          <span
            className="font-['Space_Mono'] text-[0.58rem] border px-1.5 py-px rounded-sm tracking-[0.1em]"
            style={{
              color: walkIn.isCheckedOut ? "#444" : "#22c55e",
              borderColor: walkIn.isCheckedOut ? "#333" : "#22c55e",
            }}
          >
            {walkIn.isCheckedOut ? "CHECKED OUT" : "INSIDE"}
          </span>
        </div>
        <div className="mt-1.5 font-['Space_Mono'] text-[0.58rem] text-[#3a3a3a] tracking-[0.08em]">
          CHECK-IN{" "}
          {new Date(walkIn.checkIn).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>

      {/* Action */}
      {!isAlreadyOut && (
        <button
          onClick={onAction}
          disabled={isProcessing || isSuccess}
          className="shrink-0 min-w-[130px] px-6 py-3.5 rounded-sm font-['Bebas_Neue'] text-[1.1rem] tracking-[0.12em] cursor-pointer transition-all duration-200 disabled:cursor-not-allowed"
          style={{
            background: isSuccess ? "rgba(34,197,94,0.1)" : "transparent",
            border: isSuccess
              ? "1px solid #22c55e"
              : `1px solid ${passColor}55`,
            color: isSuccess ? "#22c55e" : passColor,
          }}
        >
          {isProcessing ? "PROCESSING..." : isSuccess ? "✓  DONE" : actionLabel}
        </button>
      )}
    </div>
  );
}

function SelectionList({
  members,
  onSelect,
}: {
  members: Member[];
  onSelect: (member: Member) => void;
}) {
  return (
    <div style={{ animation: "fadeSlideIn 0.3s ease" }}>
      <div className="font-['Space_Mono'] text-[0.62rem] text-[#555] tracking-[0.15em] mb-3">
        MULTIPLE MEMBERS FOUND — TAP YOUR NAME · USE GYM-ID FOR EXACT MATCH
      </div>
      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <button
            key={m.gymId}
            onClick={() => onSelect(m)}
            className="bg-[rgba(255,107,26,0.03)] border border-[rgba(255,107,26,0.14)] rounded p-3.5 flex items-center gap-4 cursor-pointer text-left transition-all hover:border-[rgba(255,107,26,0.45)] hover:bg-[rgba(255,107,26,0.07)]"
          >
            <div className="w-10 h-10 rounded-sm shrink-0 bg-[rgba(255,107,26,0.1)] border border-[rgba(255,107,26,0.2)] flex items-center justify-center">
              <span className="font-['Bebas_Neue'] text-base text-[#FF6B1A]">
                {getInitials(m.name)}
              </span>
            </div>
            <div>
              <div className="font-['Bebas_Neue'] text-[1.1rem] text-[#f0f0f0] tracking-[0.06em]">
                {m.name}
              </div>
              <div className="flex gap-2.5 mt-0.5">
                <span className="font-['Space_Mono'] text-[0.6rem] text-[#FF6B1A]">
                  {m.gymId}
                </span>
                {m.plan && (
                  <span className="font-['Space_Mono'] text-[0.6rem] text-[#444]">
                    {m.plan}
                  </span>
                )}
                <span
                  className="font-['Space_Mono'] text-[0.6rem]"
                  style={{ color: getStatusColor(m.status) }}
                >
                  {m.status.toUpperCase()}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const RESET_DELAY_MS = 8000;

export default function KioskPage() {
  const { settings } = useGymStore();
  const gymName = settings?.gymName?.toUpperCase() || "IRONCORE";

  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<KioskPhase>("idle");
  const [result, setResult] = useState<SearchResult>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [walkInSuggestions, setWalkInSuggestions] = useState<WalkIn[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const resetKiosk = useCallback(() => {
    setQuery("");
    setResult(null);
    setPhase("idle");
    setStatusMessage("");
    setErrorMessage("");
    setSuggestions([]);
    setWalkInSuggestions([]);
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const shouldSkip = trimmed.length < 2 || phase !== "idle";
    const id = setTimeout(
      async () => {
        if (shouldSkip) {
          setSuggestions([]);
          setWalkInSuggestions([]);
          setShowSuggestions(false);
          return;
        }
        try {
          const res = await fetchWithTimeout(
            `${API_BASE}/api/kiosk/search?q=${encodeURIComponent(trimmed)}`,
            { headers: kioskHeaders },
          );
          if (!res.ok) {
            setSuggestions([]);
            setWalkInSuggestions([]);
            setShowSuggestions(false);
            return;
          }
          const body = await res.json();
          const members: Member[] = body.members ?? [];
          const walkIns: WalkIn[] = body.walkIns ?? [];
          setSuggestions(members.slice(0, 5));
          setWalkInSuggestions(walkIns.slice(0, 3));
          setShowSuggestions(members.length > 0 || walkIns.length > 0);
        } catch {
          setSuggestions([]);
          setWalkInSuggestions([]);
          setShowSuggestions(false);
        }
      },
      shouldSkip ? 0 : 300,
    );
    return () => clearTimeout(id);
  }, [query, phase]);

  const scheduleReset = useCallback(
    (delay = RESET_DELAY_MS) => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(resetKiosk, delay);
    },
    [resetKiosk],
  );

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phase === "found" || phase === "selecting") {
      const id = setTimeout(resetKiosk, 30000);
      return () => clearTimeout(id);
    }
  }, [phase, resetKiosk]);

  const playSuccessBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      o.start();
      o.stop(ctx.currentTime + 0.3);
    } catch {
      /* AudioContext not available */
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || phase === "searching") return;
    setPhase("searching");
    setResult(null);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const found = await searchKiosk(trimmed);
      if (!found) {
        setPhase("error");
        setErrorMessage(`No record found for "${trimmed}". Please try again.`);
        scheduleReset(4000);
        return;
      }
      if (found.type === "member_list") {
        setResult(found);
        setPhase("selecting");
        return;
      }
      setResult(found);
      setPhase("found");
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.message === "TIMEOUT";
      setPhase("error");
      setErrorMessage(
        resolveErrorMessage(isTimeout ? "TIMEOUT" : "NETWORK_ERROR"),
      );
      scheduleReset(4000);
    }
  }, [query, phase, scheduleReset]);

  const handleSelectMember = useCallback((member: Member) => {
    setResult({ type: "member", data: member });
    setPhase("found");
  }, []);

  const handleSuggestionSelect = useCallback((member: Member) => {
    setQuery(member.name);
    setSuggestions([]);
    setWalkInSuggestions([]);
    setShowSuggestions(false);
    setResult({ type: "member", data: member });
    setPhase("found");
  }, []);

  const handleWalkInSuggestionSelect = useCallback((walkIn: WalkIn) => {
    setQuery(walkIn.walkId);
    setSuggestions([]);
    setWalkInSuggestions([]);
    setShowSuggestions(false);
    setResult({ type: "walkin", data: walkIn });
    setPhase("found");
  }, []);

  const handleAction = useCallback(async () => {
    if (!result || phase === "processing") return;
    setPhase("processing");
    try {
      if (result.type === "member") {
        const m = result.data;
        const action = m.checkedIn ? "checkout" : "checkin";
        const { ok, error } = await performMemberAction(m.gymId, action);
        if (!ok) {
          setPhase("error");
          setErrorMessage(resolveErrorMessage(error));
          scheduleReset(4000);
          return;
        }
        const updated = await refetchMember(m.gymId);
        if (updated) setResult({ type: "member", data: updated });
        setStatusMessage(
          action === "checkin"
            ? `Welcome, ${m.name}! Have a great workout! 💪`
            : `See you next time, ${m.name}! 👋`,
        );
      } else if (result.type === "walkin") {
        const w = result.data;
        const { ok, error } = await performWalkInAction(w.walkId);
        if (!ok) {
          setPhase("error");
          setErrorMessage(resolveErrorMessage(error));
          scheduleReset(4000);
          return;
        }
        setResult({ type: "walkin", data: { ...w, isCheckedOut: true } });
        setStatusMessage(
          `Goodbye ${w.name}! Thanks for visiting ${settings?.gymName || "us"}! 💪`,
        );
      }
      setPhase("success");
      playSuccessBeep();
      scheduleReset(RESET_DELAY_MS);
    } catch {
      setPhase("error");
      setErrorMessage(resolveErrorMessage("NETWORK_ERROR"));
      scheduleReset(4000);
    }
  }, [result, phase, scheduleReset, playSuccessBeep, settings]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") {
      resetKiosk();
      setSuggestions([]);
      setWalkInSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const inputDisabled = ["searching", "processing", "success"].includes(phase);

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes shimmer-bg {
          0% { opacity: 0.4; } 50% { opacity: 0.12; } 100% { opacity: 0.4; }
        }
        .kiosk-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: 'Space Mono', monospace; font-size: 1.2rem;
          color: #f5f5f5; letter-spacing: 0.06em; caret-color: #FF6B1A;
        }
        .kiosk-input::placeholder { color: #2a2a2a; }
        .kiosk-input-wrap {
          border: 1px solid rgba(255,107,26,0.22); border-radius: 4px;
          padding: 16px 20px; display: flex; align-items: center; gap: 14px;
          background: rgba(255,107,26,0.02); transition: border-color 0.2s, background 0.2s;
        }
        .kiosk-input-wrap:focus-within {
          border-color: rgba(255,107,26,0.55); background: rgba(255,107,26,0.04);
        }
        .search-btn {
          flex-shrink: 0; padding: 9px 20px; background: #FF6B1A;
          border: none; border-radius: 3px; color: #1a1a1a;
          font-family: 'Bebas Neue', sans-serif; font-size: 1rem;
          letter-spacing: 0.12em; cursor: pointer; transition: opacity 0.2s;
        }
        .search-btn:hover:not(:disabled) { opacity: 0.85; }
        .search-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .hint-tag {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid rgba(255,255,255,0.05); border-radius: 2px;
          padding: 3px 9px; font-family: 'Space Mono', monospace;
          font-size: 0.57rem; color: #383838; letter-spacing: 0.1em;
        }
        .hint-tag span { color: #FF6B1A; opacity: 0.6; }
        .kiosk-shimmer-text {
          background: linear-gradient(90deg, #FF6B1A, #FFB800, #FF6B1A);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 5s linear infinite;
        }
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,107,26,0.13) 30%, rgba(255,107,26,0.13) 70%, transparent);
        }
      `}</style>

      <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center justify-center relative overflow-hidden">
        {/* Scanlines */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
          }}
        />

        {/* Ambient glow */}
        <div
          className="fixed pointer-events-none z-0"
          style={{
            top: "-25vh",
            left: "50%",
            transform: "translateX(-50%)",
            width: "55vw",
            height: "55vh",
            background:
              "radial-gradient(ellipse, rgba(255,107,26,0.05) 0%, transparent 70%)",
          }}
        />

        {/* Offline banner */}
        {offline && (
          <div className="fixed top-0 left-0 right-0 z-[100] bg-red-500/10 border-b border-red-500/25 py-2 px-6 flex items-center justify-center">
            <span className="font-['Space_Mono'] text-[0.62rem] text-red-400 tracking-[0.15em]">
              ⚠ NO INTERNET CONNECTION — PLEASE SEE THE FRONT DESK
            </span>
          </div>
        )}

        {/* Main content */}
        <div
          className="relative z-[1] w-full max-w-[1100px] mx-auto flex flex-col"
          style={{ padding: `${offline ? "58px" : "40px"} 48px 32px` }}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-7">
            {/* Left — Logo + Status */}
            <div className="flex flex-col gap-1.5">
              {/* Logo row */}
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-[#FF6B1A] rounded-sm flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect
                      x="2"
                      y="6"
                      width="5"
                      height="8"
                      rx="1"
                      fill="#1a1a1a"
                    />
                    <rect
                      x="9"
                      y="2"
                      width="5"
                      height="12"
                      rx="1"
                      fill="#1a1a1a"
                    />
                  </svg>
                </div>
                <span className="font-['Bebas_Neue'] text-[1.5rem] text-[#f0f0f0] tracking-[0.15em]">
                  {gymName}
                </span>
              </div>

              {/* Status row */}
              <StandbyPulse offline={offline} />
            </div>
            {/* Right — Clock */}
            <Clock />
          </div>

          {/* Hero text */}
          <div className="mb-3">
            <div
              className="font-['Bebas_Neue'] text-[#f5f5f5] leading-[0.95] tracking-[0.04em]"
              style={{ fontSize: "clamp(2.4rem, 3.5vw, 4rem)" }}
            >
              MEMBER
            </div>
            <div
              className="font-['Bebas_Neue'] leading-[0.95] tracking-[0.04em] kiosk-shimmer-text"
              style={{ fontSize: "clamp(2.4rem, 3.5vw, 4rem)" }}
            >
              CHECK-IN TERMINAL
            </div>
          </div>

          <p className="font-['Space_Mono'] text-[0.63rem] text-[#3e3e3e] tracking-[0.1em] mb-5">
            ENTER YOUR NAME, GYM-ID, OR WALK-IN PASS ID BELOW
          </p>

          <div className="divider mb-6" />

          {/* Search */}
          <div className="relative mb-3.5">
            <div className="kiosk-input-wrap">
              <svg
                width="17"
                height="17"
                viewBox="0 0 18 18"
                fill="none"
                className="shrink-0 opacity-30"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="5.5"
                  stroke="#FF6B1A"
                  strokeWidth="1.5"
                />
                <path
                  d="M12.5 12.5L16 16"
                  stroke="#FF6B1A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={inputRef}
                className="kiosk-input"
                type="text"
                placeholder="e.g.  Juan Dela Cruz  ·  GYM-1001  ·  WALK-001"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value.trim()) {
                    setSuggestions([]);
                    setWalkInSuggestions([]);
                    setShowSuggestions(false);
                  }
                }}
                onKeyDown={handleKeyDown}
                disabled={inputDisabled}
                autoComplete="new-password"
                spellCheck={false}
              />
              <button
                className="search-btn"
                onClick={handleSearch}
                disabled={inputDisabled || !query.trim()}
              >
                {phase === "searching" ? "..." : "SEARCH"}
              </button>
            </div>

            {/* Auto-suggest dropdown */}
            {showSuggestions &&
              (suggestions.length > 0 || walkInSuggestions.length > 0) &&
              phase === "idle" && (
                <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[#212121] border border-[rgba(255,107,26,0.3)] rounded z-50 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  {/* Member suggestions */}
                  {suggestions.length > 0 && (
                    <>
                      {walkInSuggestions.length > 0 && (
                        <div className="px-4 pt-1.5 pb-1 font-['Space_Mono'] text-[0.52rem] text-[#444] tracking-[0.12em]">
                          MEMBERS
                        </div>
                      )}
                      {suggestions.map((m, i) => (
                        <button
                          key={m.gymId}
                          onClick={() => handleSuggestionSelect(m)}
                          className="w-full flex items-center gap-3.5 px-4 py-3 bg-transparent border-none cursor-pointer text-left transition-colors hover:bg-[rgba(255,107,26,0.08)]"
                          style={{
                            borderBottom:
                              i < suggestions.length - 1 ||
                              walkInSuggestions.length > 0
                                ? "1px solid rgba(255,255,255,0.05)"
                                : "none",
                          }}
                        >
                          <div className="w-9 h-9 rounded-sm shrink-0 bg-[rgba(255,107,26,0.1)] border border-[rgba(255,107,26,0.2)] flex items-center justify-center">
                            <span className="font-['Bebas_Neue'] text-[0.95rem] text-[#FF6B1A]">
                              {getInitials(m.name)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-['Bebas_Neue'] text-base text-[#f0f0f0] tracking-[0.05em]">
                              {m.name}
                            </div>
                            <div className="flex gap-2.5 mt-0.5">
                              <span className="font-['Space_Mono'] text-[0.58rem] text-[#FF6B1A]">
                                {m.gymId}
                              </span>
                              {m.plan && (
                                <span className="font-['Space_Mono'] text-[0.58rem] text-[#444]">
                                  {m.plan}
                                </span>
                              )}
                              <span
                                className="font-['Space_Mono'] text-[0.55rem] border px-1 rounded-sm"
                                style={{
                                  color:
                                    m.status === "active"
                                      ? "#22c55e"
                                      : m.status === "expired"
                                        ? "#ef4444"
                                        : "#FFB800",
                                  borderColor:
                                    m.status === "active"
                                      ? "#22c55e44"
                                      : m.status === "expired"
                                        ? "#ef444444"
                                        : "#FFB80044",
                                }}
                              >
                                {m.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          {m.checkedIn && (
                            <span className="font-['Space_Mono'] text-[0.55rem] text-[#FF6B1A] shrink-0">
                              ● INSIDE
                            </span>
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  {/* Walk-in suggestions */}
                  {walkInSuggestions.length > 0 && (
                    <>
                      {suggestions.length > 0 && (
                        <div className="px-4 pt-1.5 pb-1 font-['Space_Mono'] text-[0.52rem] text-[#444] tracking-[0.12em]">
                          WALK-INS TODAY
                        </div>
                      )}
                      {walkInSuggestions.map((w, i) => {
                        const passColor = PASS_COLORS[w.passType] ?? "#FFB800";
                        return (
                          <button
                            key={w.walkId}
                            onClick={() => handleWalkInSuggestionSelect(w)}
                            className="w-full flex items-center gap-3.5 px-4 py-3 bg-transparent border-none cursor-pointer text-left transition-colors"
                            style={{
                              borderBottom:
                                i < walkInSuggestions.length - 1
                                  ? "1px solid rgba(255,255,255,0.05)"
                                  : "none",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = `${passColor}12`)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = "transparent")
                            }
                          >
                            <div
                              className="w-9 h-9 rounded-sm shrink-0 flex items-center justify-center"
                              style={{
                                background: `${passColor}14`,
                                border: `1px solid ${passColor}38`,
                              }}
                            >
                              <span className="text-base">🎫</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-['Bebas_Neue'] text-base text-[#f0f0f0] tracking-[0.05em]">
                                {w.name}
                              </div>
                              <div className="flex gap-2.5 mt-0.5">
                                <span
                                  className="font-['Space_Mono'] text-[0.58rem]"
                                  style={{ color: passColor }}
                                >
                                  {w.walkId}
                                </span>
                                <span className="font-['Space_Mono'] text-[0.58rem] text-[#444]">
                                  {w.passType.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            {!w.isCheckedOut && (
                              <span className="font-['Space_Mono'] text-[0.55rem] text-green-500 shrink-0">
                                ● INSIDE
                              </span>
                            )}
                            {w.isCheckedOut && (
                              <span className="font-['Space_Mono'] text-[0.55rem] text-[#444] shrink-0">
                                OUT
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
          </div>

          {/* Hints */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {[
              ["GYM-XXXXX", "Member ID"],
              ["WALK-XXX", "Day Pass"],
              ["Full Name", "Name search"],
            ].map(([code, label]) => (
              <div className="hint-tag" key={code}>
                <span>{code}</span>
                {label}
              </div>
            ))}
            <div className="hint-tag ml-auto">
              <span style={{ color: "#444" }}>ESC</span>CLEAR
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col gap-3">
            {phase === "searching" && <Shimmer />}

            {phase === "selecting" && result?.type === "member_list" && (
              <SelectionList
                members={result.data}
                onSelect={handleSelectMember}
              />
            )}

            {["found", "processing", "success"].includes(phase) &&
              result?.type === "member" && (
                <MemberCard
                  member={result.data}
                  onAction={handleAction}
                  phase={phase}
                />
              )}

            {["found", "processing", "success"].includes(phase) &&
              result?.type === "walkin" && (
                <WalkInCard
                  walkIn={result.data}
                  onAction={handleAction}
                  phase={phase}
                />
              )}

            {phase === "success" && statusMessage && (
              <Banner
                type="success"
                message={statusMessage}
                resetMs={RESET_DELAY_MS}
              />
            )}

            {phase === "error" && errorMessage && (
              <Banner type="error" message={errorMessage} />
            )}
          </div>

          <div className="flex-1" />

          {/* Footer */}
          <div className="divider mb-3.5" />
          <div className="flex justify-between">
            <span className="font-['Space_Mono'] text-[0.54rem] text-[#282828] tracking-[0.12em]">
              {gymName + " GMS · KIOSK TERMINAL v2.0"}
            </span>
            <span className="font-['Space_Mono'] text-[0.54rem] text-[#282828] tracking-[0.12em]">
              HAVING TROUBLE? SEE THE FRONT DESK
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
