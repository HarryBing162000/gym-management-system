/**
 * SetPasswordPage.tsx
 * GMS — Set / Reset Password
 *
 * Handles two flows from email links:
 *   /set-password?token=...   → owner first-time password setup (invite)
 *   /reset-password?token=... → owner forgot-password reset
 *
 * Both call POST /api/auth/set-password — same backend handler.
 * On success, auto-logs in and redirects to /dashboard.
 */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useGymStore } from "../store/gymStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const { settings } = useGymStore();

  const token = searchParams.get("token") ?? "";
  const isReset = window.location.pathname.includes("reset");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [done, setDone] = useState(false);

  const gymName = settings?.gymName || "GMS";

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!token) {
      setErrorMsg("Invalid link — token is missing. Please request a new one.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(
          data.message || "Failed to set password. The link may have expired.",
        );
        return;
      }

      // Auto-login — backend returns token + user on success
      setAuth(data.user, data.token);
      setDone(true);

      // Redirect to dashboard after brief success message
      setTimeout(() => navigate("/dashboard"), 1800);
    } catch {
      setErrorMsg("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
        <div
          className="text-center"
          style={{ animation: "spFadeIn 0.3s ease" }}
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path
                d="M7 16l6 6 12-12"
                stroke="#22c55e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-white font-bold text-lg mb-1">Password set!</div>
          <div className="text-white/40 text-sm">
            Redirecting to your dashboard...
          </div>
        </div>
      </div>
    );
  }

  // ── No token ──────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4 opacity-30">🔗</div>
          <div className="text-white font-bold mb-2">Invalid Link</div>
          <div className="text-white/40 text-sm mb-6">
            This link is missing a token. Please use the link from your email.
          </div>
          <a href="/login" className="text-[#FF6B1A] text-sm hover:underline">
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 20% 50%, rgba(255,107,26,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 60% at 80% 30%, rgba(255,184,0,0.05) 0%, transparent 60%)
          `,
        }}
      >
        <div
          className="w-full max-w-sm bg-[#212121] border border-white/10 rounded-2xl p-8"
          style={{ animation: "spFadeIn 0.35s ease" }}
        >
          {/* Header */}
          <div className="text-center mb-7">
            <h1 className="text-xl font-black tracking-widest text-[#FF6B1A] uppercase">
              ⚡ {gymName}
            </h1>
            <p className="text-xs text-white/40 mt-1">Gym Management System</p>
            <div className="mt-4">
              <div className="text-white font-bold text-base">
                {isReset ? "Reset Your Password" : "Set Your Password"}
              </div>
              <div className="text-white/40 text-xs mt-1">
                {isReset
                  ? "Enter a new password for your account."
                  : "Welcome! Create a password to access your dashboard."}
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-xs">{errorMsg}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="At least 6 characters"
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 pr-16 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs transition-colors p-1 cursor-pointer"
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrorMsg("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Repeat your password"
                className={`w-full bg-[#2a2a2a] border rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors ${
                  confirm && confirm !== password
                    ? "border-red-500/50 focus:border-red-500"
                    : confirm && confirm === password
                      ? "border-emerald-500/50 focus:border-emerald-500"
                      : "border-white/10 focus:border-[#FF6B1A]"
                }`}
              />
              {confirm && confirm !== password && (
                <p className="text-red-400 text-[10px] mt-1 px-1">
                  Passwords do not match
                </p>
              )}
              {confirm && confirm === password && (
                <p className="text-emerald-400 text-[10px] mt-1 px-1">
                  ✓ Passwords match
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !password || !confirm}
              className="w-full mt-2 py-3 bg-[#FF6B1A] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ff8a45] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Setting Password...
                </span>
              ) : isReset ? (
                "Reset Password ➜"
              ) : (
                "Set Password & Enter ➜"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
