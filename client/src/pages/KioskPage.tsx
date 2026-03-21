/**
 * KioskPage.tsx
 * IronCore GMS — Public Self Check-In Kiosk
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

  const mainTime = time.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const date = time.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div style={{ textAlign: "center" }}>
      {/* Time */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "6px",
          lineHeight: 1,
        }}
      >
        <span
          className="font-['Bebas_Neue'] text-[#FF6B1A]"
          style={{
            fontSize: "clamp(4.5rem, 9vw, 8rem)",
            letterSpacing: "0.04em",
          }}
        >
          {mainTime}
        </span>
        <span
          className="font-['Bebas_Neue'] text-[#FF6B1A]"
          style={{
            fontSize: "clamp(2rem, 4vw, 3.5rem)",
            opacity: 0.35,
            paddingBottom: "0.6rem",
            letterSpacing: "0.04em",
          }}
        >
          {seconds}
        </span>
      </div>
      {/* Date */}
      <div
        className="font-['Space_Mono'] text-white"
        style={{
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          opacity: 0.35,
          marginTop: "6px",
          textTransform: "uppercase",
        }}
      >
        {date}
      </div>
    </div>
  );
}

function Shimmer() {
  return (
    <div
      style={{
        background: "rgba(255,107,26,0.03)",
        border: "1px solid rgba(255,107,26,0.08)",
        borderRadius: "12px",
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          animation: "shimmer-bg 1.5s infinite",
          flexShrink: 0,
        }}
      />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div
          style={{
            height: 18,
            width: "40%",
            borderRadius: 4,
            background: "rgba(255,255,255,0.05)",
            animation: "shimmer-bg 1.5s infinite",
          }}
        />
        <div
          style={{
            height: 12,
            width: "25%",
            borderRadius: 4,
            background: "rgba(255,255,255,0.03)",
            animation: "shimmer-bg 1.5s 0.2s infinite",
          }}
        />
      </div>
    </div>
  );
}

