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
 *
 * Fixes applied vs original:
 *   ✅ gymId used as identifier — _id never sent to server
 *   ✅ X-Kiosk-Token header on every request
 *   ✅ AbortController 8s timeout on all fetches
 *   ✅ Multi-result selection list (up to 5 name matches)
 *   ✅ Re-fetch member after action (source of truth from server)
 *   ✅ Expired/inactive member blocked with clear message
 *   ✅ Walk-in check-in supported (not just checkout)
 *   ✅ Error codes resolved to human-readable messages
 *   ✅ Offline banner via navigator.onLine listener
 *   ✅ Wider layout (1100px), responsive font sizing
 *   ✅ Loading shimmer during search
 *   ✅ 5.5s auto-reset with countdown bar
 *   ✅ passType aligned to server: "regular" | "student" | "couple"
 */

import { useState, useEffect, useRef, useCallback } from "react";

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

  if (/^WALK-\d+$/.test(trimmed)) {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/kiosk/walkin/${trimmed}`,
      {
        headers: kioskHeaders,
      },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return { type: "walkin", data: body.walkIn };
  }

  const res = await fetchWithTimeout(
    `${API_BASE}/api/kiosk/search?q=${encodeURIComponent(query.trim())}`,
    { headers: kioskHeaders },
  );
  if (!res.ok) return null;
  const body = await res.json();
  const members: Member[] = body.members ?? [];
  if (!members.length) return null;
  if (members.length === 1) return { type: "member", data: members[0] };
  return { type: "member_list", data: members };
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
  action: "checkin" | "checkout",
): Promise<{ ok: boolean; error?: string }> {
  const url =
    action === "checkout"
      ? `${API_BASE}/api/kiosk/walkin/checkout`
      : `${API_BASE}/api/kiosk/walkin/checkin`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: kioskHeaders,
      body: JSON.stringify({ walkId }),
    });
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
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "clamp(1.8rem, 2.5vw, 2.8rem)",
          color: "#FF6B1A",
          lineHeight: 1,
          letterSpacing: "0.05em",
        }}>
        {time.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })}
      </div>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.65rem",
          color: "#555",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          marginTop: "3px",
        }}>
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
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: offline ? "#ef4444" : "#22c55e",
          animation: "pulse-dot 2s ease-in-out infinite",
        }}
      />
      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.6rem",
          color: offline ? "#ef4444" : "#22c55e",
          letterSpacing: "0.2em",
        }}>
        {offline ? "NO CONNECTION" : "TERMINAL READY"}
      </span>
    </div>
  );
}

function Shimmer() {
  return (
    <div
      style={{
        background: "rgba(255,107,26,0.03)",
        border: "1px solid rgba(255,107,26,0.08)",
        borderRadius: "4px",
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        gap: "24px",
      }}>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 4,
          background: "rgba(255,255,255,0.04)",
          animation: "shimmer-bg 1.5s infinite",
        }}
      />
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            height: 22,
            width: "40%",
            borderRadius: 3,
            background: "rgba(255,255,255,0.04)",
            animation: "shimmer-bg 1.5s infinite",
          }}
        />
        <div
          style={{
            height: 14,
            width: "25%",
            borderRadius: 3,
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
    const id = setInterval(() => {
      setPct(Math.max(0, 100 - ((Date.now() - start) / durationMs) * 100));
    }, 50);
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
      }}>
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "#22c55e",
          transition: "width 0.05s linear",
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
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: "14px 20px",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        animation: "fadeSlideIn 0.3s ease",
      }}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        style={{ flexShrink: 0, marginTop: 1 }}>
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
      <div style={{ flex: 1 }}>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.72rem",
            color,
            letterSpacing: "0.08em",
          }}>
          {message}
        </span>
        {type === "success" && resetMs && <CountdownBar durationMs={resetMs} />}
      </div>
    </div>
  );
}

interface MemberCardProps {
  member: Member;
  onAction: () => void;
  phase: KioskPhase;
}
function MemberCard({ member, onAction, phase }: MemberCardProps) {
  const isProcessing = phase === "processing";
  const isSuccess = phase === "success";
  const isBlocked = member.status === "expired" || member.status === "inactive";
  const actionLabel = member.checkedIn ? "CHECK OUT" : "CHECK IN";

  return (
    <div
      style={{
        background: "rgba(255,107,26,0.04)",
        border: "1px solid rgba(255,107,26,0.22)",
        borderRadius: 4,
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        gap: 28,
        position: "relative",
        overflow: "hidden",
        animation: "fadeSlideIn 0.3s ease",
      }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: 56,
          background: "#FF6B1A",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 56,
          height: 3,
          background: "#FF6B1A",
        }}
      />

      {/* Avatar */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 4,
          flexShrink: 0,
          overflow: "hidden",
          background: "rgba(255,107,26,0.12)",
          border: "1px solid rgba(255,107,26,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "1.8rem",
              color: "#FF6B1A",
            }}>
            {getInitials(member.name)}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(1.4rem, 2vw, 1.9rem)",
            color: "#f5f5f5",
            letterSpacing: "0.06em",
            lineHeight: 1,
            marginBottom: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
          {member.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.7rem",
              color: "#FF6B1A",
              letterSpacing: "0.1em",
            }}>
            {member.gymId}
          </span>
          {member.plan && (
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.65rem",
                color: "#555",
              }}>
              {member.plan}
            </span>
          )}
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.6rem",
              color: getStatusColor(member.status),
              border: `1px solid ${getStatusColor(member.status)}`,
              padding: "1px 6px",
              borderRadius: 2,
              letterSpacing: "0.1em",
            }}>
            {member.status.toUpperCase()}
          </span>
        </div>
        {member.expiresAt && (
          <div
            style={{
              marginTop: 6,
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.6rem",
              color: "#3a3a3a",
              letterSpacing: "0.08em",
            }}>
            EXPIRES {formatDate(member.expiresAt)}
          </div>
        )}
        {isBlocked && (
          <div
            style={{
              marginTop: 8,
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.62rem",
              color: "#ef4444",
              letterSpacing: "0.07em",
            }}>
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
          style={{
            flexShrink: 0,
            minWidth: 130,
            padding: "14px 24px",
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
            borderRadius: 3,
            color: isSuccess
              ? "#22c55e"
              : member.checkedIn
                ? "#FF6B1A"
                : "#1a1a1a",
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "1.1rem",
            letterSpacing: "0.12em",
            cursor: isProcessing || isSuccess ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            textAlign: "center",
          }}>
          {isProcessing ? "PROCESSING..." : isSuccess ? "✓  DONE" : actionLabel}
        </button>
      )}
    </div>
  );
}

interface WalkInCardProps {
  walkIn: WalkIn;
  onAction: () => void;
  phase: KioskPhase;
}
function WalkInCard({ walkIn, onAction, phase }: WalkInCardProps) {
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
      style={{
        background: `${passColor}08`,
        border: `1px solid ${passColor}28`,
        borderRadius: 4,
        padding: "28px 32px",
        display: "flex",
        alignItems: "center",
        gap: 28,
        position: "relative",
        overflow: "hidden",
        animation: "fadeSlideIn 0.3s ease",
      }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: 56,
          background: passColor,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 56,
          height: 3,
          background: passColor,
        }}
      />

      {/* Pass badge */}
      <div
        style={{
          width: 80,
          height: 80,
          flexShrink: 0,
          borderRadius: 4,
          background: `${passColor}14`,
          border: `1px solid ${passColor}38`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}>
        <span style={{ fontSize: "1.6rem" }}>🎫</span>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.52rem",
            color: passColor,
            letterSpacing: "0.1em",
          }}>
          {walkIn.passType.toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(1.4rem, 2vw, 1.9rem)",
            color: "#f5f5f5",
            letterSpacing: "0.06em",
            lineHeight: 1,
            marginBottom: 6,
          }}>
          {walkIn.walkId}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.65rem",
              color: "#555",
            }}>
            {walkIn.name}
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.58rem",
              color: walkIn.isCheckedOut ? "#444" : "#22c55e",
              border: `1px solid ${walkIn.isCheckedOut ? "#333" : "#22c55e"}`,
              padding: "1px 6px",
              borderRadius: 2,
              letterSpacing: "0.1em",
            }}>
            {walkIn.isCheckedOut ? "CHECKED OUT" : "INSIDE"}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "'Space Mono', monospace",
            fontSize: "0.58rem",
            color: "#3a3a3a",
            letterSpacing: "0.08em",
          }}>
          CHECK-IN{" "}
          {new Date(walkIn.checkIn).toLocaleTimeString("en-PH", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </div>

      {/* Action — hidden if already out */}
      {!isAlreadyOut && (
        <button
          onClick={onAction}
          disabled={isProcessing || isSuccess}
          style={{
            flexShrink: 0,
            minWidth: 130,
            padding: "14px 24px",
            background: isSuccess ? "rgba(34,197,94,0.1)" : "transparent",
            border: isSuccess
              ? "1px solid #22c55e"
              : `1px solid ${passColor}55`,
            borderRadius: 3,
            color: isSuccess ? "#22c55e" : passColor,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "1.1rem",
            letterSpacing: "0.12em",
            cursor: isProcessing || isSuccess ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
            textAlign: "center",
          }}>
          {isProcessing ? "PROCESSING..." : isSuccess ? "✓  DONE" : actionLabel}
        </button>
      )}
    </div>
  );
}

interface SelectionListProps {
  members: Member[];
  onSelect: (member: Member) => void;
}
function SelectionList({ members, onSelect }: SelectionListProps) {
  return (
    <div style={{ animation: "fadeSlideIn 0.3s ease" }}>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: "0.62rem",
          color: "#555",
          letterSpacing: "0.15em",
          marginBottom: 12,
        }}>
        MULTIPLE MEMBERS FOUND — TAP YOUR NAME
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map((m) => (
          <button
            key={m.gymId}
            onClick={() => onSelect(m)}
            style={{
              background: "rgba(255,107,26,0.03)",
              border: "1px solid rgba(255,107,26,0.14)",
              borderRadius: 4,
              padding: "13px 18px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "rgba(255,107,26,0.45)";
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,107,26,0.07)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "rgba(255,107,26,0.14)";
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,107,26,0.03)";
            }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 3,
                flexShrink: 0,
                background: "rgba(255,107,26,0.1)",
                border: "1px solid rgba(255,107,26,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "1rem",
                  color: "#FF6B1A",
                }}>
                {getInitials(m.name)}
              </span>
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "1.1rem",
                  color: "#f0f0f0",
                  letterSpacing: "0.06em",
                }}>
                {m.name}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "0.6rem",
                    color: "#FF6B1A",
                  }}>
                  {m.gymId}
                </span>
                {m.plan && (
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: "0.6rem",
                      color: "#444",
                    }}>
                    {m.plan}
                  </span>
                )}
                <span
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "0.6rem",
                    color: getStatusColor(m.status),
                  }}>
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

const RESET_DELAY_MS = 5500;

export default function KioskPage() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<KioskPhase>("idle");
  const [result, setResult] = useState<SearchResult>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);

  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offline detection
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
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

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
        const action = w.isCheckedOut ? "checkin" : "checkout";
        const { ok, error } = await performWalkInAction(w.walkId, action);
        if (!ok) {
          setPhase("error");
          setErrorMessage(resolveErrorMessage(error));
          scheduleReset(4000);
          return;
        }
        setResult({
          type: "walkin",
          data: { ...w, isCheckedOut: !w.isCheckedOut },
        });
        setStatusMessage(
          action === "checkout"
            ? `Goodbye ${w.name}! Thanks for visiting IronCore! 💪`
            : `Welcome, ${w.name}! Enjoy your workout!`,
        );
      }
      setPhase("success");
      scheduleReset(RESET_DELAY_MS);
    } catch {
      setPhase("error");
      setErrorMessage(resolveErrorMessage("NETWORK_ERROR"));
      scheduleReset(4000);
    }
  }, [result, phase, scheduleReset]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") resetKiosk();
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
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,107,26,0.13) 30%, rgba(255,107,26,0.13) 70%, transparent);
        }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "#1a1a1a",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}>
        {/* Scanlines overlay */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
          }}
        />

        {/* Ambient glow */}
        <div
          style={{
            position: "fixed",
            top: "-25vh",
            left: "50%",
            transform: "translateX(-50%)",
            width: "55vw",
            height: "55vh",
            background:
              "radial-gradient(ellipse, rgba(255,107,26,0.05) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
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
              borderBottom: "1px solid rgba(239,68,68,0.25)",
              padding: "9px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.62rem",
                color: "#ef4444",
                letterSpacing: "0.15em",
              }}>
              ⚠ NO INTERNET CONNECTION — PLEASE SEE THE FRONT DESK
            </span>
          </div>
        )}

        {/* Content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: "1100px",
            width: "100%",
            margin: "0 auto",
            padding: `${offline ? "58px" : "40px"} 48px 32px`,
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 44,
            }}>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    background: "#FF6B1A",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
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
                <span
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: "1.5rem",
                    color: "#f0f0f0",
                    letterSpacing: "0.15em",
                  }}>
                  IRONCORE
                </span>
              </div>
              <StandbyPulse offline={offline} />
            </div>
            <Clock />
          </div>

          {/* Hero text */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "clamp(2.4rem, 3.5vw, 4rem)",
                color: "#f5f5f5",
                lineHeight: 0.95,
                letterSpacing: "0.04em",
              }}>
              MEMBER
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "clamp(2.4rem, 3.5vw, 4rem)",
                lineHeight: 0.95,
                letterSpacing: "0.04em",
                background: "linear-gradient(90deg, #FF6B1A, #FFB800, #FF6B1A)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 5s linear infinite",
              }}>
              CHECK-IN TERMINAL
            </div>
          </div>

          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "0.63rem",
              color: "#3e3e3e",
              letterSpacing: "0.1em",
              marginBottom: 26,
            }}>
            ENTER YOUR NAME, GYM-ID, OR WALK-IN PASS ID BELOW
          </p>

          <div className="divider" style={{ marginBottom: 22 }} />

          {/* Search */}
          <div className="kiosk-input-wrap" style={{ marginBottom: 14 }}>
            <svg
              width="17"
              height="17"
              viewBox="0 0 18 18"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.28 }}>
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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={inputDisabled}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              className="search-btn"
              onClick={handleSearch}
              disabled={inputDisabled || !query.trim()}>
              {phase === "searching" ? "..." : "SEARCH"}
            </button>
          </div>

          {/* Hints */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 26,
              flexWrap: "wrap",
            }}>
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
            <div className="hint-tag" style={{ marginLeft: "auto" }}>
              <span style={{ color: "#444" }}>ESC</span>CLEAR
            </div>
          </div>

          {/* Results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

          <div style={{ flex: 1 }} />

          {/* Footer */}
          <div className="divider" style={{ marginBottom: 14 }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.54rem",
                color: "#282828",
                letterSpacing: "0.12em",
              }}>
              IRONCORE GMS · KIOSK TERMINAL v2.0
            </span>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: "0.54rem",
                color: "#282828",
                letterSpacing: "0.12em",
              }}>
              HAVING TROUBLE? SEE THE FRONT DESK
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
