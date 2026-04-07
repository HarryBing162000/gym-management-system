/**
 * SettingsPage.tsx
 * LakasGMS — Owner Settings
 *
 * Sections:
 *   1. Gym Info         — name, address, logo
 *   2. Membership Plans — dynamic plans (add/edit/deactivate/delete)
 *   3. Walk-in Prices   — day pass pricing + closing time + timezone
 *   4. Account          — change password
 */

import { useState, useRef, useEffect } from "react";
import { useToastStore } from "../store/toastStore";
import { useGymStore } from "../store/gymStore";
import PlansManager from "./PlansManager";
import api from "../services/api";

// ─── Common IANA timezones for gym use ────────────────────────────────────────
const TIMEZONE_OPTIONS = [
  // Asia
  { value: "Asia/Manila", label: "Asia/Manila — Philippines (UTC+8)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur — Malaysia (UTC+8)" },
  { value: "Asia/Jakarta", label: "Asia/Jakarta — Indonesia (UTC+7)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok — Thailand (UTC+7)" },
  { value: "Asia/Hong_Kong", label: "Asia/Hong_Kong (UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo — Japan (UTC+9)" },
  { value: "Asia/Seoul", label: "Asia/Seoul — Korea (UTC+9)" },
  { value: "Asia/Dubai", label: "Asia/Dubai — UAE (UTC+4)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata — India (UTC+5:30)" },
  // Pacific
  {
    value: "Pacific/Auckland",
    label: "Pacific/Auckland — New Zealand (UTC+12/13)",
  },
  { value: "Pacific/Honolulu", label: "Pacific/Honolulu — Hawaii (UTC-10)" },
  // Australia
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10/11)" },
  { value: "Australia/Melbourne", label: "Australia/Melbourne (UTC+10/11)" },
  { value: "Australia/Perth", label: "Australia/Perth (UTC+8)" },
  // Americas
  {
    value: "America/New_York",
    label: "America/New_York — US Eastern (UTC-5/4)",
  },
  { value: "America/Chicago", label: "America/Chicago — US Central (UTC-6/5)" },
  { value: "America/Denver", label: "America/Denver — US Mountain (UTC-7/6)" },
  {
    value: "America/Los_Angeles",
    label: "America/Los_Angeles — US Pacific (UTC-8/7)",
  },
  {
    value: "America/Toronto",
    label: "America/Toronto — Canada Eastern (UTC-5/4)",
  },
  {
    value: "America/Vancouver",
    label: "America/Vancouver — Canada Pacific (UTC-8/7)",
  },
  { value: "America/Sao_Paulo", label: "America/Sao_Paulo — Brazil (UTC-3)" },
  { value: "America/Mexico_City", label: "America/Mexico_City (UTC-6/5)" },
  // Europe
  { value: "Europe/London", label: "Europe/London — UK (UTC+0/1)" },
  { value: "Europe/Paris", label: "Europe/Paris — France (UTC+1/2)" },
  { value: "Europe/Berlin", label: "Europe/Berlin — Germany (UTC+1/2)" },
  { value: "Europe/Madrid", label: "Europe/Madrid — Spain (UTC+1/2)" },
  { value: "Europe/Rome", label: "Europe/Rome — Italy (UTC+1/2)" },
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (UTC+1/2)" },
  { value: "Europe/Moscow", label: "Europe/Moscow — Russia (UTC+3)" },
  // Africa
  {
    value: "Africa/Johannesburg",
    label: "Africa/Johannesburg — South Africa (UTC+2)",
  },
  { value: "Africa/Lagos", label: "Africa/Lagos — Nigeria (UTC+1)" },
  { value: "Africa/Cairo", label: "Africa/Cairo — Egypt (UTC+2)" },
  // UTC
  { value: "UTC", label: "UTC — Coordinated Universal Time (UTC+0)" },
];

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

