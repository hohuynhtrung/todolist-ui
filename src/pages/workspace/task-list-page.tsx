import {
  AlertCircle,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
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
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TaskRow } from '@/components/tasks/task-row'
import {
  useCreateSection,
  useDeleteSection,
  useProjectSections,
  useProjects,
  useReorderTasks,
  useSetTaskStatus,
  useTasks,
  useUndoTaskStatusChange,
  useUpdateSection,
  useWorkspaceIdentity,
} from '@/hooks/use-workspace'
import { formatDueDate, localDateInTimezone, shiftLocalDate } from '@/lib/dates'
import { friendlyApiMessage } from '@/services/api/errors'
import { useUiStore } from '@/stores/ui-store'
import type {
  Project,
  Section,
  TaskListItem,
  TaskStatusChange,
} from '@/types/workspace'

export type TaskListMode = 'inbox' | 'project' | 'today' | 'upcoming'

interface TaskListPageProps {
  mode: TaskListMode
}

interface UndoNotice {
  title: string
  change: TaskStatusChange
}

function LoadingTasks() {
  return (
    <div aria-label="Đang tải công việc" className="mt-10 animate-pulse space-y-3" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          aria-hidden="true"
          className="flex items-center gap-3 border-b border-line px-2 py-4"
          key={index}
        >
          <div className="size-5 rounded-full bg-sidebar" />
          <div className="h-3 w-2/3 rounded bg-sidebar" />
        </div>
      ))}
    </div>
  )
}

