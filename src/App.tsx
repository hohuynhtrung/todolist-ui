import { lazy, Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from 'react-router-dom'
import { RequireAuth } from '@/app/require-auth'
import { RoutePreview } from '@/pages/route-preview'

const AppShell = lazy(() =>
  import('@/components/layout/app-shell').then((module) => ({
    default: module.AppShell,
  })),
)
const TaskListPage = lazy(() =>
  import('@/pages/workspace/task-list-page').then((module) => ({
    default: module.TaskListPage,
  })),
)
const LoginPage = lazy(() =>
  import('@/pages/auth/login-page').then((module) => ({
    default: module.LoginPage,
  })),
)
const RegisterPage = lazy(() =>
  import('@/pages/auth/register-page').then((module) => ({
    default: module.RegisterPage,
  })),
)
const VerifyEmailPage = lazy(() =>
  import('@/pages/auth/verify-email-page').then((module) => ({
    default: module.VerifyEmailPage,
  })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/forgot-password-page').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/reset-password-page').then((module) => ({
    default: module.ResetPasswordPage,
  })),
)
const StatsPage = lazy(() =>
  import('@/pages/workspace/stats-page').then((module) => ({
    default: module.StatsPage,
  })),
)

function RouteLoading() {
  return (
    <div
      aria-label="Đang tải trang"
      className="mx-auto mt-12 h-32 w-[min(90%,40rem)] animate-pulse rounded-2xl bg-sidebar"
      role="status"
    />
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Outlet />,
    children: [
      {
        path: 'login',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: 'register',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <RegisterPage />
          </Suspense>
        ),
      },
      {
        path: 'verify-email',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <VerifyEmailPage />
          </Suspense>
        ),
      },
      {
        path: 'forgot-password',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <ForgotPasswordPage />
          </Suspense>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <Suspense fallback={<RouteLoading />}>
            <ResetPasswordPage />
          </Suspense>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: (
              <Suspense fallback={<RouteLoading />}>
                <AppShell />
              </Suspense>
            ),
            children: [
              { index: true, element: <Navigate replace to="/app/inbox" /> },
              {
                path: 'app/inbox',
                element: <TaskListPage mode="inbox" />,
              },
              {
                path: 'app/today',
                element: <TaskListPage mode="today" />,
              },
              {
                path: 'app/upcoming',
                element: <TaskListPage mode="upcoming" />,
              },
              {
                path: 'app/projects/:projectId',
                element: <TaskListPage mode="project" />,
              },
              {
                path: 'app/labels',
                element: (
                  <RoutePreview
                    description="Nhóm công việc bằng những nhãn phù hợp với cách bạn làm việc."
                    title="Nhãn"
                  />
                ),
              },
              {
                path: 'app/labels/:labelId',
                element: (
                  <RoutePreview
                    description="Tìm những công việc được gắn cùng một nhãn."
                    title="Nhãn"
                  />
                ),
              },
              {
                path: 'stats',
                element: (
                  <Suspense fallback={<RouteLoading />}>
                    <StatsPage />
                  </Suspense>
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate replace to="/app/inbox" /> },
    ],
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
