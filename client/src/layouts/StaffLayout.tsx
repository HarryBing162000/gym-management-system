import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../store/toastStore";
import { useNavigate } from "react-router-dom";
import SyncBadge from "../components/SyncBadge";
import { useAuthStore } from "../store/authStore";
import { useGymStore } from "../store/gymStore";
import api from "../services/api";

const navItems = [
  {
    id: "checkin",
    label: "Check-in",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  },
  {
    id: "walkin",
    label: "Walk-in",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
  },
  {
    id: "members",
    label: "Members",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  {
    id: "payments",
    label: "Payments",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  },
  {
    id: "my-activity",
    label: "My Activity",
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  },
];

// ─── Logout Confirm Modal ─────────────────────────────────────────────────────
function LogoutModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <>
      <style>{`
        @keyframes logoutFadeIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-xs bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl"
          style={{ animation: "logoutFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="16 17 21 12 16 7"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <line
                x1="21"
                y1="12"
                x2="9"
                y2="12"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-center mb-5">
            <div className="text-white font-bold text-base mb-1">Sign out?</div>
            <div className="text-white/40 text-sm">
              You will be returned to the login screen.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 border border-white/10 text-white/50 hover:text-white hover:border-white/20 text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Staff Settings Modal ─────────────────────────────────────────────────────
function StaffSettingsModal({
  onClose,
  userName,
}: {
  onClose: () => void;
  userName: string;
}) {
  const { showToast } = useToastStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all fields", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters", "error");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/update-password", { currentPassword, newPassword });
      showToast("Password updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update password",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <style>{`
        @keyframes staffSettingsFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: "staffSettingsFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div>
              <div className="text-white font-bold text-base">Settings</div>
              <div className="text-white/40 text-xs mt-0.5">{userName}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer text-lg"
            >
              ✕
            </button>
          </div>
          <div className="p-6">
            <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
              Change Password
            </div>
            <div className="space-y-2.5">
              <input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 transition-colors"
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 transition-colors"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 transition-colors"
              />
              <button
                onClick={handleUpdatePassword}
                disabled={saving}
                className="w-full py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                {saving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Staff Layout ─────────────────────────────────────────────────────────────
interface StaffLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onPageChange: (page: string) => void;
  pageTitle: string;
}

export default function StaffLayout({
  children,
  activePage,
  onPageChange,
}: StaffLayoutProps) {
  const { user, logout } = useAuthStore();
  const { settings } = useGymStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);
  const [showSidebarDropdown, setShowSidebarDropdown] = useState(false);
  const sidebarDropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToastStore();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        avatarDropdownRef.current &&
        !avatarDropdownRef.current.contains(e.target as Node)
      )
        setShowAvatarDropdown(false);
    }
    if (showAvatarDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAvatarDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        sidebarDropdownRef.current &&
        !sidebarDropdownRef.current.contains(e.target as Node)
      )
        setShowSidebarDropdown(false);
    }
    if (showSidebarDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSidebarDropdown]);

  const handleLogout = () => {
    setShowAvatarDropdown(false);
    setShowSidebarDropdown(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    logout();
    showToast("You have been signed out.", "info");
    navigate("/login");
  };

  const handleNav = (id: string) => {
    onPageChange(id);
    setSidebarOpen(false);
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const gymName = settings?.gymName || "GMS";
  const logoUrl = settings?.logoUrl || null;

  // Desk items = first 4, Activity = last 1
  const deskItems = navItems.slice(0, 4);
  const activityItems = navItems.slice(4);

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-screen w-55 bg-[#212121] border-r border-white/7 flex flex-col z-50 transition-transform duration-250 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:sticky lg:z-auto`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/7">
          {logoUrl ? (
            <div className="w-full h-12 flex items-center">
              <img
                src={logoUrl}
                alt="Gym logo"
                className="w-full h-full object-contain object-center"
                style={{ imageRendering: "auto" }}
              />
            </div>
          ) : (
            <div className="text-lg font-black tracking-widest text-[#FF6B1A] uppercase">
              ⚡ {gymName}
            </div>
          )}
          <div className="text-[10px] text-white/30 text-center uppercase tracking-widest mt-1.5">
            Staff Portal
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-5 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Desk
          </div>
          {deskItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full cursor-pointer flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all border-l-2 ${activePage === item.id ? "text-[#FF6B1A] bg-[#FF6B1A]/10 border-[#FF6B1A]" : "text-white/50 border-transparent hover:text-white hover:bg-white/3"}`}
            >
              <span
                className="w-4 h-4 shrink-0"
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
              {item.label}
            </button>
          ))}

          <div className="px-5 py-2 mt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Activity
          </div>
          {activityItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full cursor-pointer flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all border-l-2 ${activePage === item.id ? "text-[#FF6B1A] bg-[#FF6B1A]/10 border-[#FF6B1A]" : "text-white/50 border-transparent hover:text-white hover:bg-white/3"}`}
            >
              <span
                className="w-4 h-4 shrink-0"
                dangerouslySetInnerHTML={{ __html: item.icon }}
              />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar Profile Chip */}
        <div
          className="px-4 py-4 border-t border-white/7 relative"
          ref={sidebarDropdownRef}
        >
          {showSidebarDropdown && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-10 lg:hidden">
              <button
                onClick={() => {
                  setShowSidebarDropdown(false);
                  setShowSettingsModal(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                <span className="text-base">⚙</span> Settings
              </button>
              <div className="border-t border-white/10" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all cursor-pointer"
              >
                <span className="text-base">⏻</span> Logout
              </button>
            </div>
          )}
          <div
            onClick={() => {
              if (window.innerWidth < 1024)
                setShowSidebarDropdown((prev) => !prev);
            }}
            className="flex items-center gap-3 lg:cursor-default cursor-pointer hover:bg-white/5 lg:hover:bg-transparent rounded-xl p-1 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-blue-400/15 border border-blue-400/40 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user?.name}
              </div>
              <div className="text-[10px] text-white/30">Staff</div>
            </div>
            <span
              className={`lg:hidden text-white/30 text-xs transition-transform duration-200 ${showSidebarDropdown ? "rotate-180" : ""}`}
            >
              ▲
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 bg-[#1a1a1a]/90 backdrop-blur-md border-b border-white/7 px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 border border-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
            >
              ☰
            </button>
            <span className="text-xs text-white/30 font-mono">
              {new Date().toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="text-xs bg-blue-400/10 text-blue-400 border border-blue-400/20 px-2.5 py-1 rounded-full font-semibold">
              Staff
            </span>
          </div>

          {/* Sync badge -- shows pending/failed offline actions */}
          <SyncBadge />

          <div className="hidden lg:block relative" ref={avatarDropdownRef}>
            {showAvatarDropdown && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="text-xs font-semibold text-white truncate">
                    {user?.name}
                  </div>
                  <div className="text-[10px] text-white/30">Staff</div>
                </div>
                <button
                  onClick={() => {
                    setShowAvatarDropdown(false);
                    setShowSettingsModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  <span>⚙</span> Settings
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all cursor-pointer"
                >
                  <span>⏻</span> Logout
                </button>
              </div>
            )}
            <button
              onClick={() => setShowAvatarDropdown((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-blue-400/15 border border-blue-400/40 flex items-center justify-center text-xs font-bold text-blue-400 cursor-pointer hover:bg-blue-400/25 transition-all"
            >
              {initials}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>

      {showLogoutModal && (
        <LogoutModal
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}
      {showSettingsModal && (
        <StaffSettingsModal
          onClose={() => setShowSettingsModal(false)}
          userName={user?.name || ""}
        />
      )}
    </div>
  );
}
