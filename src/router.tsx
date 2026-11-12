import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { useMe } from "@/lib/auth";
import { PageLoader } from "@/components/ui";
import { StudentLayout } from "@/pages/student/layout";
import { AdminLayout } from "@/pages/admin/layout";
import { LoginPage } from "@/pages/login";
import { NotFoundPage, RouteErrorPage } from "@/pages/errors";

const SetupPage = lazy(() => import("@/pages/setup"));
const AccountPage = lazy(() => import("@/pages/account"));

const StudentHome = lazy(() => import("@/pages/student/home"));
const StudentTasks = lazy(() => import("@/pages/student/tasks"));
const StudentTaskDetail = lazy(() => import("@/pages/student/task-detail"));
const StudentLogs = lazy(() => import("@/pages/student/logs"));

const AdminOverview = lazy(() => import("@/pages/admin/overview"));
const AdminTasks = lazy(() => import("@/pages/admin/tasks"));
const AdminTaskEditor = lazy(() => import("@/pages/admin/task-editor"));
const AdminTaskDetail = lazy(() => import("@/pages/admin/task-detail"));
const AdminReviews = lazy(() => import("@/pages/admin/reviews"));
const AdminStudents = lazy(() => import("@/pages/admin/students"));
const AdminStudentDetail = lazy(() => import("@/pages/admin/student-detail"));
const AdminMatrix = lazy(() => import("@/pages/admin/matrix"));
const AdminData = lazy(() => import("@/pages/admin/data"));
const AdminTeam = lazy(() => import("@/pages/admin/team"));
const AdminAnnouncement = lazy(() => import("@/pages/admin/announcement"));

function Guard({ role, children }: { role: "admin" | "student" | "any"; children: ReactNode }) {
  const { user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.must_change_password && location.pathname !== "/account") return <Navigate to="/account" replace />;
  if (role !== "any" && user.role !== role) return <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, isLoading } = useMe();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/app"} replace />;
}

function AccountLayout() {
  const { user } = useMe();
  return user?.role === "admin" ? <AdminLayout /> : <StudentLayout />;
}

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: "/", element: <HomeRedirect /> },
      { path: "/login", element: <LoginPage /> },
      {
        path: "/setup",
        element: (
          <Suspense fallback={<PageLoader />}>
            <SetupPage />
          </Suspense>
        ),
      },
      {
        path: "/account",
        element: (
          <Guard role="any">
            <AccountLayout />
          </Guard>
        ),
        children: [{ index: true, element: <AccountPage /> }],
      },
      {
        path: "/app",
        element: (
          <Guard role="student">
            <StudentLayout />
          </Guard>
        ),
        children: [
          { index: true, element: <StudentHome /> },
          { path: "tasks", element: <StudentTasks /> },
          { path: "tasks/:id", element: <StudentTaskDetail /> },
          { path: "logs", element: <StudentLogs /> },
        ],
      },
      {
        path: "/admin",
        element: (
          <Guard role="admin">
            <AdminLayout />
          </Guard>
        ),
        children: [
          { index: true, element: <AdminOverview /> },
          { path: "tasks", element: <AdminTasks /> },
          { path: "tasks/new", element: <AdminTaskEditor /> },
          { path: "tasks/:id", element: <AdminTaskDetail /> },
          { path: "tasks/:id/edit", element: <AdminTaskEditor /> },
          { path: "reviews", element: <AdminReviews /> },
          { path: "students", element: <AdminStudents /> },
          { path: "students/:id", element: <AdminStudentDetail /> },
          { path: "matrix", element: <AdminMatrix /> },
          { path: "announcement", element: <AdminAnnouncement /> },
          { path: "data", element: <AdminData /> },
          { path: "team", element: <AdminTeam /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
