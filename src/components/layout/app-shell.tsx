import { lazy, Suspense } from 'react'
import {
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sun,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { useCurrentUser, useLogout } from '@/hooks/use-auth'
import { useProjects } from '@/hooks/use-workspace'
import { friendlyApiMessage } from '@/services/api/errors'
import { useUiStore } from '@/stores/ui-store'

const QuickAddDialog = lazy(() =>
  import('@/components/tasks/quick-add-dialog').then((module) => ({
    default: module.QuickAddDialog,
  })),
)
const TaskDetailDialog = lazy(() =>
  import('@/components/tasks/task-detail-dialog').then((module) => ({
    default: module.TaskDetailDialog,
  })),
)

const titles: Record<string, string> = {
  '/app/inbox': 'Hộp thư đến',
  '/app/today': 'Hôm nay',
  '/app/upcoming': 'Sắp tới',
  '/app/labels': 'Nhãn',
  '/stats': 'Thống kê',
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/app/projects/')) {
    return 'Dự án'
  }

  if (pathname.startsWith('/app/labels/')) {
    return 'Nhãn'
  }

  return titles[pathname] ?? 'Không gian của bạn'
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')
  const quickAddTriggerRef = useRef<HTMLButtonElement>(null)
  const quickAddWasOpenRef = useRef(false)
  const { data: authResult } = useCurrentUser()
  const logout = useLogout()
  const projectsQuery = useProjects()
  const collapsed = useUiStore((state) => state.isSidebarCollapsed)
  const mobileOpen = useUiStore((state) => state.isMobileSidebarOpen)
  const theme = useUiStore((state) => state.theme)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const openMobileSidebar = useUiStore((state) => state.openMobileSidebar)
  const closeMobileSidebar = useUiStore((state) => state.closeMobileSidebar)
  const setTheme = useUiStore((state) => state.setTheme)
  const openQuickAdd = useUiStore((state) => state.openQuickAdd)
  const isQuickAddOpen = useUiStore((state) => state.isQuickAddOpen)
  const activeTaskId = useUiStore((state) => state.activeTaskId)
  const quickAddProjectId =
    /^\/app\/projects\/([^/]+)$/.exec(location.pathname)?.[1]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    closeMobileSidebar()
  }, [closeMobileSidebar, location.pathname])

  useEffect(() => {
    if (isQuickAddOpen) {
      quickAddWasOpenRef.current = true
      return
    }
    if (!quickAddWasOpenRef.current) return

    quickAddWasOpenRef.current = false
    const frame = window.requestAnimationFrame(() =>
      quickAddTriggerRef.current?.focus(),
    )
    return () => window.cancelAnimationFrame(frame)
  }, [isQuickAddOpen])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
      ) {
        return
      }
      if (
        event.key.toLocaleLowerCase() === 'q' &&
        !useUiStore.getState().isQuickAddOpen &&
        !useUiStore.getState().activeTaskId
      ) {
        event.preventDefault()
        openQuickAdd()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [openQuickAdd])

  if (!authResult) {
    return null
  }

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <AppSidebar
        collapsed={collapsed}
        isLoggingOut={logout.isPending}
        isLoadingProjects={projectsQuery.isPending}
        onRetryProjects={() => void projectsQuery.refetch()}
        projectLoadError={
          projectsQuery.isError
            ? friendlyApiMessage(projectsQuery.error)
            : undefined
        }
        mobileOpen={mobileOpen}
        onClose={closeMobileSidebar}
        onLogout={() =>
          logout.mutate(undefined, {
            onSuccess: () => {
              setLogoutError('')
              navigate('/login', { replace: true })
            },
            onError: (error: unknown) =>
              setLogoutError(friendlyApiMessage(error)),
          })
        }
        user={authResult.user}
        projects={projectsQuery.data ?? []}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[62px] shrink-0 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Mở thanh điều hướng"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink md:hidden"
              onClick={openMobileSidebar}
              type="button"
            >
              <Menu aria-hidden="true" size={19} />
            </button>
            <button
              aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
              aria-pressed={collapsed}
              className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink md:flex"
              onClick={toggleSidebar}
              type="button"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" size={18} />
              ) : (
                <PanelLeftClose aria-hidden="true" size={18} />
              )}
            </button>
            <span className="truncate text-[13px] font-medium text-ink/80">
              {getPageTitle(location.pathname)}
            </span>
          </div>
          <button
            aria-keyshortcuts="Q"
            aria-label="Thêm task nhanh (Q)"
            className="mr-2 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-9"
            onClick={openQuickAdd}
            ref={quickAddTriggerRef}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            <span className="hidden sm:inline">Thêm nhanh</span>
          </button>
          <button
            aria-label={theme === 'light' ? 'Bật giao diện tối' : 'Bật giao diện sáng'}
            aria-pressed={theme === 'dark'}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink md:size-9"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            type="button"
          >
            {theme === 'light' ? (
              <Moon aria-hidden="true" size={18} />
            ) : (
              <Sun aria-hidden="true" size={18} />
            )}
          </button>
        </header>
        {logoutError && (
          <p
            className="border-b border-destructive/20 bg-destructive/5 px-6 py-2 text-sm text-destructive"
            role="alert"
          >
            {logoutError}
          </p>
        )}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <Suspense fallback={null}>
        {isQuickAddOpen && (
          <QuickAddDialog defaultProjectId={quickAddProjectId} />
        )}
        {activeTaskId && <TaskDetailDialog />}
      </Suspense>
    </div>
  )
}