// ─── Unsaved changes dot ──────────────────────────────────────────────────────
function UnsavedDot() {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-[#FFB800] mr-2 animate-pulse"
      title="Unsaved changes"
    />
  );
}

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
  const [hasNewFile, setHasNewFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setGymName(settings.gymName);
      setGymAddress(settings.gymAddress);
      setPreviewUrl(settings.logoUrl);
    }
  }, [settings]);

  // FIX: track dirty state so we can show the unsaved indicator
  const isDirty =
    gymName.trim() !== (settings?.gymName ?? "") ||
    gymAddress.trim() !== (settings?.gymAddress ?? "");

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
    setHasNewFile(true);
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
      setHasNewFile(false);
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
      setHasNewFile(false);
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
              {previewUrl && settings?.logoUrl && !hasNewFile && (
                <button
                  onClick={handleDeleteLogo}
                  disabled={deletingLogo}
                  className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {deletingLogo ? "Removing..." : "Remove"}
                </button>
              )}
            </div>
            {/* FIX: hint so users know they must click Save Logo after selecting */}
            {hasNewFile && !uploadingLogo && (
              <p className="text-[11px] text-[#FFB800]/80 mt-2">
                ⚠ File selected — click "Save Logo" to upload.
              </p>
            )}
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
            placeholder="e.g. Iron Fitness Gym"
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

        {/* FIX: unsaved changes indicator + save button row */}
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-white/30 flex items-center">
            {isDirty && (
              <>
                <UnsavedDot />
                Unsaved changes
              </>
            )}
          </div>
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
  const {
    settings,
    setWalkInPrices,
    setClosingTime: setStoreClosingTime,
    setTimezone: setStoreTimezone,
  } = useGymStore();

  const [regular, setRegular] = useState(
    String(settings?.walkInPrices?.regular ?? 150),
  );
  const [student, setStudent] = useState(
    String(settings?.walkInPrices?.student ?? 100),
  );
  const [couple, setCouple] = useState(
    String(settings?.walkInPrices?.couple ?? 250),
  );
  const [closingTime, setClosingTime] = useState(
    settings?.closingTime ?? "22:00",
  );
  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Manila");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.walkInPrices) {
      setRegular(String(settings.walkInPrices.regular));
      setStudent(String(settings.walkInPrices.student));
      setCouple(String(settings.walkInPrices.couple));
    }
    if (settings?.closingTime) setClosingTime(settings.closingTime);
    if (settings?.timezone) setTimezone(settings.timezone);
  }, [settings?.walkInPrices, settings?.closingTime, settings?.timezone]);

  // FIX: track dirty state
  const isDirty =
    regular !== String(settings?.walkInPrices?.regular ?? 150) ||
    student !== String(settings?.walkInPrices?.student ?? 100) ||
    couple !== String(settings?.walkInPrices?.couple ?? 250) ||
    closingTime !== (settings?.closingTime ?? "22:00") ||
    timezone !== (settings?.timezone ?? "Asia/Manila");

  const handleSave = async () => {
    // FIX: validate prices are greater than zero before saving
    if (Number(regular) <= 0 || Number(student) <= 0 || Number(couple) <= 0) {
      showToast("Walk-in prices must be greater than ₱0.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await api.put("/auth/walkin-prices", {
        regular: Number(regular),
        student: Number(student),
        couple: Number(couple),
        closingTime: closingTime.trim() || "22:00",
        timezone: timezone.trim() || "Asia/Manila",
      });
      setWalkInPrices(res.data.walkInPrices);
      if (res.data.closingTime) setStoreClosingTime(res.data.closingTime);
      if (res.data.timezone) setStoreTimezone(res.data.timezone);
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
                  min={1}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg pl-6 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Closing time */}
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white mb-0.5">
                Gym Closing Time
              </div>
              <div className="text-[11px] text-white/30">
                Walk-ins still inside will be automatically checked out at this
                time daily.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
                style={{ colorScheme: "dark" }}
              />
              <div className="text-[10px] text-white/25 font-mono whitespace-nowrap">
                {(() => {
                  const [h, m] = closingTime.split(":").map(Number);
                  const suffix = h >= 12 ? "PM" : "AM";
                  const displayH = h % 12 === 0 ? 12 : h % 12;
                  return `${displayH}:${String(m).padStart(2, "0")} ${suffix}`;
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-white mb-0.5">
                Timezone
              </div>
              <div className="text-[11px] text-white/30">
                Used for date calculations, closing time, and all reports.
                Change this if your gym is not in the Philippines.
              </div>
            </div>
            <div className="shrink-0 min-w-0">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="bg-[#2a2a2a] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF6B1A]/50 transition-colors cursor-pointer max-w-xs w-full"
                style={{ colorScheme: "dark" }}
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* FIX: unsaved changes indicator + save button row */}
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-white/30 flex items-center">
            {isDirty && (
              <>
                <UnsavedDot />
                Unsaved changes
              </>
            )}
          </div>
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? "Saving..." : "Save Walk-in Settings"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── 4. Account Section ───────────────────────────────────────────────────────
function AccountSection() {
  const { showToast } = useToastStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // FIX: show/hide toggles for all three password fields
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  // Reusable password input with show/hide toggle
  const PasswordInput = ({
    value,
    onChange,
    placeholder,
    show,
    onToggle,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    show: boolean;
    onToggle: () => void;
  }) => (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FF6B1A]/50 transition-colors"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors cursor-pointer"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? (
          // Eye-off icon
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
        ) : (
          // Eye icon
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    </div>
  );

  return (
    <Section title="Account" subtitle="Change your account password">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            Change Password
          </div>
          <Field label="Current Password">
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Current password"
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
          </Field>
          <Field label="New Password">
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              placeholder="New password (min. 6 characters)"
              show={showNew}
              onToggle={() => setShowNew((v) => !v)}
            />
          </Field>
          <Field label="Confirm New Password">
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Confirm new password"
              show={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
          </Field>
          {/* Confirm mismatch hint */}
          {confirmPassword &&
            newPassword &&
            confirmPassword !== newPassword && (
              <p className="text-[11px] text-red-400">
                Passwords do not match.
              </p>
            )}
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
      </div>
    </Section>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Settings</h2>
        <p className="text-xs text-white/30 mt-0.5">
          Manage your gym configuration and account
        </p>
      </div>

      <GymInfoSection />

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
