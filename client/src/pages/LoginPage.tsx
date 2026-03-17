import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { authService } from "../services/authService";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const [activeRole, setActiveRole] = useState<"owner" | "staff">("owner");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    if (activeRole === "owner" && !email) {
      setError("Please enter your email");
      return;
    }
    if (activeRole === "staff" && !username) {
      setError("Please enter your username");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      const response =
        activeRole === "owner"
          ? await authService.loginOwner({ email, password })
          : await authService.loginStaff({ username, password });

      if (response.success) {
        setAuth(response.user, response.token);
        navigate(response.user.role === "owner" ? "/dashboard" : "/staff");
      }
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(
        error.response?.data?.message || "Login failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 sm:p-6"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 60% 50% at 20% 50%, rgba(255,107,26,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 40% 60% at 80% 30%, rgba(255,184,0,0.05) 0%, transparent 60%)
        `,
      }}>
      {/* Card — full width on mobile, fixed width on larger screens */}
      <div className="w-full max-w-[420px]  bg-[#212121] border border-white/10 rounded-2xl p-6 sm:p-10">
        {/* Logo */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-black tracking-widest text-[#FF6B1A] text-center uppercase">
            ⚡ IronCore
          </h1>
          <p className="text-xs sm:text-sm text-white/40 mt-1 text-center tracking-wide">
            Gym Management System
          </p>
        </div>

        {/* Role Tabs */}
        <div className="flex gap-1 bg-[#2a2a2a] rounded-lg p-1 mb-6">
          {(["owner", "staff"] as const).map((role) => (
            <button
              key={role}
              onClick={() => {
                setActiveRole(role);
                setError("");
              }}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                activeRole === role
                  ? "bg-[#333] text-[#FF6B1A] border border-white/10"
                  : "text-white/40 hover:text-white/60"
              }`}>
              {role}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-xs sm:text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          {/* Email or Username */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">
              {activeRole === "owner" ? "Email" : "Username"}
            </label>
            {activeRole === "owner" ? (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="owner@ironcore.gym"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
            ) : (
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="bianca_cruz"
                autoCapitalize="none"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
            )}
          </div>

          {/* Password with show/hide toggle */}
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
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-lg px-4 py-3 pr-12 text-sm text-white placeholder-white/20 outline-none focus:border-[#FF6B1A] transition-colors"
              />
              {/* Show/hide password button — helpful on mobile */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 text-xs transition-colors p-1">
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-2 py-3 sm:py-3.5 bg-[#FF6B1A] text-black font-bold text-sm uppercase tracking-widest rounded-lg hover:bg-[#ff8a45] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
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

        {/* Kiosk Link */}
        <div className="mt-6 text-center">
          <a
            href="/kiosk"
            className="text-xs text-white/30 hover:text-[#FF6B1A] transition-colors">
            Member self check-in ➜ Kiosk
          </a>
        </div>
      </div>
    </div>
  );
}
