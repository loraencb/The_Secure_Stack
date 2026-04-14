import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AppLayout from "./components/layout/AppLayout";
import { SecureStackProvider } from "./context/SecureStackContext";
import HomePage from "./pages/HomePage";
import LabsPage from "./pages/LabsPage";
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

export default function AppRouter() {
  return (
    <SecureStackProvider>
      <Routes>
        <Route element={<AppLayout />}>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SecureStackProvider>
  );
}
