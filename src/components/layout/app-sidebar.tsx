import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  Check,
  CircleUserRound,
  GripVertical,
  Inbox,
  LogOut,
  Tags,
  X,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { CSSProperties } from 'react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useReorderProjects } from '@/hooks/use-workspace'
import { friendlyApiMessage } from '@/services/api/errors'
import type { AuthUser } from '@/types/auth'
import type { Project } from '@/types/workspace'

interface AppSidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onClose: () => void
  user: AuthUser
  onLogout: () => void
  isLoggingOut: boolean
  projects: Project[]
  isLoadingProjects: boolean
  projectLoadError?: string
  onRetryProjects: () => void
}

const primaryLinks = [
  { label: 'Hộp thư đến', to: '/app/inbox', Icon: Inbox },
  { label: 'Hôm nay', to: '/app/today', Icon: CalendarDays },
  { label: 'Sắp tới', to: '/app/upcoming', Icon: CalendarRange },
]

const utilityLinks = [
  { label: 'Thống kê', to: '/stats', Icon: ChartNoAxesCombined },
  { label: 'Nhãn', to: '/app/labels', Icon: Tags },
]

function SortableProjectLink({
  project,
  onClose,
}: {
  project: Project
  onClose: () => void
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: project.id })
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <div className="flex items-center gap-1" ref={setNodeRef} style={style}>
      <button
        {...attributes}
        {...listeners}
        aria-label={`Sắp xếp dự án: ${project.name}`}
        className="flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-7"
        ref={setActivatorNodeRef}
        type="button"
      >
        <GripVertical aria-hidden="true" size={14} />
      </button>
      <NavLink
        className={({ isActive }) =>
          `flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-[13px] transition-colors ${
            isActive
              ? 'bg-accent-soft font-medium text-accent'
              : 'text-ink/75 hover:bg-ink/5 hover:text-ink'
          }`
        }
        onClick={onClose}
        title={project.name}
        to={`/app/projects/${project.id}`}
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-sm bg-forest"
          style={
            project.color
              ? { backgroundColor: project.color }
              : undefined
          }
        />
        <span className="truncate">{project.name}</span>
      </NavLink>
    </div>
  )
}

