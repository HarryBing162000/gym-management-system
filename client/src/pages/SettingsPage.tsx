/**
 * SettingsPage.tsx
 * IronCore GMS — Owner Settings
 *
 * Sections:
 *   1. Gym Info         — name, address, logo
 *   2. Membership Plans — dynamic plans (add/edit/deactivate/delete)
 *   3. Walk-in Prices   — day pass pricing
 *   4. Account          — change email, change password
 */

import { useState, useRef, useEffect } from "react";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import { useAuthStore } from "../store/authStore";
import PlansManager from "./PlansManager";
import api from "../services/api";

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#212121] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Input field helper ───────────────────────────────────────────────────────
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors";

const btnPrimary =
  "px-4 py-2.5 bg-[#FF6B1A] hover:bg-[#ff8a45] disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer";

// ─── 1. Gym Info Section ──────────────────────────────────────────────────────
function GymInfoSection() {
  const { showToast } = useToastStore();
  const { settings, updateSettings, setLogoUrl } = useGymStore();
  const [gymName, setGymName] = useState(settings?.gymName || "");
  const [gymAddress, setGymAddress] = useState(settings?.gymAddress || "");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    settings?.logoUrl || null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setGymName(settings.gymName);
      setGymAddress(settings.gymAddress);
      setPreviewUrl(settings.logoUrl);
    }
  }, [settings]);

  const handleSaveGym = async () => {
    if (!gymName.trim() || !gymAddress.trim()) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/update-gym", {
        gymName: gymName.trim(),
        gymAddress: gymAddress.trim(),
      });
      updateSettings({
        gymName: gymName.trim(),
        gymAddress: gymAddress.trim(),
      });
      showToast("Gym information saved.", "success");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to save gym info.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      showToast("Only JPG, PNG, SVG, or WebP allowed.", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("File must be under 2MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUploadLogo = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      showToast("Please select a file first.", "error");
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
      showToast("Logo uploaded.", "success");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      showToast(err.response?.data?.message || "Upload failed.", "error");
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
      showToast("Logo removed.", "success");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to remove logo.",
        "error",
      );
    } finally {
      setDeletingLogo(false);
    }
  };

  const hasNewFile = !!fileInputRef.current?.files?.[0];

  return (
    <Section
      title="Gym Information"
      subtitle="Name, address and logo shown throughout the system"
    >
      <div className="space-y-4">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Logo"
                className="w-full h-full object-contain p-1"
              />
            ) : (
              <span className="text-white/20 text-xs uppercase tracking-widest">
                Logo
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/40 mb-2">
              JPG, PNG, SVG or WebP · Max 2MB
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white/70 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                {previewUrl ? "Change" : "Upload"}
              </button>
              {hasNewFile && (
                <button
                  onClick={handleUploadLogo}
                  disabled={uploadingLogo}
                  className="text-xs px-3 py-1.5 bg-[#FF6B1A]/20 hover:bg-[#FF6B1A]/30 text-[#FF6B1A] rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {uploadingLogo ? "Uploading..." : "Save Logo"}
                </button>
              )}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/svg+xml,image/webp"
          onChange={handleLogoSelect}
          className="hidden"
        />

        {/* Name + Address */}
        <Field label="Gym Name">
          <input
            type="text"
            value={gymName}
            onChange={(e) => setGymName(e.target.value)}
            placeholder="e.g. IronCore Gym"
            className={inputClass}
          />
        </Field>
        <Field label="Address">
          <input
            type="text"
            value={gymAddress}
            onChange={(e) => setGymAddress(e.target.value)}
            placeholder="e.g. Antique, Philippines"
            className={inputClass}
          />
        </Field>

        <div className="flex justify-end">
          <button
            onClick={handleSaveGym}
            disabled={saving}
            className={btnPrimary}
          >
            {saving ? "Saving..." : "Save Gym Info"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── 3. Walk-in Prices Section ────────────────────────────────────────────────
function WalkInPricesSection() {
  const { showToast } = useToastStore();
  const { settings, setWalkInPrices } = useGymStore();

  const [regular, setRegular] = useState(
    String(settings?.walkInPrices?.regular ?? 150),
  );
  const [student, setStudent] = useState(
    String(settings?.walkInPrices?.student ?? 100),
  );
  const [couple, setCouple] = useState(
    String(settings?.walkInPrices?.couple ?? 250),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.walkInPrices) {
      setRegular(String(settings.walkInPrices.regular));
      setStudent(String(settings.walkInPrices.student));
      setCouple(String(settings.walkInPrices.couple));
    }
  }, [settings?.walkInPrices]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put("/auth/walkin-prices", {
        regular: Number(regular),
        student: Number(student),
        couple: Number(couple),
      });
      setWalkInPrices(res.data.walkInPrices);
      showToast(res.data.message, "success");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update prices.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const passTypes = [
    { key: "regular", label: "Regular", value: regular, setter: setRegular },
    { key: "student", label: "Student", value: student, setter: setStudent },
    { key: "couple", label: "Couple", value: couple, setter: setCouple },
  ];

  return (
    <Section
      title="Walk-in Day Passes"
      subtitle="Pricing for walk-in visitors — applies to new registrations immediately"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {passTypes.map(({ key, label, value, setter }) => (
            <div
              key={key}
              className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-2"
            >
              <div className="text-xs font-bold text-white">{label}</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs font-mono">
                  ₱
                </span>
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-6 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? "Saving..." : "Save Walk-in Prices"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── 4. Account Section ───────────────────────────────────────────────────────
function AccountSection() {
  const { showToast } = useToastStore();
  const { user } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all password fields.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }
    setSavingPw(true);
    try {
      await api.put("/auth/update-password", { currentPassword, newPassword });
      showToast("Password updated.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update password.",
        "error",
      );
    } finally {
      setSavingPw(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || !emailPassword) {
      showToast("Please fill in all email fields.", "error");
      return;
    }
    setSavingEmail(true);
    try {
      await api.put("/auth/update-email", {
        newEmail,
        password: emailPassword,
      });
      showToast("Email updated.", "success");
      setNewEmail("");
      setEmailPassword("");
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to update email.",
        "error",
      );
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <Section title="Account" subtitle="Login credentials for the owner account">
      <div className="space-y-6">
        {/* Change Password */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            Change Password
          </div>
          <Field label="Current Password">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className={inputClass}
            />
          </Field>
          <Field label="New Password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={inputClass}
            />
          </Field>
          <Field label="Confirm New Password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputClass}
            />
          </Field>
          <div className="flex justify-end">
            <button
              onClick={handleUpdatePassword}
              disabled={savingPw}
              className={btnPrimary}
            >
              {savingPw ? "Updating..." : "Update Password"}
            </button>
          </div>
        </div>

        <div className="border-t border-white/10" />

        {/* Change Email */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            Change Email
          </div>
          <div className="text-xs text-white/30">
            Current: <span className="text-white/50">{user?.email || "—"}</span>
          </div>
          <Field label="New Email">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              className={inputClass}
            />
          </Field>
          <Field label="Confirm with Password">
            <input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Your current password"
              className={inputClass}
            />
          </Field>
          <div className="flex justify-end">
            <button
              onClick={handleUpdateEmail}
              disabled={savingEmail}
              className={btnPrimary}
            >
              {savingEmail ? "Updating..." : "Update Email"}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">Settings</h2>
        <p className="text-xs text-white/30 mt-0.5">
          Manage your gym configuration and account
        </p>
      </div>

      <GymInfoSection />

      {/* Membership Plans */}
      <Section
        title="Membership Plans"
        subtitle="Add, edit, or deactivate plans — changes apply everywhere immediately"
      >
        <PlansManager />
      </Section>

      <WalkInPricesSection />

      <AccountSection />
    </div>
  );
}
