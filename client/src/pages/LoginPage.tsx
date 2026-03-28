import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import { authService } from "../services/authService";

// ─── Success Modal ────────────────────────────────────────────────────────────

interface SuccessModalProps {
  name: string;
  role: "owner" | "staff";
  onContinue: () => void;
}

function SuccessModal({ name, role, onContinue }: SuccessModalProps) {
  const firstName = name.split(" ")[0];

  return (
    <>
      <style>{`
        @keyframes successFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes successRingPop {
          0%   { transform: scale(0.5); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes successSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 text-center shadow-2xl"
          style={{ animation: "successFadeIn 0.3s ease" }}
        >
          <div
            className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-5"
            style={{ animation: "successRingPop 0.4s ease 0.1s both" }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M7 16l6 6 12-12"
                stroke="#22c55e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div style={{ animation: "successSlideUp 0.3s ease 0.2s both" }}>
            <div className="text-white font-bold text-xl mb-1">
              Welcome back, {firstName}!
            </div>
            <div className="text-white/40 text-sm mb-1">
              Signed in successfully
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF6B1A]/10 border border-[#FF6B1A]/20 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B1A]" />
              <span className="text-[#FF6B1A] text-xs font-semibold uppercase tracking-wide">
                {role === "owner" ? "Owner Portal" : "Staff Portal"}
              </span>
            </div>
          </div>

          <button
            onClick={onContinue}
            className="w-full mt-6 py-3 bg-[#FF6B1A] text-black font-bold text-sm rounded-xl hover:bg-[#ff8a45] transition-all active:scale-95 cursor-pointer"
            style={{ animation: "successSlideUp 0.3s ease 0.35s both" }}
          >
            Enter the Gym →
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { showToast } = useToastStore();
  const { settings } = useGymStore();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [successData, setSuccessData] = useState<{
    name: string;
    role: "owner" | "staff";
    destination: string;
  } | null>(null);

  const gymName = settings?.gymName || "IronCore";
  const logoUrl = settings?.logoUrl || null;
  const isEmail = identifier.includes("@");

  const handleLogin = async () => {
    setErrorMsg("");
    if (!identifier.trim()) {
      setErrorMsg("Please enter your email or username.");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const response = isEmail
        ? await authService.loginOwner({ email: identifier.trim(), password })
        : await authService.loginStaff({
            username: identifier.trim(),
            password,
          });

      if (response.success) {
        setAuth(response.user, response.token);
        setSuccessData({
          name: response.user.name,
          role: response.user.role as "owner" | "staff",
          destination: response.user.role === "owner" ? "/dashboard" : "/staff",
        });
      }
    } catch (axiosError) {
      const err = axiosError as { response?: { data?: { message?: string } } };
      setErrorMsg(
        err.response?.data?.message || "Invalid credentials. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!successData) return;
    showToast(`Welcome back, ${successData.name.split(" ")[0]}! 👋`, "success");
    navigate(successData.destination);
  };

  return (
    <>
      {successData && (
        <SuccessModal
          name={successData.name}
          role={successData.role}
          onContinue={handleContinue}
        />
      )}

      <div
        className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 sm:p-6"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 50% at 20% 50%, rgba(255,107,26,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 60% at 80% 30%, rgba(255,184,0,0.05) 0%, transparent 60%)
          `,
        }}
      >
        <div className="w-full max-w-sm bg-[#212121] border border-white/10 rounded-2xl p-6 sm:p-10">
          {/* Logo / Gym Name */}
          <div className="mb-6 sm:mb-8 flex flex-col items-center">
            {logoUrl ? (
              <div className="w-full h-24 flex items-center justify-center mb-2">
                <img
                  src={logoUrl}
                  alt={gymName}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "auto" }}
                />
              </div>
            ) : (
              <h1 className="text-xl sm:text-2xl font-black tracking-widest text-[#FF6B1A] text-center uppercase">
                ⚡ {gymName}
              </h1>
            )}
            <p className="text-xs sm:text-sm text-white/40 mt-1 text-center tracking-wide">
              Gym Management System
            </p>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-xs sm:text-sm">{errorMsg}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Email or Username */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
                Email or Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setErrorMsg("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="owner@yourgym.com or username"
                  autoCapitalize="none"
                  autoComplete="username"
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 pr-20 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
                />
                {identifier.trim() && (
                  <span
                    className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      isEmail
                        ? "bg-[#FF6B1A]/15 text-[#FF6B1A] border border-[#FF6B1A]/30"
                        : "bg-blue-400/15 text-blue-400 border border-blue-400/30"
                    }`}
                  >
                    {isEmail ? "Owner" : "Staff"}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/25 mt-1.5 px-1">
                {identifier.trim()
                  ? isEmail
                    ? "Signing in as Owner"
                    : "Signing in as Staff"
                  : "Enter your email (owner) or username (staff)"}
              </p>
            </div>

            {/* Password */}
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
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 pr-12 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
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

            {/* Login Button */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full mt-2 py-3 sm:py-3.5 bg-[#FF6B1A] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ff8a45] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                "Enter the Gym ➜"
              )}
            </button>
          </div>

          {/* Bottom links */}
          <div className="mt-6 flex items-center justify-between">
            <a
              href="/forgot-password"
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Forgot password?
            </a>
            <a
              href="/kiosk"
              className="text-xs text-white/30 hover:text-[#FF6B1A] transition-colors"
            >
              Kiosk ➜
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