function CountdownBar({ durationMs }: { durationMs: number }) {
  const [pct, setPct] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(
      () =>
        setPct(Math.max(0, 100 - ((Date.now() - start) / durationMs) * 100)),
      50,
    );
    return () => clearInterval(id);
  }, [durationMs]);
  return (
    <div
      style={{
        height: 2,
        background: "rgba(255,255,255,0.06)",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 10,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "#22c55e",
          transition: "width 50ms linear",
        }}
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
      style={{
        background: `${color}0d`,
        border: `1px solid ${color}35`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${color}18`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
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
      </div>
      <div style={{ flex: 1 }}>
        <p
          className="font-['Space_Mono']"
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.04em",
            color,
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>
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
  const statusColor = getStatusColor(member.status);

  return (
    <div
      style={{
        background: "rgba(255,107,26,0.04)",
        border: "1px solid rgba(255,107,26,0.18)",
        borderRadius: 12,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        position: "relative",
        overflow: "hidden",
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      {/* Left accent */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 16,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: "#FF6B1A",
        }}
      />

      {/* Avatar */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 10,
          flexShrink: 0,
          overflow: "hidden",
          background: "rgba(255,107,26,0.12)",
          border: "1px solid rgba(255,107,26,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 8,
        }}
      >
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            className="font-['Bebas_Neue'] text-[#FF6B1A]"
            style={{ fontSize: "1.8rem" }}
          >
            {getInitials(member.name)}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className="font-['Bebas_Neue'] text-[#f5f5f5]"
          style={{
            fontSize: "clamp(1.4rem, 2vw, 1.9rem)",
            letterSpacing: "0.06em",
            lineHeight: 1,
            marginBottom: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {member.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            className="font-['Space_Mono'] text-[#FF6B1A]"
            style={{ fontSize: "0.65rem", letterSpacing: "0.1em" }}
          >
            {member.gymId}
          </span>
          {member.plan && (
            <span
              className="font-['Space_Mono']"
              style={{ fontSize: "0.6rem", color: "#555" }}
            >
              {member.plan}
            </span>
          )}
          <span
            className="font-['Space_Mono']"
            style={{
              fontSize: "0.55rem",
              color: statusColor,
              border: `1px solid ${statusColor}50`,
              background: `${statusColor}12`,
              padding: "2px 8px",
              borderRadius: 20,
              letterSpacing: "0.1em",
            }}
          >
            {member.status.toUpperCase()}
          </span>
        </div>
        {member.expiresAt && (
          <div
            className="font-['Space_Mono']"
            style={{
              fontSize: "0.55rem",
              color: "#3a3a3a",
              letterSpacing: "0.08em",
              marginTop: 6,
            }}
          >
            EXPIRES {formatDate(member.expiresAt)}
          </div>
        )}
        {isBlocked && (
          <div
            className="font-['Space_Mono'] text-red-400"
            style={{
              fontSize: "0.58rem",
              letterSpacing: "0.07em",
              marginTop: 8,
            }}
          >
            {member.status === "expired"
              ? "MEMBERSHIP EXPIRED — SEE FRONT DESK"
              : "MEMBERSHIP INACTIVE — SEE FRONT DESK"}
          </div>
        )}
      </div>

      {/* Action button */}
      {!isBlocked && (
        <button
          onClick={onAction}
          disabled={isProcessing || isSuccess}
          className="font-['Bebas_Neue']"
          style={{
            flexShrink: 0,
            minWidth: 140,
            padding: "14px 24px",
            borderRadius: 10,
            fontSize: "1.1rem",
            letterSpacing: "0.12em",
            cursor: isProcessing || isSuccess ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            background: isSuccess
              ? "rgba(34,197,94,0.12)"
              : member.checkedIn
                ? "transparent"
                : "#FF6B1A",
            border: isSuccess
              ? "1px solid #22c55e50"
              : member.checkedIn
                ? "1px solid rgba(255,107,26,0.4)"
                : "none",
            color: isSuccess
              ? "#22c55e"
              : member.checkedIn
                ? "#FF6B1A"
                : "#111",
          }}
        >
          {isProcessing
            ? "PROCESSING..."
            : isSuccess
              ? "✓  DONE"
              : member.checkedIn
                ? "CHECK OUT"
                : "CHECK IN"}
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

  return (
    <div
      style={{
        background: `${passColor}08`,
        border: `1px solid ${passColor}25`,
        borderRadius: 12,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        position: "relative",
        overflow: "hidden",
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 16,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: passColor,
        }}
      />

      {/* Pass badge */}
      <div
        style={{
          width: 72,
          height: 72,
          flexShrink: 0,
          borderRadius: 10,
          marginLeft: 8,
          background: `${passColor}14`,
          border: `1px solid ${passColor}30`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span style={{ fontSize: "1.6rem" }}>🎫</span>
        <span
          className="font-['Space_Mono']"
          style={{
            fontSize: "0.45rem",
            color: passColor,
            letterSpacing: "0.1em",
          }}
        >
          {walkIn.passType.toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div
          className="font-['Bebas_Neue'] text-[#f5f5f5]"
          style={{
            fontSize: "clamp(1.4rem, 2vw, 1.9rem)",
            letterSpacing: "0.06em",
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          {walkIn.walkId}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span
            className="font-['Space_Mono']"
            style={{ fontSize: "0.6rem", color: "#555" }}
          >
            {walkIn.name}
          </span>
          <span
            className="font-['Space_Mono']"
            style={{
              fontSize: "0.55rem",
              padding: "2px 8px",
              borderRadius: 20,
              letterSpacing: "0.1em",
              color: walkIn.isCheckedOut ? "#444" : "#22c55e",
              border: `1px solid ${walkIn.isCheckedOut ? "#44444450" : "#22c55e50"}`,
              background: walkIn.isCheckedOut ? "#44444412" : "#22c55e12",
            }}
          >
            {walkIn.isCheckedOut ? "CHECKED OUT" : "INSIDE"}
          </span>
        </div>
        <div
          className="font-['Space_Mono']"
          style={{
            fontSize: "0.55rem",
            color: "#3a3a3a",
            letterSpacing: "0.08em",
            marginTop: 6,
          }}
        >
          CHECK-IN{" "}
          {new Date(walkIn.checkIn).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>

      {!isAlreadyOut && (
        <button
          onClick={onAction}
          disabled={isProcessing || isSuccess}
          className="font-['Bebas_Neue']"
          style={{
            flexShrink: 0,
            minWidth: 140,
            padding: "14px 24px",
            borderRadius: 10,
            fontSize: "1.1rem",
            letterSpacing: "0.12em",
            cursor: isProcessing || isSuccess ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            background: isSuccess ? "rgba(34,197,94,0.12)" : "transparent",
            border: isSuccess
              ? "1px solid #22c55e50"
              : `1px solid ${passColor}50`,
            color: isSuccess ? "#22c55e" : passColor,
          }}
        >
          {isProcessing ? "PROCESSING..." : isSuccess ? "✓  DONE" : "CHECK OUT"}
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
      <p
        className="font-['Space_Mono']"
        style={{
          fontSize: "0.55rem",
          color: "#555",
          letterSpacing: "0.15em",
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        MULTIPLE MEMBERS FOUND — TAP YOUR NAME · USE GYM-ID FOR EXACT MATCH
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((m) => (
          <button
            key={m.gymId}
            onClick={() => onSelect(m)}
            style={{
              background: "rgba(255,107,26,0.03)",
              border: "1px solid rgba(255,107,26,0.14)",
              borderRadius: 10,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,107,26,0.4)";
              e.currentTarget.style.background = "rgba(255,107,26,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,107,26,0.14)";
              e.currentTarget.style.background = "rgba(255,107,26,0.03)";
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                flexShrink: 0,
                background: "rgba(255,107,26,0.1)",
                border: "1px solid rgba(255,107,26,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className="font-['Bebas_Neue'] text-[#FF6B1A]"
                style={{ fontSize: "1rem" }}
              >
                {getInitials(m.name)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="font-['Bebas_Neue'] text-[#f0f0f0]"
                style={{
                  fontSize: "1.1rem",
                  letterSpacing: "0.06em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.name}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                <span
                  className="font-['Space_Mono'] text-[#FF6B1A]"
                  style={{ fontSize: "0.58rem" }}
                >
                  {m.gymId}
                </span>
                {m.plan && (
                  <span
                    className="font-['Space_Mono']"
                    style={{ fontSize: "0.58rem", color: "#444" }}
                  >
                    {m.plan}
                  </span>
                )}
                <span
                  className="font-['Space_Mono']"
                  style={{
                    fontSize: "0.55rem",
                    color: getStatusColor(m.status),
                  }}
                >
                  {m.status.toUpperCase()}
                </span>
              </div>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.2 }}
            >
              <path
                d="M6 3l5 5-5 5"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes shimmer-bg {
          0% { opacity: 0.4; } 50% { opacity: 0.1; } 100% { opacity: 0.4; }
        }
        .kiosk-input {
          flex: 1; background: transparent; border: none; outline: none;
          font-family: 'Space Mono', monospace; font-size: 1rem;
          color: #f0f0f0; letter-spacing: 0.04em; caret-color: #FF6B1A;
        }
        .kiosk-input::placeholder { color: #2c2c2c; }
        .kiosk-input-wrap {
          border: 1px solid rgba(255,107,26,0.2);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex; align-items: center; gap: 14px;
          background: rgba(255,107,26,0.02);
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .kiosk-input-wrap:focus-within {
          border-color: rgba(255,107,26,0.55);
          background: rgba(255,107,26,0.04);
          box-shadow: 0 0 0 4px rgba(255,107,26,0.07);
        }
        .search-btn {
          flex-shrink: 0; padding: 11px 26px;
          background: #FF6B1A; border: none; border-radius: 8px;
          color: #111; font-family: 'Bebas Neue', sans-serif;
          font-size: 1rem; letter-spacing: 0.12em; cursor: pointer;
          transition: opacity 0.2s, transform 0.1s;
        }
        .search-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        .search-btn:active:not(:disabled) { transform: translateY(0); }
        .search-btn:disabled { opacity: 0.25; cursor: not-allowed; }
        .kiosk-shimmer-text {
          background: linear-gradient(90deg, #FF6B1A, #FFB800, #FF6B1A);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 5s linear infinite;
        }
        .hint-tag {
          display: inline-flex; align-items: center; gap: 5px;
          border: 1px solid rgba(255,255,255,0.06); border-radius: 6px;
          padding: 4px 10px; font-family: 'Space Mono', monospace;
          font-size: 0.5rem; color: #333; letter-spacing: 0.08em;
          background: rgba(255,255,255,0.02);
        }
        .hint-tag span { color: #FF6B1A; opacity: 0.65; }

        /* ── Custom scrollbar for autosuggest dropdown ── */
        .kiosk-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .kiosk-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .kiosk-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 107, 26, 0.25);
          border-radius: 99px;
        }
        .kiosk-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 107, 26, 0.5);
        }
      `}</style>

      {/* ── Root ── */}
      <div
        style={{
          minHeight: "100vh",
          background: "#141414",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle top glow */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "50vw",
            height: "30vh",
            pointerEvents: "none",
            zIndex: 0,
            background:
              "radial-gradient(ellipse at top, rgba(255,107,26,0.06) 0%, transparent 70%)",
          }}
        />

        {/* Offline banner */}
        {offline && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 100,
              background: "rgba(239,68,68,0.1)",
              borderBottom: "1px solid rgba(239,68,68,0.2)",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#ef4444",
                animation: "pulse-dot 1s infinite",
              }}
            />
            <span
              className="font-['Space_Mono'] text-red-400"
              style={{ fontSize: "0.58rem", letterSpacing: "0.15em" }}
            >
              NO INTERNET CONNECTION — PLEASE SEE THE FRONT DESK
            </span>
          </div>
        )}

        {/* ── Centered main content ── */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: `${offline ? "72px" : "48px"} 24px 48px`,
          }}
        >
          <div style={{ width: "100%", maxWidth: 680 }}>
            {/* ── CLOCK — Hero ── */}
            {/* To adjust clock size, change fontSize in Clock component above */}
            <div style={{ marginBottom: "2.5rem" }}>
              <Clock />
            </div>

            {/* ── Gym name + status ── */}
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    background: "#FF6B1A",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="8" width="4" height="8" rx="2" fill="#111" />
                    <rect
                      x="6"
                      y="10"
                      width="12"
                      height="4"
                      rx="1"
                      fill="#111"
                    />
                    <rect
                      x="18"
                      y="8"
                      width="4"
                      height="8"
                      rx="2"
                      fill="#111"
                    />
                  </svg>
                </div>
                <span
                  className="font-['Bebas_Neue'] text-white"
                  style={{ fontSize: "1.6rem", letterSpacing: "0.2em" }}
                >
                  {gymName}
                </span>
              </div>

              {/* Terminal status */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: offline ? "#ef4444" : "#22c55e",
                    animation: "pulse-dot 2s ease-in-out infinite",
                  }}
                />
                <span
                  className="font-['Space_Mono']"
                  style={{
                    fontSize: "0.55rem",
                    letterSpacing: "0.2em",
                    color: offline ? "#ef4444" : "#22c55e",
                  }}
                >
                  {offline ? "NO CONNECTION" : "TERMINAL READY"}
                </span>
              </div>

              {/* Divider */}
              <div
                style={{
                  height: 1,
                  marginTop: "1.8rem",
                  marginBottom: "1.8rem",
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,107,26,0.15) 30%, rgba(255,107,26,0.15) 70%, transparent)",
                }}
              />

              {/* Title */}
              <div style={{ marginBottom: 6 }}>
                <span
                  className="font-['Bebas_Neue'] text-white"
                  style={{
                    fontSize: "clamp(1.6rem, 2.5vw, 2.4rem)",
                    letterSpacing: "0.08em",
                    opacity: 0.85,
                  }}
                >
                  MEMBER{" "}
                </span>
                <span
                  className="font-['Bebas_Neue'] kiosk-shimmer-text"
                  style={{
                    fontSize: "clamp(1.6rem, 2.5vw, 2.4rem)",
                    letterSpacing: "0.08em",
                  }}
                >
                  CHECK-IN
                </span>
              </div>
              <p
                className="font-['Space_Mono'] text-white"
                style={{
                  fontSize: "0.52rem",
                  letterSpacing: "0.12em",
                  opacity: 0.2,
                }}
              >
                ENTER YOUR NAME, GYM-ID, OR WALK-IN PASS ID BELOW
              </p>
            </div>

            {/* ── Search box ── */}
            {/* To adjust search box spacing, change marginBottom below */}
            <div style={{ position: "relative", marginBottom: "1rem" }}>
              <div className="kiosk-input-wrap">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 18 18"
                  fill="none"
                  style={{ flexShrink: 0, opacity: 0.22 }}
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
                  placeholder="Search by name, GYM-ID, or WALK-ID..."
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
                  {phase === "searching" ? "···" : "SEARCH"}
                </button>
              </div>

              {/* Auto-suggest dropdown */}
              {showSuggestions &&
                (suggestions.length > 0 || walkInSuggestions.length > 0) &&
                phase === "idle" && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      background: "#1e1e1e",
                      border: "1px solid rgba(255,107,26,0.25)",
                      borderRadius: 12,
                      zIndex: 50,
                      overflow: "hidden",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                      maxHeight: "320px",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Scrollable area */}
                    <div
                      style={{
                        overflowY: "auto",
                        flex: 1,
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(255,107,26,0.3) transparent",
                      }}
                      className="kiosk-scroll"
                    >
                      {suggestions.length > 0 && (
                        <>
                          {walkInSuggestions.length > 0 && (
                            <div
                              className="font-['Space_Mono']"
                              style={{
                                padding: "10px 16px 4px",
                                fontSize: "0.44rem",
                                color: "#444",
                                letterSpacing: "0.15em",
                              }}
                            >
                              MEMBERS
                            </div>
                          )}
                          {suggestions.map((m, i) => (
                            <button
                              key={m.gymId}
                              onClick={() => handleSuggestionSelect(m)}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "12px 16px",
                                background: "transparent",
                                border: "none",
                                borderBottom:
                                  i < suggestions.length - 1 ||
                                  walkInSuggestions.length > 0
                                    ? "1px solid rgba(255,255,255,0.04)"
                                    : "none",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 0.15s",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "rgba(255,107,26,0.07)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  flexShrink: 0,
                                  background: "rgba(255,107,26,0.1)",
                                  border: "1px solid rgba(255,107,26,0.18)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <span
                                  className="font-['Bebas_Neue'] text-[#FF6B1A]"
                                  style={{ fontSize: "0.9rem" }}
                                >
                                  {getInitials(m.name)}
                                </span>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  className="font-['Bebas_Neue'] text-[#f0f0f0]"
                                  style={{
                                    fontSize: "1rem",
                                    letterSpacing: "0.05em",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {m.name}
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    marginTop: 2,
                                  }}
                                >
                                  <span
                                    className="font-['Space_Mono'] text-[#FF6B1A]"
                                    style={{ fontSize: "0.5rem" }}
                                  >
                                    {m.gymId}
                                  </span>
                                  {m.plan && (
                                    <span
                                      className="font-['Space_Mono']"
                                      style={{
                                        fontSize: "0.5rem",
                                        color: "#444",
                                      }}
                                    >
                                      {m.plan}
                                    </span>
                                  )}
                                  <span
                                    className="font-['Space_Mono']"
                                    style={{
                                      fontSize: "0.48rem",
                                      color: getStatusColor(m.status),
                                    }}
                                  >
                                    {m.status.toUpperCase()}
                                  </span>
                                </div>
                              </div>
                              {m.checkedIn && (
                                <span
                                  className="font-['Space_Mono'] text-[#FF6B1A]"
                                  style={{ fontSize: "0.48rem", flexShrink: 0 }}
                                >
                                  ● INSIDE
                                </span>
                              )}
                            </button>
                          ))}
                        </>
                      )}
                      {walkInSuggestions.length > 0 && (
                        <>
                          {suggestions.length > 0 && (
                            <div
                              className="font-['Space_Mono']"
                              style={{
                                padding: "10px 16px 4px",
                                fontSize: "0.44rem",
                                color: "#444",
                                letterSpacing: "0.15em",
                              }}
                            >
                              WALK-INS TODAY
                            </div>
                          )}
                          {walkInSuggestions.map((w, i) => {
                            const passColor =
                              PASS_COLORS[w.passType] ?? "#FFB800";
                            return (
                              <button
                                key={w.walkId}
                                onClick={() => handleWalkInSuggestionSelect(w)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  padding: "12px 16px",
                                  background: "transparent",
                                  border: "none",
                                  borderBottom:
                                    i < walkInSuggestions.length - 1
                                      ? "1px solid rgba(255,255,255,0.04)"
                                      : "none",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = `${passColor}08`)
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background =
                                    "transparent")
                                }
                              >
                                <div
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    flexShrink: 0,
                                    background: `${passColor}12`,
                                    border: `1px solid ${passColor}28`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <span style={{ fontSize: "1rem" }}>🎫</span>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    className="font-['Bebas_Neue'] text-[#f0f0f0]"
                                    style={{
                                      fontSize: "1rem",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    {w.name}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      marginTop: 2,
                                    }}
                                  >
                                    <span
                                      className="font-['Space_Mono']"
                                      style={{
                                        fontSize: "0.5rem",
                                        color: passColor,
                                      }}
                                    >
                                      {w.walkId}
                                    </span>
                                    <span
                                      className="font-['Space_Mono']"
                                      style={{
                                        fontSize: "0.5rem",
                                        color: "#444",
                                      }}
                                    >
                                      {w.passType.toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                                {!w.isCheckedOut && (
                                  <span
                                    className="font-['Space_Mono'] text-green-400"
                                    style={{
                                      fontSize: "0.48rem",
                                      flexShrink: 0,
                                    }}
                                  >
                                    ● INSIDE
                                  </span>
                                )}
                                {w.isCheckedOut && (
                                  <span
                                    className="font-['Space_Mono']"
                                    style={{
                                      fontSize: "0.48rem",
                                      flexShrink: 0,
                                      color: "#444",
                                    }}
                                  >
                                    OUT
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                    {/* end scroll */}

                    {/* Fade indicator at bottom — shows more results are available */}
                    {suggestions.length + walkInSuggestions.length > 3 && (
                      <div
                        style={{
                          padding: "6px 16px 8px",
                          borderTop: "1px solid rgba(255,255,255,0.04)",
                          background: "#1e1e1e",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          className="font-['Space_Mono']"
                          style={{
                            fontSize: "0.42rem",
                            color: "#444",
                            letterSpacing: "0.12em",
                          }}
                        >
                          SCROLL FOR MORE RESULTS
                        </span>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path
                            d="M1 3l3 3 3-3"
                            stroke="#444"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* Hint tags */}
            {/* To adjust spacing below hints, change marginBottom */}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: "2rem",
              }}
            >
              {[
                ["GYM-XXXXX", "Member ID"],
                ["WALK-XXX", "Day Pass"],
                ["Full Name", "Name Search"],
              ].map(([code, label]) => (
                <div className="hint-tag" key={code}>
                  <span>{code}</span>
                  {label}
                </div>
              ))}
              <div className="hint-tag">
                <span style={{ color: "#2a2a2a" }}>ESC</span>Clear
              </div>
            </div>

            {/* Results */}
            {/* To adjust spacing between result cards, change gap */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
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
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            borderTop: "1px solid rgba(255,255,255,0.04)",
            padding: "14px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            className="font-['Space_Mono']"
            style={{
              fontSize: "0.46rem",
              color: "rgba(255,255,255,0.1)",
              letterSpacing: "0.12em",
            }}
          >
            {gymName} GMS · KIOSK TERMINAL v2.0
          </span>
          <span
            className="font-['Space_Mono']"
            style={{
              fontSize: "0.46rem",
              color: "rgba(255,255,255,0.1)",
              letterSpacing: "0.12em",
            }}
          >
            HAVING TROUBLE? SEE THE FRONT DESK
          </span>
        </div>
      </div>
    </>
  );
}
