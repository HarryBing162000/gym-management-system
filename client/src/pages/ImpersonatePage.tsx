import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ImpersonatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  // Extract token immediately
  const token = searchParams.get("token");

  // Guard against React StrictMode double-invoking useEffect in dev.
  // Without this, the token gets marked as used on the first call and
  // the second call returns 401 "already used".
  const exchangedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "error">(
    token ? "loading" : "error",
  );
  const [errorMsg, setErrorMsg] = useState(
    token ? "" : "No impersonation token found in the URL.",
  );

  useEffect(() => {
    if (!token) return;
    if (exchangedRef.current) return; // StrictMode guard — only run once
    exchangedRef.current = true;

    const exchange = async () => {
      try {
        const res = await fetch(`${API}/api/superadmin/exchange-impersonate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMsg(data.message || "This link has expired or is invalid.");
          setStatus("error");
          return;
        }

        // FIX: setAuth signature is (user, token) — user first, token second
        setAuth(data.user, data.token);

        // Store flag so owner dashboard can show the support banner
        sessionStorage.setItem("gms:impersonating", data.gymName ?? "this gym");

        navigate("/dashboard", { replace: true });
      } catch {
        setErrorMsg("Connection failed. Please try again.");
        setStatus("error");
      }
    };

    exchange();
  }, [token, navigate, setAuth]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div
        className="min-h-screen bg-[#1a1a1a] flex items-center justify-center"
        style={{
          backgroundImage: `radial-gradient(ellipse 60% 40% at 50% 30%, rgba(255,107,26,0.06) 0%, transparent 60%)`,
        }}
      >
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/10 border-t-[#FF6B1A] rounded-full animate-spin mx-auto mb-4" />
          <div className="text-white/40 text-sm">
            Verifying support session...
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4"
      style={{
        backgroundImage: `radial-gradient(ellipse 60% 40% at 50% 30%, rgba(239,68,68,0.04) 0%, transparent 60%)`,
      }}
    >
      <div className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
        <div className="text-4xl mb-4">🔗</div>
        <div className="text-white font-bold text-base mb-2">Link Expired</div>
        <div className="text-white/40 text-sm mb-6 leading-relaxed">
          {errorMsg}
        </div>
        <button
          onClick={() => navigate("/login", { replace: true })}
          className="w-full py-2.5 bg-[#FF6B1A] text-white text-sm font-bold rounded-lg hover:bg-[#ff7d33] transition-all cursor-pointer"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}