export function AppSidebar({
  collapsed,
  mobileOpen,
  onClose,
  user,
  onLogout,
  isLoggingOut,
  projects,
  isLoadingProjects,
  projectLoadError,
  onRetryProjects,
}: AppSidebarProps) {
  const reorderProjects = useReorderProjects()
  const [projectOrderError, setProjectOrderError] = useState('')
  const sidebarRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const width = collapsed ? 'md:w-[76px]' : 'md:w-[252px]'
  const mobilePosition = mobileOpen
    ? 'translate-x-0'
    : '-translate-x-full md:translate-x-0'
  const orderedProjects = projects.filter((project) => !project.isInbox)

  useEffect(() => {
    if (!mobileOpen) {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
      return
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen, onClose])

  async function handleProjectDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const oldIndex = orderedProjects.findIndex(
      (project) => project.id === String(active.id),
    )
    const newIndex = orderedProjects.findIndex(
      (project) => project.id === String(over.id),
    )
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(orderedProjects, oldIndex, newIndex)
    setProjectOrderError('')
    try {
      await reorderProjects.mutateAsync({
        orderedProjectIds: reordered.map((project) => project.id),
      })
    } catch (error) {
      setProjectOrderError(friendlyApiMessage(error))
    }
  }

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Đóng thanh điều hướng"
          className="fixed inset-0 z-20 cursor-default bg-black/30 md:hidden"
          onClick={onClose}
          type="button"
        />
      )}
      <aside
        aria-label="Điều hướng chính"
        aria-modal={mobileOpen ? true : undefined}
        className={`fixed inset-y-0 left-0 z-30 flex w-[280px] shrink-0 flex-col border-r border-line bg-sidebar px-3 py-5 transition-[width,transform] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 md:px-3 ${width} ${mobilePosition}`}
        ref={sidebarRef}
        role={mobileOpen ? 'dialog' : undefined}
      >
        <div
          className={`mb-7 flex h-10 items-center ${collapsed ? 'md:justify-center' : 'justify-between px-2'}`}
        >
          <NavLink
            aria-label="Nếp — về Hộp thư đến"
            className="flex items-center gap-2.5 rounded-md"
            onClick={onClose}
            to="/app/inbox"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
              <Check aria-hidden="true" size={19} strokeWidth={2.7} />
            </span>
            <span
              className={`font-display text-[22px] font-semibold tracking-[-0.04em] text-ink ${collapsed ? 'md:hidden' : ''}`}
            >
              Nếp
            </span>
          </NavLink>
          <button
            aria-label="Đóng thanh điều hướng"
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-ink/5 hover:text-ink md:hidden"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Không gian làm việc">
          {primaryLinks.map(({ label, to, Icon }) => (
            <NavLink
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${collapsed ? 'md:justify-center md:px-0' : ''} ${
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink/75 hover:bg-ink/5 hover:text-ink'
                }`
              }
              key={to}
              onClick={onClose}
              title={collapsed ? label : undefined}
              to={to}
            >
              <Icon aria-hidden="true" className="shrink-0" size={18} />
              <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
            </NavLink>
          ))}

          <div
            className={`mb-1 mt-8 flex items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${collapsed ? 'md:justify-center md:px-0' : ''}`}
          >
            <span className={collapsed ? 'md:hidden' : ''}>Không gian</span>
          </div>
          <div className={`flex flex-col gap-1 ${collapsed ? 'md:hidden' : ''}`}>
            {isLoadingProjects ? (
              <div aria-label="Đang tải dự án" className="space-y-2 px-3 py-2" role="status">
                <div aria-hidden="true" className="h-3 w-2/3 animate-pulse rounded bg-ink/10" />
                <div aria-hidden="true" className="h-3 w-1/2 animate-pulse rounded bg-ink/10" />
              </div>
            ) : projectLoadError ? (
              <div className="space-y-2 px-3 py-2 text-xs text-destructive" role="alert">
                <p>{projectLoadError}</p>
                <button
                  className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onRetryProjects}
                  type="button"
                >
                  Tải lại danh sách project
                </button>
              </div>
            ) : orderedProjects.length > 0 ? (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={(event) => void handleProjectDragEnd(event)}
                sensors={sensors}
              >
                <SortableContext
                  items={orderedProjects.map((project) => project.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedProjects.map((project) => (
                    <SortableProjectLink
                      key={project.id}
                      onClose={onClose}
                      project={project}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground/80">
                Chưa có dự án nào
              </div>
            )}
            {projectOrderError && (
              <p className="px-3 py-1 text-[11px] text-destructive" role="alert">
                {projectOrderError}
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
            {utilityLinks.map(({ label, to, Icon }) => (
              <NavLink
                aria-label={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${collapsed ? 'md:justify-center md:px-0' : ''} ${
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink/75 hover:bg-ink/5 hover:text-ink'
                  }`
                }
                key={to}
                onClick={onClose}
                title={collapsed ? label : undefined}
                to={to}
              >
                <Icon aria-hidden="true" className="shrink-0" size={18} />
                <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
              </NavLink>
            ))}
            <div
              className={`mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-ink/75 ${collapsed ? 'md:justify-center md:px-0' : ''}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted-foreground">
                <CircleUserRound aria-hidden="true" size={17} />
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-xs font-medium ${collapsed ? 'md:hidden' : ''}`}
              >
                {user.displayName}
              </span>
              <button
                aria-label="Đăng xuất"
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-ink/5 hover:text-ink disabled:opacity-50 ${collapsed ? 'md:hidden' : ''}`}
                disabled={isLoggingOut}
                onClick={onLogout}
                title="Đăng xuất"
                type="button"
              >
                <LogOut aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
        </nav>
      </aside>
    </>
  )
}
