import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./store/authStore";
import { useGymStore } from "./store/gymStore";
import { syncManager } from "./lib/syncManager";
import ToastContainer from "./components/ToastContainer";

import LoginPage from "./pages/LoginPage";
import OwnerDashboard from "./pages/OwnerDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import KioskPage from "./pages/KioskPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Protected Route ───────────────────────────────────────────────────────────
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();

  // Wait for Zustand to rehydrate from localStorage before deciding to redirect.
  if (!_hasHydrated) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user?.role ?? "")) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  const fetchGymInfo = useGymStore((state) => state.fetchGymInfo);
  const settings = useGymStore((state) => state.settings);

  useEffect(() => {
    fetchGymInfo();
  }, [fetchGymInfo]);

  // Initialize offline sync manager — sets up online/offline listeners
  // and attempts to drain any queued actions from previous sessions
  useEffect(() => {
    syncManager.init();
  }, []);

  useEffect(() => {
    if (settings?.gymName) {
      document.title = `${settings.gymName} — GMS`;
    } else {
      document.title = "Gym Management System";
    }
  }, [settings?.gymName]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kiosk" element={<KioskPage />} />

          {/* Owner only */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["owner"]}>
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Staff only */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={["staff"]}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />

          {/* Root → login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </QueryClientProvider>
  );
}

export default App;
