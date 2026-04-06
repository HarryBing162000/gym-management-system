/**
 * ForgotPasswordPage.tsx
 * LakasGMS — Forgot Password
 *
 * Owner enters their email → backend sends reset link via Resend.
 * Linked from LoginPage with a small "Forgot password?" link.
 */

import { useState } from "react";
import { useGymStore } from "../store/gymStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ForgotPasswordPage() {
  const { settings } = useGymStore();
  const gymName = settings?.gymName || "GMS";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setErrorMsg("");
    if (!email.trim()) {
      setErrorMsg("Please enter your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.message || "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setErrorMsg("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fpFadeIn {
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
          style={{ animation: "fpFadeIn 0.35s ease" }}
        >
          {/* Header */}
          <div className="text-center mb-7">
            <h1 className="text-xl font-black tracking-widest text-[#FF6B1A] uppercase">
              ⚡ {gymName}
            </h1>
            <p className="text-xs text-white/40 mt-1">LakasGMS</p>
          </div>

          {sent ? (
            /* ── Sent state ── */
            <div
              className="text-center"
              style={{ animation: "fpFadeIn 0.3s ease" }}
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-4 text-2xl">
                📧
              </div>
              <div className="text-white font-bold mb-2">Check your inbox</div>
              <div className="text-white/40 text-sm leading-relaxed">
                If <span className="text-white/60">{email}</span> is registered,
                you'll receive a reset link shortly. It expires in 1 hour.
              </div>
              <a
                href="/login"
                className="inline-block mt-6 text-xs text-[#FF6B1A] hover:underline"
              >
                ← Back to login
              </a>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div className="mb-6">
                <div className="text-white font-bold text-base mb-1">
                  Forgot your password?
                </div>
                <div className="text-white/40 text-xs leading-relaxed">
                  Enter your owner email and we'll send you a reset link.
                </div>
              </div>

              {errorMsg && (
                <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-xs">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMsg("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="your@email.com"
                    autoCapitalize="none"
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading || !email.trim()}
                  className="w-full py-3 bg-[#FF6B1A] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ff8a45] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    "Send Reset Link ➜"
                  )}
                </button>
              </div>

              <div className="mt-5 text-center">
                <a
                  href="/login"
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  ← Back to login
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
