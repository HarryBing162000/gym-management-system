import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

// Nav items for the sidebar
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "◼" },
  { id: "members", label: "Members", icon: "◉" },
  { id: "walkins", label: "Walk-ins", icon: "⊕" },
  { id: "payments", label: "Payments", icon: "◈" },
  { id: "staff", label: "Staff", icon: "◎" },
  { id: "reports", label: "Reports", icon: "▤" },
  { id: "settings", label: "Settings", icon: "◌" },
];

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
  pageTitle,
}: OwnerLayoutProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleNav = (id: string) => {
    onPageChange(id);
    setSidebarOpen(false); // close sidebar on mobile after clicking
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex">
      {/* ── SIDEBAR OVERLAY (mobile only) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR (desktop: always visible | mobile: slide-in drawer) ── */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-55 bg-[#212121] border-r border-white/7
          flex flex-col z-50 transition-transform duration-250
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:sticky lg:z-auto 
        `}>
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/7">
          <div className="text-lg font-black tracking-widest text-[#FF6B1A] uppercase">
            ⚡ IronCore
          </div>
          <div className="text-[10px] text-white/30 uppercase tracking-widest mt-1">
            Owner Portal
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 overflow-y-auto ">
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
              }`}>
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
              }`}>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User chip at bottom */}
        <div className="px-4 py-4 border-t border-white/7">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FF6B1A]/15 border border-[#FF6B1A]/40 flex items-center justify-center text-xs font-bold text-[#FF6B1A] shrink-0">
              {user?.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {user?.name}
              </div>
              <div className="text-[10px] text-white/30">Owner</div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className=" cursor-pointer text-white/30 hover:text-red-400 transition-colors text-base">
              ⏻
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-[#1a1a1a]/90 backdrop-blur-md border-b border-white/7 px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger — only on mobile/tablet */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 border border-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
              ☰
            </button>
            <h2 className="font-bold text-white text-base sm:texto-lg uppercase tracking-wide">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-white/30 font-mono">
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
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">{children}</main>
      </div>

      {/* ── BOTTOM NAV (mobile only) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#212121] border-t border-white/10 z-30 flex">
        {navItems.slice(0, 5).map((item) => (
          <button
            key={item.id}
            onClick={() => handleNav(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-semibold transition-all ${
              activePage === item.id
                ? "text-[#FF6B1A]"
                : "text-white/30 hover:text-white/60"
            }`}>
            <span className="text-base">{item.icon}</span>
            <span className="truncate w-full text-center px-0.5">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
