import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "../store/toastStore";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useGymStore } from "../store/gymStore";
import api from "../services/api";

// Nav items — Settings removed (moved to profile dropdown)
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "◼" },
  { id: "members", label: "Members", icon: "◉" },
  { id: "walkins", label: "Walk-ins", icon: "⊕" },
  { id: "payments", label: "Payments", icon: "◈" },
  { id: "staff", label: "Staff", icon: "◎" },
  { id: "reports", label: "Reports", icon: "▤" },
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

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  onClose,
  userName,
  userEmail,
}: {
  onClose: () => void;
  userName: string;
  userEmail: string;
}) {
  const [activeTab, setActiveTab] = useState<"account" | "gym">("account");
  const { showToast } = useToastStore();
  const { settings, updateSettings, setLogoUrl } = useGymStore();

  // Account tab state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Gym tab state
  const [gymName, setGymName] = useState(settings?.gymName || "");
  const [gymAddress, setGymAddress] = useState(settings?.gymAddress || "");
  const [savingGym, setSavingGym] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    settings?.logoUrl || null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync gym fields when tab opens
  useEffect(() => {
    if (activeTab === "gym" && settings) {
      setGymName(settings.gymName);
      setGymAddress(settings.gymAddress);
      setPreviewUrl(settings.logoUrl);
    }
  }, [activeTab, settings]);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all password fields", "error");
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
    setSavingPassword(true);
    try {
      await api.put("/auth/update-password", { currentPassword, newPassword });
      showToast("Password updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update password",
        "error",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || !emailPassword) {
      showToast("Please fill in all email fields", "error");
      return;
    }
    setSavingEmail(true);
    try {
      await api.put("/auth/update-email", {
        newEmail,
        password: emailPassword,
      });
      showToast("Email updated successfully", "success");
      setNewEmail("");
      setEmailPassword("");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update email",
        "error",
      );
    } finally {
      setSavingEmail(false);
    }
  };

  const handleUpdateGym = async () => {
    if (!gymName || !gymAddress) {
      showToast("Please fill in all gym fields", "error");
      return;
    }
    setSavingGym(true);
    try {
      await api.put("/auth/update-gym", { gymName, gymAddress });
      updateSettings({ gymName, gymAddress });
      showToast("Gym information updated successfully", "success");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update gym info",
        "error",
      );
    } finally {
      setSavingGym(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      showToast("Only JPG, PNG, SVG, and WebP files are allowed", "error");
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast("File size must be under 2MB", "error");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      showToast("Please select a logo file first", "error");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await api.post("/auth/upload-logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setLogoUrl(res.data.logoUrl);
      setPreviewUrl(res.data.logoUrl);
      showToast("Logo uploaded successfully", "success");

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to upload logo",
        "error",
      );
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    setDeletingLogo(true);
    try {
      await api.delete("/auth/delete-logo");
      setLogoUrl(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast("Logo removed successfully", "success");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to remove logo",
        "error",
      );
    } finally {
      setDeletingLogo(false);
    }
  };

  return createPortal(
    <>
      <style>{`
        @keyframes settingsFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: "settingsFadeIn 0.2s ease" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
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

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab("account")}
              className={`flex-1 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === "account" ? "text-[#FF6B1A] border-b-2 border-[#FF6B1A]" : "text-white/40 hover:text-white/70"}`}
            >
              Account
            </button>
            <button
              onClick={() => setActiveTab("gym")}
              className={`flex-1 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === "gym" ? "text-[#FF6B1A] border-b-2 border-[#FF6B1A]" : "text-white/40 hover:text-white/70"}`}
            >
              Gym Info
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6 max-h-[65vh] overflow-y-auto">
            {/* ── Account Tab ── */}
            {activeTab === "account" && (
              <div className="space-y-6">
                {/* Change Password */}
                <div>
                  <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
                    Change Password
                  </div>
                  <div className="space-y-2.5">
                    <input
                      type="password"
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                    />
                    <button
                      onClick={handleUpdatePassword}
                      disabled={savingPassword}
                      className="w-full py-2.5 bg-[#FF6B1A] hover:bg-[#FF6B1A]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      {savingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/10" />

                {/* Change Email */}
                <div>
                  <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-1">
                    Change Email
                  </div>
                  <div className="text-xs text-white/30 mb-3">
                    Current: <span className="text-white/50">{userEmail}</span>
                  </div>
                  <div className="space-y-2.5">
                    <input
                      type="email"
                      placeholder="New email address"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Confirm with your password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                    />
                    <button
                      onClick={handleUpdateEmail}
                      disabled={savingEmail}
                      className="w-full py-2.5 bg-[#FF6B1A] hover:bg-[#FF6B1A]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      {savingEmail ? "Updating..." : "Update Email"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Gym Info Tab ── */}
            {activeTab === "gym" && (
              <div className="space-y-6">
                {/* Logo Upload */}
                <div>
                  <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
                    Gym Logo
                  </div>

                  {/* Logo Preview */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Gym logo"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span className="text-2xl">⚡</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/40 mb-1">
                        JPG, PNG, SVG or WebP · Max 2MB
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white/70 hover:text-white rounded-lg transition-all cursor-pointer"
                        >
                          {previewUrl ? "Change" : "Upload"}
                        </button>
                        {previewUrl && settings?.logoUrl && (
                          <button
                            onClick={handleDeleteLogo}
                            disabled={deletingLogo}
                            className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          >
                            {deletingLogo ? "Removing..." : "Remove"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/svg+xml,image/webp"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />

                  {/* Upload button — only shows after file selected */}
                  {fileInputRef.current?.files?.[0] && (
                    <button
                      onClick={handleUploadLogo}
                      disabled={uploadingLogo}
                      className="w-full py-2.5 bg-[#FF6B1A] hover:bg-[#FF6B1A]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      {uploadingLogo ? "Uploading..." : "Save Logo"}
                    </button>
                  )}
                </div>

                <div className="border-t border-white/10" />

                {/* Gym Name & Address */}
                <div>
                  <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
                    Gym Information
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">
                        Gym Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. IronCore Gym"
                        value={gymName}
                        onChange={(e) => setGymName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">
                        Address
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Antique, Philippines"
                        value={gymAddress}
                        onChange={(e) => setGymAddress(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleUpdateGym}
                      disabled={savingGym}
                      className="w-full py-2.5 bg-[#FF6B1A] hover:bg-[#FF6B1A]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      {savingGym ? "Saving..." : "Save Gym Info"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Owner Layout ─────────────────────────────────────────────────────────────

interface OwnerLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onPageChange: (page: string) => void;
  pageTitle: string;
}

export default function OwnerLayout({
  children,
  activePage,
  onPageChange,
}: OwnerLayoutProps) {
  const { user, logout } = useAuthStore();
  const { settings } = useGymStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Desktop top-right avatar dropdown
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);
  const avatarDropdownRef = useRef<HTMLDivElement>(null);

  // Mobile sidebar profile chip dropdown
  const [showSidebarDropdown, setShowSidebarDropdown] = useState(false);
  const sidebarDropdownRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToastStore();

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        avatarDropdownRef.current &&
        !avatarDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAvatarDropdown(false);
      }
    }
    if (showAvatarDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAvatarDropdown]);

  // Close sidebar dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        sidebarDropdownRef.current &&
        !sidebarDropdownRef.current.contains(e.target as Node)
      ) {
        setShowSidebarDropdown(false);
      }
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

  const gymName = settings?.gymName || "IronCore";
  const logoUrl = settings?.logoUrl || null;

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex">
      {/* ── SIDEBAR OVERLAY (mobile only) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`
        fixed top-0 left-0 h-screen w-55 bg-[#212121] border-r border-white/7
        flex flex-col z-50 transition-transform duration-250
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:sticky lg:z-auto
      `}
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
              {gymName}
            </div>
          )}
          <div className="text-[10px] text-white/30 text-center uppercase tracking-widest mt-1.5">
            Owner Portal
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-5 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Overview
          </div>
          {navItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all border-l-2 ${
                activePage === item.id
                  ? "text-[#FF6B1A] bg-[#FF6B1A]/10 border-[#FF6B1A]"
                  : "text-white/50 border-transparent hover:text-white hover:bg-white/3"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}

          <div className="px-5 py-2 mt-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Manage
          </div>
          {navItems.slice(4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all border-l-2 ${
                activePage === item.id
                  ? "text-[#FF6B1A] bg-[#FF6B1A]/10 border-[#FF6B1A]"
                  : "text-white/50 border-transparent hover:text-white hover:bg-white/3"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* ── Sidebar Profile Chip ── */}
        <div
          className="px-4 py-4 border-t border-white/7 relative"
          ref={sidebarDropdownRef}
        >
          {/* Mobile dropdown */}
          {showSidebarDropdown && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-10 lg:hidden">
              <button
                onClick={() => {
                  setShowSidebarDropdown(false);
                  setShowSettingsModal(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                <span className="text-base">⚙</span>
                Settings
              </button>
              <div className="border-t border-white/10" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all cursor-pointer"
              >
                <span className="text-base">⏻</span>
                Logout
              </button>
            </div>
          )}

          {/* Profile chip — clickable on mobile, display only on desktop */}
          <div
            onClick={() => {
              if (window.innerWidth < 1024)
                setShowSidebarDropdown((prev) => !prev);
            }}
            className="flex items-center gap-3 lg:cursor-default cursor-pointer hover:bg-white/5 lg:hover:bg-transparent rounded-xl p-1 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/15 border border-[#FF6B1A]/40 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user?.name}
              </div>
              <div className="text-[10px] text-white/30">Owner</div>
            </div>
            <span
              className={`lg:hidden text-white/30 text-xs transition-transform duration-200 ${showSidebarDropdown ? "rotate-180" : ""}`}
            >
              ▲
            </span>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* ── TOPBAR ── */}
        <header className="sticky top-0 z-30 bg-[#1a1a1a]/90 backdrop-blur-md border-b border-white/7 px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          {/* Left — Hamburger + Date + Badge */}
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
            <span className="flex items-center gap-1 text-xs bg-[#FF6B1A]/10 text-[#FF6B1A] border border-[#FF6B1A]/20 px-2.5 py-1 rounded-full font-semibold">
              ● Live
            </span>
          </div>

          {/* Right — Avatar dropdown (desktop only) */}
          <div className="hidden lg:block relative" ref={avatarDropdownRef}>
            {showAvatarDropdown && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10">
                  <div className="text-xs font-semibold text-white truncate">
                    {user?.name}
                  </div>
                  <div className="text-[10px] text-white/30">Owner</div>
                </div>
                <button
                  onClick={() => {
                    setShowAvatarDropdown(false);
                    setShowSettingsModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  <span>⚙</span>
                  Settings
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all cursor-pointer"
                >
                  <span>⏻</span>
                  Logout
                </button>
              </div>
            )}
            <button
              onClick={() => setShowAvatarDropdown((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-[#FF6B1A]/15 border border-[#FF6B1A]/40 flex items-center justify-center text-xs font-bold text-[#FF6B1A] cursor-pointer hover:bg-[#FF6B1A]/25 transition-all"
            >
              {initials}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>

      {/* ── MODALS ── */}
      {showLogoutModal && (
        <LogoutModal
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          userName={user?.name || ""}
          userEmail={user?.email || ""}
        />
      )}
    </div>
  );
}
