import { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { isRouteEnabled } from "./config/system";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./layouts/AppShell";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { CentralAnalyticsDashboardPage } from "./pages/CentralAnalyticsDashboardPage";
import { CentersPage } from "./pages/CentersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LabPage } from "./pages/LabPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PatientProfilePage } from "./pages/PatientProfilePage";
import { PatientTimelinePage } from "./pages/PatientTimelinePage";
import { PatientsPage } from "./pages/PatientsPage";
import { PharmacyPage } from "./pages/PharmacyPage";
import { ReferralsPage } from "./pages/ReferralsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { VisitsPage } from "./pages/VisitsPage";
import { Role } from "./types";

function LoginRoute() {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
}

function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="screen-center">جارٍ تحميل مساحة العمل...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          {isRouteEnabled("/centers") ? (
            <Route
              path="/centers"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN"]}>
                  <CentersPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/patients") ? (
            <Route
              path="/patients"
              element={
                <ProtectedRoute
                  roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]}
                >
                  <PatientsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/patients") ? (
            <Route
              path="/patients/:patientId"
              element={
                <ProtectedRoute
                  roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]}
                >
                  <PatientProfilePage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/patients") ? (
            <Route
              path="/patients/:patientId/timeline"
              element={
                <ProtectedRoute
                  roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]}
                >
                  <PatientTimelinePage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/visits") ? (
            <Route
              path="/visits"
              element={
                <ProtectedRoute roles={["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]}>
                  <VisitsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/referrals") ? (
            <Route
              path="/referrals"
              element={
                <ProtectedRoute
                  roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]}
                >
                  <ReferralsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/lab") ? (
            <Route
              path="/lab"
              element={
                <ProtectedRoute roles={["CENTER_MANAGER", "DOCTOR", "LAB_TECH"]}>
                  <LabPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/pharmacy") ? (
            <Route
              path="/pharmacy"
              element={
                <ProtectedRoute roles={["CENTER_MANAGER", "PHARMACIST"]}>
                  <PharmacyPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/master-data") ? (
            <Route
              path="/master-data"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN"]}>
                  <MasterDataPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/analytics") ? (
            <Route
              path="/analytics"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN"]}>
                  <CentralAnalyticsDashboardPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/reports") ? (
            <Route
              path="/reports"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN"]}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/notifications") ? <Route path="/notifications" element={<NotificationsPage />} /> : null}
          {isRouteEnabled("/audit-logs") ? (
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN"]}>
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