function ErrorState({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  return (
    <section className="mt-10 rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center" role="alert">
      <AlertCircle aria-hidden="true" className="mx-auto text-destructive" size={24} />
      <h2 className="mt-3 font-display text-lg font-semibold text-ink">
        Chưa thể tải danh sách
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {friendlyApiMessage(error)}
      </p>
      <Button
        className="mt-5 rounded-lg"
        onClick={retry}
        type="button"
        variant="outline"
      >
        Thử lại
      </Button>
    </section>
  )
}

function EmptyState({ mode }: { mode: TaskListMode }) {
  const message =
    mode === 'today'
      ? 'Hôm nay chưa có việc nào đến hạn. Bạn đang có khoảng trống để tập trung.'
      : mode === 'upcoming'
        ? 'Chưa có việc nào được lên lịch trong những ngày tới.'
        : 'Thêm việc đầu tiên vào không gian của bạn để bắt đầu sắp xếp.'
  return (
    <section
      aria-label="Danh sách trống"
      className="mt-10 flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/70 px-6 py-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <CheckCheck aria-hidden="true" size={23} strokeWidth={1.7} />
      </span>
      <h2 className="mt-4 font-display text-xl font-medium tracking-tight text-ink">
        {mode === 'today' ? 'Một ngày nhẹ nhàng' : 'Sẵn sàng cho bước tiếp theo'}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {message}
      </p>
    </section>
  )
}

function getTaskDepth(task: TaskListItem, taskById: Map<string, TaskListItem>) {
  let depth = 0
  let parentId = task.parentTaskId
  const seen = new Set<string>([task.id])
  while (parentId && depth < 3 && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = taskById.get(parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentTaskId
  }
  return depth
}

function sectionDropId(projectId: string, sectionId: string | null) {
  return `section-drop:${projectId}:${sectionId ?? 'none'}`
}

function SortableTaskList({
  tasks,
  childrenByParent,
  depth = 0,
  timezone,
  pendingTaskId,
  onToggleTask,
  onOpenDetails,
}: {
  tasks: TaskListItem[]
  childrenByParent: Map<string | null, TaskListItem[]>
  depth?: number
  timezone: string
  pendingTaskId?: string
  onToggleTask: (task: TaskListItem) => void
  onOpenDetails: (task: TaskListItem) => void
}) {
  return (
    <SortableContext
      items={tasks.map((task) => task.id)}
      strategy={verticalListSortingStrategy}
    >
      {tasks.map((task) => (
        <SortableTaskItem
          childrenByParent={childrenByParent}
          depth={depth}
          key={task.id}
          onOpenDetails={onOpenDetails}
          onToggleTask={onToggleTask}
          pendingTaskId={pendingTaskId}
          task={task}
          timezone={timezone}
        />
      ))}
    </SortableContext>
  )
}

function SortableTaskItem({
  task,
  childrenByParent,
  depth,
  timezone,
  pendingTaskId,
  onToggleTask,
  onOpenDetails,
}: {
  task: TaskListItem
  childrenByParent: Map<string | null, TaskListItem[]>
  depth: number
  timezone: string
  pendingTaskId?: string
  onToggleTask: (task: TaskListItem) => void
  onOpenDetails: (task: TaskListItem) => void
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task.id })
  const dragStyle: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`
      : undefined,
    transition,
    opacity: isDragging ? 0.35 : undefined,
  }
  const dragHandle: ReactNode = (
    <button
      {...attributes}
      {...listeners}
      aria-label={`Sắp xếp: ${task.title}`}
      className="flex size-9 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-accent-soft hover:text-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-7 md:opacity-0 md:group-hover:opacity-100"
      ref={setActivatorNodeRef}
      type="button"
    >
      <GripVertical aria-hidden="true" size={15} />
    </button>
  )

  return (
    <div ref={setNodeRef} style={dragStyle}>
      <TaskRow
        depth={depth}
        dragHandle={dragHandle}
        onOpenDetails={onOpenDetails}
        onToggle={onToggleTask}
        pending={pendingTaskId === task.id}
        task={task}
        timezone={timezone}
      />
      <SortableTaskList
        childrenByParent={childrenByParent}
        depth={Math.min(depth + 1, 3)}
        onOpenDetails={onOpenDetails}
        onToggleTask={onToggleTask}
        pendingTaskId={pendingTaskId}
        tasks={childrenByParent.get(task.id) ?? []}
        timezone={timezone}
      />
    </div>
  )
}

function SectionGroup({
  project,
  section,
  tasks,
  timezone,
  showCompleted,
  pendingTaskId,
  onToggleTask,
  onOpenDetails,
  onSectionChanged,
  onSectionDeleted,
  onDeleteSection,
  onUpdateSection,
}: {
  project: Project
  section: Section | null
  tasks: TaskListItem[]
  timezone: string
  showCompleted: boolean
  pendingTaskId?: string
  onToggleTask: (task: TaskListItem) => void
  onOpenDetails: (task: TaskListItem) => void
  onSectionChanged: () => void
  onSectionDeleted: () => void
  onDeleteSection: (sectionId: string) => Promise<void>
  onUpdateSection: (sectionId: string, name: string) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [name, setName] = useState(section?.name ?? '')
  const createSection = useCreateSection(project.id)
  const [sectionError, setSectionError] = useState('')
  const { isOver, setNodeRef } = useDroppable({
    id: sectionDropId(project.id, section?.id ?? null),
  })
  const visibleTasks = tasks
    .filter((task) => showCompleted || task.status !== 'COMPLETED')
    .filter((task) => task.sectionId === (section?.id ?? null))
  const taskById = new Map(visibleTasks.map((task) => [task.id, task]))
  const childrenByParent = new Map<string | null, TaskListItem[]>()
  for (const task of visibleTasks) {
    const parentId =
      task.parentTaskId && taskById.has(task.parentTaskId)
        ? task.parentTaskId
        : null
    const children = childrenByParent.get(parentId) ?? []
    children.push(task)
    childrenByParent.set(parentId, children)
  }
  const rootTasks = (childrenByParent.get(null) ?? []).sort(
    (left, right) => left.position - right.position,
  )

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSectionError('')
    try {
      await createSection.mutateAsync({ projectId: project.id, name: trimmed })
      setName('')
      setAdding(false)
      onSectionChanged()
    } catch (error) {
      setSectionError(friendlyApiMessage(error))
    }
  }

  async function updateSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!section) return
    const trimmed = name.trim()
    if (!trimmed) return
    setSectionError('')
    try {
      await onUpdateSection(section.id, trimmed)
      setEditing(false)
    } catch (error) {
      setSectionError(friendlyApiMessage(error))
    }
  }

  async function deleteSection() {
    if (!section) return
    const confirmed = window.confirm(
      `Xóa section "${section.name}" và các công việc trong section này?`,
    )
    if (!confirmed) return
    setSectionError('')
    try {
      await onDeleteSection(section.id)
      onSectionDeleted()
    } catch (error) {
      setSectionError(friendlyApiMessage(error))
    }
  }

  return (
    <section
      aria-label={section?.name ?? 'Không thuộc section'}
      className={`mt-7 rounded-lg transition-colors ${isOver ? 'bg-accent-soft/50' : ''}`}
      ref={setNodeRef}
    >
      <div className="flex min-h-9 items-center gap-2">
        {editing && section ? (
          <form className="flex flex-1 items-center gap-2" onSubmit={updateSection}>
            <label className="sr-only" htmlFor={`section-${section.id}`}>
              Tên section
            </label>
            <input
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              id={`section-${section.id}`}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <Button className="h-9 rounded-md" disabled={!name.trim()} type="submit">
              Lưu
            </Button>
            <Button
              aria-label="Hủy sửa"
              className="size-9 rounded-md p-0"
              onClick={() => {
                setName(section.name)
                setEditing(false)
                setSectionError('')
              }}
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          </form>
        ) : (
          <>
            <button
              aria-expanded={!collapsed}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left"
              onClick={() => setCollapsed((current) => !current)}
              type="button"
            >
              {collapsed ? (
                <ChevronRight aria-hidden="true" size={15} />
              ) : (
                <ChevronDown aria-hidden="true" size={15} />
              )}
              <span className="truncate text-[13px] font-semibold text-ink">
                {section?.name ?? 'Chưa phân loại'}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {visibleTasks.length}
              </span>
            </button>
            {section && (
              <>
                <button
                  aria-label={`Đổi tên section ${section.name}`}
                  className="flex size-11 items-center justify-center rounded-md text-xs text-muted-foreground transition hover:bg-sidebar hover:text-ink md:size-8"
                  onClick={() => {
                    setName(section.name)
                    setEditing(true)
                  }}
                  type="button"
                >
                  <span aria-hidden="true">···</span>
                </button>
                <button
                  aria-label={`Xóa section ${section.name}`}
                  className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive md:size-8"
                  onClick={() => void deleteSection()}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </>
            )}
          </>
        )}
      </div>
      {sectionError && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {sectionError}
        </p>
      )}
      {!collapsed && (
        <div className="ml-1 border-l border-line pl-1">
          {visibleTasks.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Chưa có việc nào trong nhóm này.
            </p>
          ) : (
            <SortableTaskList
              childrenByParent={childrenByParent}
              onOpenDetails={onOpenDetails}
              onToggleTask={onToggleTask}
              pendingTaskId={pendingTaskId}
              tasks={rootTasks}
              timezone={timezone}
            />
          )}
        </div>
      )}
      {adding && (
        <form className="mt-2 flex items-center gap-2" onSubmit={addSection}>
          <label className="sr-only" htmlFor={`new-section-${project.id}`}>
            Tên section mới
          </label>
          <input
            autoFocus
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            id={`new-section-${project.id}`}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Tên section"
            value={name}
          />
          <Button
            className="h-9 rounded-md"
            disabled={createSection.isPending || !name.trim()}
            type="submit"
          >
            Thêm
          </Button>
          <Button
            aria-label="Hủy thêm section"
            className="size-9 rounded-md p-0"
            onClick={() => {
              setAdding(false)
              setName('')
              setSectionError('')
            }}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </form>
      )}
      {!section && !project.isInbox && (
        <button
          className="mt-2 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-sidebar hover:text-accent"
          onClick={() => {
            setName('')
            setAdding(true)
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          Thêm section
        </button>
      )}
    </section>
  )
}

function DateGroup({
  title,
  tasks,
  timezone,
  pendingTaskId,
  showCompleted,
  onToggleTask,
  onOpenDetails,
}: {
  title: string
  tasks: TaskListItem[]
  timezone: string
  pendingTaskId?: string
  showCompleted: boolean
  onToggleTask: (task: TaskListItem) => void
  onOpenDetails: (task: TaskListItem) => void
}) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  return (
    <section className="mt-7">
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="ml-1 border-l border-line pl-1">
        {tasks
          .filter((task) => showCompleted || task.status !== 'COMPLETED')
          .map((task) => (
            <TaskRow
              depth={getTaskDepth(task, taskById)}
              key={task.id}
              onToggle={onToggleTask}
              onOpenDetails={onOpenDetails}
              pending={pendingTaskId === task.id}
              task={task}
              timezone={timezone}
            />
          ))}
      </div>
    </section>
  )
}

export function TaskListPage({ mode }: TaskListPageProps) {
  const { projectId: routeProjectId } = useParams()
  const identity = useWorkspaceIdentity()
  const projectsQuery = useProjects()
  const tasksQuery = useTasks()
  const project =
    mode === 'inbox'
      ? projectsQuery.data?.find((candidate) => candidate.isInbox)
      : mode === 'project'
        ? projectsQuery.data?.find(
            (candidate) =>
              candidate.id === routeProjectId && !candidate.isInbox,
          )
        : undefined
  const sectionsQuery = useProjectSections(
    mode === 'inbox' || mode === 'project' ? project?.id ?? '' : '',
  )
  const updateSection = useUpdateSection(project?.id ?? '')
  const deleteSection = useDeleteSection(project?.id ?? '')
  const statusChange = useSetTaskStatus()
  const reorderTasks = useReorderTasks()
  const undoChange = useUndoTaskStatusChange()
  const openTaskDetails = useUiStore((state) => state.openTaskDetails)
  const [showCompleted, setShowCompleted] = useState(false)
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null)
  const [listActionError, setListActionError] = useState('')
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (!undoNotice) return
    const timer = window.setTimeout(() => setUndoNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [undoNotice])

  const projectTasks = useMemo(
    () =>
      (tasksQuery.data ?? []).filter(
        (task) => !project || task.projectId === project.id,
      ),
    [project, tasksQuery.data],
  )

  const groups = useMemo(() => {
    if (!project) return []
    const activeSections = sectionsQuery.data ?? []
    const sectionIds = new Set(activeSections.map((section) => section.id))
    const unsectioned = projectTasks.filter(
      (task) => task.sectionId === null || !sectionIds.has(task.sectionId),
    )
    return [
      { section: null, tasks: unsectioned },
      ...activeSections.map((section) => ({
        section,
        tasks: projectTasks.filter((task) => task.sectionId === section.id),
      })),
    ]
  }, [project, projectTasks, sectionsQuery.data])

  const datedGroups = useMemo(() => {
    if (!identity || (mode !== 'today' && mode !== 'upcoming')) return []
    const today = localDateInTimezone(identity.timezone)
    const endDate = shiftLocalDate(today, 30)
    const relevant = projectTasks.filter((task) => {
      if (!task.dueDate) return false
      if (mode === 'today') {
        return task.dueDate <= today
      }
      return task.dueDate > today && task.dueDate <= endDate
    })
    const grouped = new Map<string, TaskListItem[]>()
    for (const task of relevant) {
      if (!task.dueDate) continue
      const current = grouped.get(task.dueDate) ?? []
      current.push(task)
      grouped.set(task.dueDate, current)
    }
    return Array.from(grouped.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, tasks]) => {
        const label = formatDueDate(date, null, identity.timezone)?.label ?? date
        return {
          date,
          label:
            mode === 'today' && date < today
              ? `Quá hạn · ${label}`
              : label,
          tasks: tasks.sort((left, right) => left.position - right.position),
        }
      })
  }, [identity, mode, projectTasks])

  const visibleCount =
    mode === 'today' || mode === 'upcoming'
      ? datedGroups.reduce(
          (sum, group) =>
            sum +
            group.tasks.filter(
              (task) => showCompleted || task.status !== 'COMPLETED',
            ).length,
          0,
        )
      : groups.reduce(
          (sum, group) =>
            sum +
            group.tasks.filter(
              (task) => showCompleted || task.status !== 'COMPLETED',
            ).length,
          0,
        )

  const pageTitle =
    mode === 'inbox'
      ? 'Hộp thư đến'
      : mode === 'today'
        ? 'Hôm nay'
        : mode === 'upcoming'
          ? 'Sắp tới'
          : project?.name ?? 'Dự án'
  const description =
    mode === 'inbox'
      ? 'Gom những việc vừa xuất hiện vào một nơi để bạn sắp xếp sau.'
      : mode === 'today'
        ? 'Việc quá hạn và những điều cần hoàn thành trong hôm nay.'
        : mode === 'upcoming'
          ? 'Một cái nhìn gọn gàng về những ngày sắp tới.'
          : 'Tập trung các công việc liên quan trong cùng một dự án.'

  async function toggleTask(task: TaskListItem) {
    setListActionError('')
    setUndoNotice(null)
    try {
      const change = await statusChange.mutateAsync({
        taskId: task.id,
        status: task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED',
      })
      if (task.status !== 'COMPLETED') {
        setUndoNotice({ title: task.title, change })
      }
    } catch (error) {
      setListActionError(friendlyApiMessage(error))
    }
  }

  async function undoCompletion() {
    if (!undoNotice) return
    setListActionError('')
    try {
      await undoChange.mutateAsync(undoNotice.change)
      setUndoNotice(null)
    } catch (error) {
      setListActionError(friendlyApiMessage(error))
    }
  }

  async function handleTaskDragEnd({ active, over }: DragEndEvent) {
    if (!project || !over || active.id === over.id) return
    const activeTask = projectTasks.find((task) => task.id === String(active.id))
    if (!activeTask) return
    const visibleTask = (task: TaskListItem) =>
      showCompleted || task.status !== 'COMPLETED'
    const sourceSiblings = projectTasks
      .filter(
        (task) =>
          task.sectionId === activeTask.sectionId &&
          task.parentTaskId === activeTask.parentTaskId &&
          visibleTask(task),
      )
      .sort((left, right) => left.position - right.position)
    const overId = String(over.id)
    const overTask = projectTasks.find((task) => task.id === overId)
    const sectionTarget = groups.find(
      (group) =>
        project &&
        sectionDropId(project.id, group.section?.id ?? null) === overId,
    )
    let destinationSectionId = activeTask.sectionId
    let destinationParentTaskId = activeTask.parentTaskId
    let sourceOrderedTaskIds: string[]
    let destinationOrderedTaskIds: string[]

    if (overTask && overTask.sectionId === activeTask.sectionId &&
      overTask.parentTaskId === activeTask.parentTaskId) {
      const oldIndex = sourceSiblings.findIndex((task) => task.id === activeTask.id)
      const newIndex = sourceSiblings.findIndex((task) => task.id === overTask.id)
      if (oldIndex < 0 || newIndex < 0) return
      const orderedIds = arrayMove(
        sourceSiblings.map((task) => task.id),
        oldIndex,
        newIndex,
      )
      sourceOrderedTaskIds = orderedIds
      destinationOrderedTaskIds = orderedIds
    } else {
      if (
        activeTask.parentTaskId ||
        (overTask && overTask.parentTaskId !== null)
      ) {
        return
      }
      if (sectionTarget) {
        destinationSectionId = sectionTarget.section?.id ?? null
      } else if (overTask) {
        destinationSectionId = overTask.sectionId
      } else {
        return
      }
      if (destinationSectionId === activeTask.sectionId) return
      destinationParentTaskId = null
      sourceOrderedTaskIds = sourceSiblings
        .filter((task) => task.id !== activeTask.id)
        .map((task) => task.id)
      const destinationSiblings = projectTasks
        .filter(
          (task) =>
            task.sectionId === destinationSectionId &&
            task.parentTaskId === null &&
            visibleTask(task),
        )
        .sort((left, right) => left.position - right.position)
      const insertionIndex = overTask
        ? destinationSiblings.findIndex((task) => task.id === overTask.id)
        : destinationSiblings.length
      const destination = [...destinationSiblings]
      destination.splice(
        insertionIndex < 0 ? destination.length : insertionIndex,
        0,
        activeTask,
      )
      destinationOrderedTaskIds = destination.map((task) => task.id)
    }

    setListActionError('')
    try {
      await reorderTasks.mutateAsync({
        taskId: activeTask.id,
        destinationSectionId,
        destinationParentTaskId,
        sourceOrderedTaskIds,
        destinationOrderedTaskIds,
      })
    } catch (error) {
      setListActionError(friendlyApiMessage(error))
    }
  }

  const isPending =
    projectsQuery.isPending ||
    tasksQuery.isPending ||
    ((mode === 'inbox' || mode === 'project') &&
      Boolean(project) &&
      sectionsQuery.isPending)
  const errorQuery = projectsQuery.isError
    ? projectsQuery
    : tasksQuery.isError
      ? tasksQuery
      : sectionsQuery.isError
        ? sectionsQuery
        : null
  const retryQuery = () => {
    if (projectsQuery.isError) void projectsQuery.refetch()
    if (tasksQuery.isError) void tasksQuery.refetch()
    if (sectionsQuery.isError) void sectionsQuery.refetch()
  }
  const shouldShowTaskContent =
    mode === 'today' || mode === 'upcoming' || Boolean(project)

  return (
    <div className="mx-auto w-full max-w-[980px] px-5 pb-24 pt-9 sm:px-8 md:px-12 md:pt-12">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest">
        {mode === 'project' ? 'Dự án' : 'Không gian của bạn'}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-[40px]">
            {pageTitle}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {!isPending && !errorQuery && (
          <button
            aria-pressed={showCompleted}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
              showCompleted
                ? 'border-accent/30 bg-accent-soft text-accent'
                : 'border-line bg-surface text-muted-foreground hover:text-ink'
            }`}
            onClick={() => setShowCompleted((current) => !current)}
            type="button"
          >
            <CheckCheck aria-hidden="true" size={15} />
            {showCompleted ? 'Ẩn việc đã xong' : 'Việc đã xong'}
          </button>
        )}
      </div>

      {listActionError && (
        <p
          className="mt-5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {listActionError}
        </p>
      )}

      {mode === 'project' && !isPending && !project && (
        <section className="mt-10 rounded-2xl border border-line bg-surface px-6 py-10 text-center">
          <h2 className="font-display text-lg font-semibold text-ink">
            Không tìm thấy dự án
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dự án có thể đã bị xóa hoặc không thuộc không gian của bạn.
          </p>
        </section>
      )}

      {isPending && <LoadingTasks />}

      {errorQuery && (
        <ErrorState error={errorQuery.error} retry={retryQuery} />
      )}

      {!isPending && !errorQuery && shouldShowTaskContent && (
        <div className="mt-5">
          {mode === 'inbox' || mode === 'project' ? (
            project ? (
            <>
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={(event) => void handleTaskDragEnd(event)}
                sensors={dragSensors}
              >
                {groups.map((group) => (
                  <SectionGroup
                    key={group.section?.id ?? 'unsectioned'}
                    onDeleteSection={async (sectionId) => {
                      await deleteSection.mutateAsync(sectionId)
                    }}
                    onSectionChanged={() => {
                      void sectionsQuery.refetch()
                    }}
                    onSectionDeleted={() => {
                      void tasksQuery.refetch()
                    }}
                    onToggleTask={(task) => void toggleTask(task)}
                    onOpenDetails={(task) => openTaskDetails(task.id)}
                    onUpdateSection={async (sectionId, name) => {
                      await updateSection.mutateAsync({ sectionId, name })
                    }}
                    pendingTaskId={
                      statusChange.isPending
                        ? statusChange.variables?.taskId
                        : undefined
                    }
                    project={project}
                    section={group.section}
                    showCompleted={showCompleted}
                    tasks={group.tasks}
                    timezone={identity?.timezone ?? 'UTC'}
                  />
                ))}
              </DndContext>
            </>
            ) : null
          ) : (
            datedGroups.map((group) => (
              <DateGroup
                key={group.date}
                onToggleTask={(task) => void toggleTask(task)}
                onOpenDetails={(task) => openTaskDetails(task.id)}
                pendingTaskId={
                  statusChange.isPending
                    ? statusChange.variables?.taskId
                    : undefined
                }
                showCompleted={showCompleted}
                tasks={group.tasks}
                title={group.label}
                timezone={identity?.timezone ?? 'UTC'}
              />
            ))
          )}
          {visibleCount === 0 && (
            <EmptyState mode={mode} />
          )}
          <p className="mt-7 text-right text-[11px] text-muted-foreground">
            {visibleCount} việc {showCompleted ? 'trong danh sách' : 'đang mở'}
          </p>
        </div>
      )}

      {undoNotice && (
        <div
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-40 flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-background shadow-xl"
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">
            Đã hoàn thành “{undoNotice.title}”
          </span>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-accent transition hover:bg-white/10 disabled:opacity-50"
            disabled={undoChange.isPending}
            onClick={() => void undoCompletion()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            {undoChange.isPending ? 'Đang hoàn tác' : 'Hoàn tác'}
          </button>
          <button
            aria-label="Đóng thông báo"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-background/70 transition hover:bg-white/10 hover:text-background"
            onClick={() => setUndoNotice(null)}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
