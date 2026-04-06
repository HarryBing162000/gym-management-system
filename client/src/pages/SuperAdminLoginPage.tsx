/**
 * SuperAdminLoginPage.tsx
 * LakasGMS — Super Admin Login
 *
 * Hidden route: /superadmin
 * Not linked anywhere in the public UI.
 * Uses a separate JWT (SUPER_JWT_SECRET) stored in superAdminStore.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSuperAdminStore } from "../store/superAdminStore";

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useSuperAdminStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const handleLogin = async () => {
    setErrorMsg("");
    if (!email.trim()) {
      setErrorMsg("Email is required.");
      return;
    }
    if (!password) {
      setErrorMsg("Password is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/superadmin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.message || "Invalid credentials.");
        return;
      }

      setAuth(data.token);
      navigate("/superadmin/dashboard");
    } catch {
      setErrorMsg("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes saFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 50% 60% at 15% 50%, rgba(255,184,0,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 50% at 85% 30%, rgba(255,107,26,0.05) 0%, transparent 60%)
          `,
        }}
      >
        <div
          className="w-full max-w-sm"
          style={{ animation: "saFadeIn 0.35s ease" }}
        >
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#FFB800]/10 border border-[#FFB800]/20 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800]" />
              <span className="text-[#FFB800] text-[11px] font-bold uppercase tracking-widest">
                Super Admin
              </span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-[#212121] border border-white/10 rounded-2xl p-8">
            {/* Header */}
            <div className="text-center mb-7">
              <h1 className="text-xl font-black tracking-widest text-white uppercase">
                ⚡ LakasGMS Control
              </h1>
              <p className="text-xs text-white/30 mt-1 tracking-wide">
                System Administrator Access
              </p>
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
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMsg("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="admin@yourdomain.com"
                  autoCapitalize="none"
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 pr-16 text-sm text-white placeholder-white/20 outline-none focus:border-[#FFB800] transition-colors"
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

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full mt-2 py-3 bg-[#FFB800] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ffc933] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  "Access Dashboard ➜"
                )}
              </button>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-xs text-white/20 hover:text-white/40 transition-colors"
            >
              ← Back to gym login
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
