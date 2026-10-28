import { useCurrentUser } from '@/hooks/use-auth'
import { friendlyApiMessage } from '@/services/api/errors'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

export function RequireAuth() {
  const { data, isPending, isError, error, refetch } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return (
      <main
        aria-label="Đang kiểm tra phiên đăng nhập"
        className="grid min-h-screen place-items-center bg-canvas px-6"
      >
        <div className="w-full max-w-sm animate-pulse space-y-4">
          <div className="mx-auto size-11 rounded-2xl bg-accent-soft" />
          <div className="mx-auto h-4 w-44 rounded bg-sidebar" />
          <div className="mx-auto h-3 w-56 rounded bg-sidebar" />
        </div>
      </main>
    )
  }

  if (isError) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-6">
        <section
          aria-labelledby="session-error-title"
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm"
        >
          <h1
            className="font-display text-2xl font-semibold text-ink"
            id="session-error-title"
          >
            Chưa thể kiểm tra đăng nhập
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {friendlyApiMessage(error)}
          </p>
          <button
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            onClick={() => void refetch()}
            type="button"
          >
            Thử lại
          </button>
        </section>
      </main>
    )
  }

  if (!data) {
    return (
      <Navigate
        replace
        state={{ from: location.pathname }}
        to="/login"
      />
    )
  }

  return <Outlet />
}
