import { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { isRouteEnabled } from "./config/system";
import { useAuth } from "./context/AuthContext";
import { AppShell } from "./layouts/AppShell";
import { CentersPage } from "./pages/CentersPage";
import { CenterDoctorsPage } from "./pages/CenterDoctorsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PatientAppointmentsPage } from "./pages/PatientAppointmentsPage";
import { PatientDoctorsPage } from "./pages/PatientDoctorsPage";
import { PatientHomePage } from "./pages/PatientHomePage";
import { PatientMedicalRecordPage } from "./pages/PatientMedicalRecordPage";
import { PatientMessagesPage } from "./pages/PatientMessagesPage";
import { PatientNotificationsPage } from "./pages/PatientNotificationsPage";
import { PatientProfilePage } from "./pages/PatientProfilePage";
import { PatientTimelinePage } from "./pages/PatientTimelinePage";
import { PatientsPage } from "./pages/PatientsPage";
import { ReferralsPage } from "./pages/ReferralsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { VisitsPage } from "./pages/VisitsPage";
import { VisitWorkflowPage } from "./pages/VisitWorkflowPage";
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

function HomeRoute() {
  const { user } = useAuth();

  if (user?.role === "PATIENT") {
    return <PatientHomePage />;
  }

  return <DashboardPage />;
}

function NotificationsRoute() {
  const { user } = useAuth();

  if (user?.role === "PATIENT") {
    return <PatientNotificationsPage />;
  }

  return <NotificationsPage />;
}

function DoctorsRoute() {
  const { user } = useAuth();

  if (user?.role === "PATIENT") {
    return <PatientDoctorsPage />;
  }

  return <CenterDoctorsPage />;
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
          <Route index element={<HomeRoute />} />
          <Route
            path="/appointments"
            element={
              <ProtectedRoute roles={["PATIENT"]}>
                <PatientAppointmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/medical-record"
            element={
              <ProtectedRoute roles={["PATIENT"]}>
                <PatientMedicalRecordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctors"
            element={
              <ProtectedRoute roles={["PATIENT", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                <DoctorsRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/messages"
            element={
              <ProtectedRoute roles={["PATIENT", "DOCTOR"]}>
                <PatientMessagesPage />
              </ProtectedRoute>
            }
          />
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
                <ProtectedRoute roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <PatientsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/patients") ? (
            <Route
              path="/patients/:patientId"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <PatientProfilePage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/patients") ? (
            <Route
              path="/patients/:patientId/timeline"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <PatientTimelinePage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/visits") ? (
            <Route
              path="/visits"
              element={
                <ProtectedRoute roles={["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <VisitsPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/visit-workflow") ? (
            <Route
              path="/visit-workflow"
              element={
                <ProtectedRoute roles={["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <VisitWorkflowPage />
                </ProtectedRoute>
              }
            />
          ) : null}
          {isRouteEnabled("/referrals") ? (
            <Route
              path="/referrals"
              element={
                <ProtectedRoute roles={["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"]}>
                  <ReferralsPage />
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
          {isRouteEnabled("/notifications") ? <Route path="/notifications" element={<NotificationsRoute />} /> : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
