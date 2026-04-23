import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AppLayout from "./components/layout/AppLayout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SecureStackProvider } from "./context/SecureStackContext";
import HomePage from "./pages/HomePage";
import LabsPage from "./pages/LabsPage";
import LoginPage from "./pages/Login";
import InstructorReviewPage from "./pages/InstructorReviewPage";
import ProfilePage from "./pages/ProfilePage";
import ReportsPage from "./pages/ReportsPage";
import SessionPage from "./pages/SessionPage";

const SessionOverviewPanel = lazy(() =>
  import("./components/session/SessionOverviewPanel")
);
const SessionGuidePanel = lazy(() =>
  import("./components/session/SessionGuidePanel")
);
const SessionLivePanel = lazy(() =>
  import("./components/session/SessionLivePanel")
);
const SessionReportsPanel = lazy(() =>
  import("./components/session/SessionReportsPanel")
);

function AuthGate({ children }) {
  const { authReady, isAuthenticated } = useAuth();

  if (!authReady) {
    return (
      <div className="page-stack auth-loading-shell">
        <section className="surface-card auth-card">
          <div className="content-stack">
            <span className="eyebrow">Secure Stack</span>
            <h1>Restoring your workspace</h1>
            <p>
              Checking your session so the guided lab environment can open
              safely.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function LoginRoute() {
  const { authReady, isAuthenticated } = useAuth();

  if (!authReady) {
    return (
      <div className="page-stack auth-loading-shell">
        <section className="surface-card auth-card">
          <div className="content-stack">
            <span className="eyebrow">Secure Stack</span>
            <h1>Loading authentication</h1>
          </div>
        </section>
      </div>
    );
  }

  return isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />;
}

function InstructorRoute() {
  const { authReady, user } = useAuth();

  if (!authReady) {
    return (
      <div className="page-stack auth-loading-shell">
        <section className="surface-card auth-card">
          <div className="content-stack">
            <span className="eyebrow">Secure Stack</span>
            <h1>Loading instructor review</h1>
          </div>
        </section>
      </div>
    );
  }

  return user?.is_instructor ? <InstructorReviewPage /> : <Navigate to="/" replace />;
}

export default function AppRouter() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <AuthGate>
              <SecureStackProvider>
                <AppLayout />
              </SecureStackProvider>
            </AuthGate>
          }
        >
          <Route path="/" element={<HomePage />} />
          <Route path="/labs" element={<LabsPage />} />
          <Route path="/session/:id" element={<SessionPage />}>
            <Route index element={<Navigate to="workspace" replace />} />
            <Route path="overview" element={<SessionOverviewPanel />} />
            <Route path="guide" element={<SessionGuidePanel />} />
            <Route path="workspace" element={<SessionLivePanel />} />
            <Route path="reports" element={<SessionReportsPanel />} />
          </Route>
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/instructor" element={<InstructorRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
