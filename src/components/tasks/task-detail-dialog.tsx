import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarDays,
  Check,
  MessageCircle,
  Plus,
  Repeat2,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import {
  useCreateComment,
  useCreateLabel,
  useCreateTask,
  useDeleteComment,
  useLabels,
  useProjects,
  useProjectSections,
  useSetTaskStatus,
  useTasks,
  useTaskComments,
  useUndoTaskStatusChange,
  useUpdateTask,
  useWorkspaceIdentity,
} from '@/hooks/use-workspace'
import { formatDueDate } from '@/lib/dates'
import { friendlyApiMessage } from '@/services/api/errors'
import { useUiStore } from '@/stores/ui-store'
import { useDialogFocus } from '@/hooks/use-dialog-focus'
import type {
  TaskListItem,
  TaskStatus,
  TaskStatusChange,
} from '@/types/workspace'

const taskDetailsSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề không được để trống.').max(500),
  description: z.string().max(20_000, 'Mô tả không thể dài quá 20.000 ký tự.'),
  projectId: z.string().min(1, 'Hãy chọn project.'),
  sectionId: z.string(),
  dueDate: z.string(),
  dueTime: z.string(),
  priority: z.coerce.number().int().min(1).max(4),
  recurrenceFrequency: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']),
  recurrenceInterval: z.coerce.number().int().min(1).max(365),
  labelIds: z.array(z.string()),
})

type TaskDetailsInput = z.input<typeof taskDetailsSchema>
type TaskDetailsValues = z.output<typeof taskDetailsSchema>

const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: 'Chưa làm',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Đã hoàn thành',
}

function recurrenceValues(rule: string | null) {
  if (!rule) return { frequency: 'NONE' as const, interval: 1 }
  const entries = Object.fromEntries(
    rule.split(';').map((part) => part.split('=')).filter((part) => part.length === 2),
  )
  const frequency = entries.FREQ
  if (
    frequency !== 'DAILY' &&
    frequency !== 'WEEKLY' &&
    frequency !== 'MONTHLY'
  ) {
    return { frequency: 'NONE' as const, interval: 1 }
  }
  return {
    frequency,
    interval: Math.max(1, Number.parseInt(entries.INTERVAL ?? '1', 10) || 1),
  }
}

function taskDepth(task: TaskListItem, tasks: TaskListItem[]) {
  let depth = 0
  let parentId = task.parentTaskId
  const seen = new Set([task.id])
  while (parentId && depth < 4) {
    if (seen.has(parentId)) return 4
    seen.add(parentId)
    const parent = tasks.find((candidate) => candidate.id === parentId)
    if (!parent) break
    depth += 1
    parentId = parent.parentTaskId
  }
  return depth
}

function localTime(value: string) {
  return value.slice(0, 5)
}

export function TaskDetailDialog() {
  const taskId = useUiStore((state) => state.activeTaskId)
  const closeDetails = useUiStore((state) => state.closeTaskDetails)
  const dialogRef = useRef<HTMLElement>(null)
  const openDetails = useUiStore((state) => state.openTaskDetails)
  const identity = useWorkspaceIdentity()
  const tasksQuery = useTasks()
  const projectsQuery = useProjects()
  const labelsQuery = useLabels()
  const task = tasksQuery.data?.find((candidate) => candidate.id === taskId)
  const [commentText, setCommentText] = useState('')
  const [newLabelName, setNewLabelName] = useState('')
  const [formError, setFormError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [labelError, setLabelError] = useState('')
  const [undoNotice, setUndoNotice] = useState<{
    title: string
    change: TaskStatusChange
  } | null>(null)
  const initializedTaskId = useRef<string | null>(null)
  const methods = useForm<TaskDetailsInput, unknown, TaskDetailsValues>({
    resolver: zodResolver(taskDetailsSchema),
    defaultValues: {
      title: '',
      description: '',
      projectId: '',
      sectionId: '',
      dueDate: '',
      dueTime: '',
      priority: 4,
      recurrenceFrequency: 'NONE',
      recurrenceInterval: 1,
      labelIds: [],
    },
  })
  const projectId = useWatch({
    control: methods.control,
    name: 'projectId',
  }) || task?.projectId || ''
  const selectedLabels =
    useWatch({
      control: methods.control,
      name: 'labelIds',
    }) ?? []
  const sectionsQuery = useProjectSections(projectId)
  const commentsQuery = useTaskComments(task?.id ?? null)
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const setTaskStatus = useSetTaskStatus()
  const undoTaskStatus = useUndoTaskStatusChange()
  const createComment = useCreateComment(task?.id ?? null)
  const deleteComment = useDeleteComment(task?.id ?? null)
  const createLabel = useCreateLabel()
  const recurrenceFrequency = useWatch({
    control: methods.control,
    name: 'recurrenceFrequency',
  })

  useDialogFocus(Boolean(taskId), dialogRef, closeDetails)

  useEffect(() => {
    if (!taskId) {
      initializedTaskId.current = null
      return
    }
    if (!task || initializedTaskId.current === task.id) return
    initializedTaskId.current = task.id
    const recurrence = recurrenceValues(task.recurrenceRule)
    methods.reset({
      title: task.title,
      description: task.description ?? '',
      projectId: task.projectId,
      sectionId: task.sectionId ?? '',
      dueDate: task.dueDate ?? '',
      dueTime: task.dueTime ? localTime(task.dueTime) : '',
      priority: task.priority,
      recurrenceFrequency: recurrence.frequency,
      recurrenceInterval: recurrence.interval,
      labelIds: task.labels.map((label) => label.id),
    })
  }, [methods, task, taskId])

  useEffect(() => {
    if (!taskId) return
    methods.setFocus('title')
  }, [methods, taskId])

  useEffect(() => {
    if (!undoNotice) return
    const timer = window.setTimeout(() => setUndoNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [undoNotice])

  const projects = projectsQuery.data ?? []
  const labels = labelsQuery.data ?? []
  const sections = sectionsQuery.data ?? []
  const children = useMemo(
    () =>
      (tasksQuery.data ?? []).filter(
        (candidate) =>
          candidate.parentTaskId === task?.id &&
          candidate.deletedAt === null,
      ),
    [task?.id, tasksQuery.data],
  )
  const depth = task ? taskDepth(task, tasksQuery.data ?? []) : 0
  const detailTask = task

  if (!taskId) return null

  function close() {
    setFormError('')
    setCommentError('')
    setLabelError('')
    closeDetails()
  }

  async function save(values: TaskDetailsValues) {
    if (!detailTask) return
    setFormError('')
    if (values.dueTime && !values.dueDate) {
      methods.setError('dueTime', {
        message: 'Chọn ngày đến hạn trước khi nhập giờ.',
      })
      return
    }
    if (values.recurrenceFrequency !== 'NONE' && !values.dueDate) {
      methods.setError('dueDate', {
        message: 'Task lặp cần có ngày đến hạn.',
      })
      return
    }
    const recurrenceRule =
      values.recurrenceFrequency === 'NONE'
        ? null
        : `FREQ=${values.recurrenceFrequency};INTERVAL=${values.recurrenceInterval}`
    try {
      await updateTask.mutateAsync({
        taskId: detailTask.id,
        title: values.title,
        description: values.description.trim() || null,
        projectId: values.projectId,
        sectionId: values.sectionId || null,
        parentTaskId: detailTask.parentTaskId,
        priority: values.priority,
        dueDate: values.dueDate || null,
        dueTime: values.dueTime ? `${values.dueTime}:00` : null,
        recurrenceRule,
        labelIds: values.labelIds,
      })
      close()
    } catch (error) {
      setFormError(friendlyApiMessage(error))
    }
  }

  async function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detailTask) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const title = String(formData.get('subtaskTitle') ?? '').trim()
    if (!title) return
    try {
      const currentTask = tasksQuery.data?.find(
        (candidate) => candidate.id === detailTask.id,
      )
      if (!currentTask) return
      await createTask.mutateAsync({
        title,
        description: null,
        projectId: currentTask.projectId,
        sectionId: currentTask.sectionId,
        parentTaskId: currentTask.id,
        priority: 4,
        dueDate: null,
        dueTime: null,
        recurrenceRule: null,
        labelIds: [],
      })
      form.reset()
    } catch (error) {
      setFormError(friendlyApiMessage(error))
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detailTask || !commentText.trim()) return
    setCommentError('')
    try {
      await createComment.mutateAsync({
        taskId: detailTask.id,
        content: commentText.trim(),
      })
      setCommentText('')
    } catch (error) {
      setCommentError(friendlyApiMessage(error))
    }
  }

  async function undoTaskCompletion() {
    if (!undoNotice) return
    setFormError('')
    try {
      await undoTaskStatus.mutateAsync(undoNotice.change)
      setUndoNotice(null)
      const result = await tasksQuery.refetch()
      if (result.isError) {
        setFormError(friendlyApiMessage(result.error))
        return
      }
      const updatedTask = result.data?.find(
        (candidate) => candidate.id === undoNotice.change.tasks[0]?.id,
      )
      if (!updatedTask) return
      if (!methods.getFieldState('dueDate').isDirty) {
        methods.setValue('dueDate', updatedTask.dueDate ?? '')
      }
      if (!methods.getFieldState('dueTime').isDirty) {
        methods.setValue(
          'dueTime',
          updatedTask.dueTime ? localTime(updatedTask.dueTime) : '',
        )
      }
    } catch (error) {
      setFormError(friendlyApiMessage(error))
    }
  }

  async function addLabel() {
    if (!newLabelName.trim()) return
    setLabelError('')
    try {
      const label = await createLabel.mutateAsync({
        name: newLabelName.trim(),
        color: null,
      })
      methods.setValue(
        'labelIds',
        [...methods.getValues('labelIds'), label.id],
        { shouldDirty: true },
      )
      setNewLabelName('')
    } catch (error) {
      setLabelError(friendlyApiMessage(error))
    }
  }

  function toggleLabel(labelId: string) {
    methods.setValue(
      'labelIds',
      selectedLabels.includes(labelId)
        ? selectedLabels.filter((value) => value !== labelId)
        : [...selectedLabels, labelId],
      { shouldDirty: true },
    )
  }

  const completionAction = detailTask?.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'
  const due = detailTask
    ? formatDueDate(detailTask.dueDate, detailTask.dueTime, identity?.timezone ?? 'UTC')
    : null
  const parentTask = detailTask?.parentTaskId
    ? tasksQuery.data?.find((candidate) => candidate.id === detailTask.parentTaskId)
    : null

  function changeTaskStatus(status: TaskStatus) {
    if (!detailTask) return
    setTaskStatus.mutate(
      { taskId: detailTask.id, status },
      {
        onSuccess: async (change) => {
          const result = await tasksQuery.refetch()
          if (result.isError) {
            setFormError(friendlyApiMessage(result.error))
            return
          }
          const updatedTask = result.data?.find(
            (changedTask) => changedTask.id === detailTask.id,
          )
          if (!updatedTask) return
          if (status === 'COMPLETED') {
            setUndoNotice({ title: detailTask.title, change })
          }
          if (!methods.getFieldState('dueDate').isDirty) {
            methods.setValue('dueDate', updatedTask.dueDate ?? '')
          }
          if (!methods.getFieldState('dueTime').isDirty) {
            methods.setValue(
              'dueTime',
              updatedTask.dueTime ? localTime(updatedTask.dueTime) : '',
            )
          }
        },
        onError: (error) => setFormError(friendlyApiMessage(error)),
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/35 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="task-detail-title"
        aria-modal="true"
        className="flex h-full w-full max-w-[620px] flex-col border-l border-line bg-surface shadow-2xl"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {projects.find((project) => project.id === detailTask?.projectId)?.name ??
                'Project'}
            </span>
            {due && (
              <>
                <span aria-hidden="true">/</span>
                <span className={due.overdue ? 'text-destructive' : ''}>
                  {due.label}
                </span>
              </>
            )}
          </div>
          <button
            aria-label="Đóng chi tiết task"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink md:size-9"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {!detailTask ? (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">
                {tasksQuery.isPending
                  ? 'Đang tải task…'
                  : 'Task không còn tồn tại hoặc không thuộc tài khoản này.'}
              </p>
              {tasksQuery.isError && (
                <button
                  className="mt-3 text-sm font-medium text-accent underline"
                  onClick={() => void tasksQuery.refetch()}
                  type="button"
                >
                  Thử tải lại
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="flex items-start gap-3">
                <button
                  aria-label={`${detailTask.status === 'COMPLETED' ? 'Mở lại' : 'Hoàn thành'} task`}
                  className={`mt-2 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    detailTask.status === 'COMPLETED'
                      ? 'border-forest bg-forest text-primary-foreground'
                      : 'border-accent text-accent'
                  }`}
                  disabled={setTaskStatus.isPending}
                  onClick={() => changeTaskStatus(completionAction)}
                  type="button"
                >
                  {detailTask.status === 'COMPLETED' && (
                    <Check aria-hidden="true" size={12} />
                  )}
                </button>
                <h2
                  className="font-display text-[25px] font-semibold leading-tight tracking-[-0.03em] text-ink"
                  id="task-detail-title"
                >
                  {detailTask.title}
                </h2>
              </div>

              {parentTask && (
                <p className="ml-8 mt-2 text-xs text-muted-foreground">
                  Task cha:{' '}
                  <button
                    className="font-medium text-accent hover:underline"
                    onClick={() => openDetails(parentTask.id)}
                    type="button"
                  >
                    {parentTask.title}
                  </button>
                </p>
              )}

              <form
                className="mt-6 space-y-5"
                onSubmit={methods.handleSubmit(save)}
              >
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-muted-foreground"
                    htmlFor="detail-title"
                  >
                    Tiêu đề
                  </label>
                  <input
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="detail-title"
                    maxLength={500}
                    {...methods.register('title')}
                  />
                  {methods.formState.errors.title && (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {methods.formState.errors.title.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-muted-foreground"
                    htmlFor="detail-description"
                  >
                    Mô tả
                  </label>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="detail-description"
                    placeholder="Thêm thông tin chi tiết…"
                    {...methods.register('description')}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      htmlFor="detail-project"
                    >
                      Project
                    </label>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="detail-project"
                      disabled={Boolean(detailTask.parentTaskId)}
                      onChange={(event) => {
                        methods.setValue('projectId', event.target.value)
                        methods.setValue('sectionId', '')
                      }}
                      value={projectId}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      htmlFor="detail-section"
                    >
                      Section
                    </label>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="detail-section"
                      {...methods.register('sectionId')}
                    >
                      <option value="">Không thuộc section</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_0.8fr]">
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      htmlFor="detail-due-date"
                    >
                      <CalendarDays aria-hidden="true" className="mr-1 inline" size={13} />
                      Ngày đến hạn
                    </label>
                    <input
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="detail-due-date"
                      type="date"
                      {...methods.register('dueDate')}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      htmlFor="detail-due-time"
                    >
                      Giờ (tùy chọn)
                    </label>
                    <input
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="detail-due-time"
                      type="time"
                      {...methods.register('dueTime')}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-medium text-muted-foreground"
                      htmlFor="detail-priority"
                    >
                      Ưu tiên
                    </label>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="detail-priority"
                      {...methods.register('priority')}
                    >
                      <option value={1}>P1</option>
                      <option value={2}>P2</option>
                      <option value={3}>P3</option>
                      <option value={4}>P4</option>
                    </select>
                  </div>
                </div>
                {(methods.formState.errors.dueDate ||
                  methods.formState.errors.dueTime) && (
                  <p className="text-xs text-destructive" role="alert">
                    {methods.formState.errors.dueDate?.message ??
                      methods.formState.errors.dueTime?.message}
                  </p>
                )}

                <fieldset>
                  <legend className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Tag aria-hidden="true" size={13} />
                    Nhãn
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {labels.map((label) => {
                      const selected = selectedLabels.includes(label.id)
                      return (
                        <button
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                            selected
                              ? 'border-accent/40 bg-accent-soft text-accent'
                              : 'border-line bg-background text-muted-foreground hover:text-ink'
                          }`}
                          key={label.id}
                          onClick={() => toggleLabel(label.id)}
                          type="button"
                        >
                          {selected && <Check aria-hidden="true" size={12} />}
                          {label.name}
                        </button>
                      )
                    })}
                    {labelsQuery.isError && (
                      <button
                        className="text-xs text-destructive underline"
                        onClick={() => void labelsQuery.refetch()}
                        type="button"
                      >
                        Không tải được nhãn — thử lại
                      </button>
                    )}
                  </div>
                  <div
                    className="mt-2 flex gap-2"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void addLabel()
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor="new-label-name">
                      Tạo nhãn mới
                    </label>
                    <input
                      className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="new-label-name"
                      maxLength={80}
                      onChange={(event) => setNewLabelName(event.target.value)}
                      placeholder="Tạo nhãn mới"
                      value={newLabelName}
                    />
                    <button
                      aria-label="Thêm nhãn mới"
                      className="flex size-9 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-sidebar hover:text-accent disabled:opacity-50"
                      disabled={createLabel.isPending || !newLabelName.trim()}
                      onClick={() => void addLabel()}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  {labelError && (
                    <p className="mt-1 text-xs text-destructive" role="alert">
                      {labelError}
                    </p>
                  )}
                </fieldset>

                <fieldset className="rounded-xl border border-line bg-background p-4">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    <Repeat2 aria-hidden="true" className="mr-1 inline" size={13} />
                    Lặp lịch
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                    <label className="sr-only" htmlFor="recurrence-frequency">
                      Tần suất lặp
                    </label>
                    <select
                      className="h-10 rounded-lg border border-input bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="recurrence-frequency"
                      {...methods.register('recurrenceFrequency')}
                    >
                      <option value="NONE">Không lặp</option>
                      <option value="DAILY">Hàng ngày</option>
                      <option value="WEEKLY">Hàng tuần</option>
                      <option value="MONTHLY">Hàng tháng</option>
                    </select>
                    {recurrenceFrequency !== 'NONE' && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        Mỗi
                        <input
                          className="h-10 w-16 rounded-lg border border-input bg-surface px-2 text-center text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          max={365}
                          min={1}
                          type="number"
                          {...methods.register('recurrenceInterval')}
                        />
                        {recurrenceFrequency === 'DAILY'
                          ? 'ngày'
                          : recurrenceFrequency === 'WEEKLY'
                            ? 'tuần'
                            : 'tháng'}
                      </label>
                    )}
                  </div>
                  {detailTask.recurrenceRule && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      RRULE: {detailTask.recurrenceRule}
                    </p>
                  )}
                </fieldset>

                {formError && (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}
                <button
                  className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  disabled={updateTask.isPending}
                  type="submit"
                >
                  {updateTask.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </form>

              <section aria-labelledby="subtasks-title" className="mt-8 border-t border-line pt-5">
                <h3
                  className="text-sm font-semibold text-ink"
                  id="subtasks-title"
                >
                  Công việc con
                  {children.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {children.length}
                    </span>
                  )}
                </h3>
                {children.map((child) => (
                  <button
                    className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left text-sm text-ink transition hover:bg-sidebar"
                    key={child.id}
                    onClick={() => openDetails(child.id)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-3.5 rounded-full border ${
                        child.status === 'COMPLETED'
                          ? 'border-forest bg-forest'
                          : 'border-muted-foreground'
                      }`}
                    />
                    <span className="flex-1">{child.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {taskStatusLabels[child.status]}
                    </span>
                  </button>
                ))}
                {depth < 2 ? (
                  <form className="mt-3 flex gap-2" onSubmit={addSubtask}>
                    <label className="sr-only" htmlFor="new-subtask-title">
                      Tên công việc con
                    </label>
                    <input
                      className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      id="new-subtask-title"
                      maxLength={500}
                      name="subtaskTitle"
                      placeholder="Thêm công việc con"
                    />
                    <button
                      aria-label="Thêm công việc con"
                      className="flex size-10 items-center justify-center rounded-lg border border-line text-muted-foreground hover:bg-sidebar hover:text-accent disabled:opacity-50"
                      disabled={createTask.isPending}
                      type="submit"
                    >
                      <Plus aria-hidden="true" size={16} />
                    </button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Đã đạt giới hạn 3 cấp sub-task.
                  </p>
                )}
              </section>

              <section aria-labelledby="comments-title" className="mt-8 border-t border-line pt-5">
                <h3
                  className="flex items-center gap-2 text-sm font-semibold text-ink"
                  id="comments-title"
                >
                  <MessageCircle aria-hidden="true" size={16} />
                  Bình luận
                  <span className="text-xs font-normal text-muted-foreground">
                    {commentsQuery.data?.length ?? 0}
                  </span>
                </h3>
                {commentsQuery.isPending ? (
                  <p className="mt-4 animate-pulse text-xs text-muted-foreground">
                    Đang tải bình luận…
                  </p>
                ) : commentsQuery.isError ? (
                  <div className="mt-4 text-xs text-destructive" role="alert">
                    <p>{friendlyApiMessage(commentsQuery.error)}</p>
                    <button
                      className="mt-1 underline"
                      onClick={() => void commentsQuery.refetch()}
                      type="button"
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : commentsQuery.data?.length ? (
                  <div className="mt-3 space-y-3">
                    {commentsQuery.data.map((comment) => (
                      <article
                        className="rounded-xl border border-line bg-background p-3"
                        key={comment.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                            {comment.content}
                          </p>
                          <button
                            aria-label="Xóa bình luận"
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={deleteComment.isPending}
                            onClick={() => deleteComment.mutate(comment.id)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </button>
                        </div>
                        <time
                          className="mt-2 block text-[10px] text-muted-foreground"
                          dateTime={comment.createdAt}
                        >
                          {new Intl.DateTimeFormat('vi-VN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(comment.createdAt))}
                        </time>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Chưa có bình luận nào.
                  </p>
                )}
                <form className="mt-4 flex items-end gap-2" onSubmit={submitComment}>
                  <label className="sr-only" htmlFor="new-comment-content">
                    Viết bình luận
                  </label>
                  <textarea
                    className="min-h-11 flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="new-comment-content"
                    maxLength={10_000}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Viết bình luận…"
                    value={commentText}
                  />
                  <button
                    aria-label="Gửi bình luận"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    disabled={createComment.isPending || !commentText.trim()}
                    type="submit"
                  >
                    <Send aria-hidden="true" size={15} />
                  </button>
                </form>
                {commentError && (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    {commentError}
                  </p>
                )}
              </section>
            </div>
            <footer className="flex shrink-0 items-center justify-between border-t border-line bg-sidebar/40 px-5 py-3 text-[11px] text-muted-foreground">
              <span>
                Trạng thái: {taskStatusLabels[detailTask.status]}
                {detailTask.recurrenceRule && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <Repeat2 aria-hidden="true" size={12} />
                    Lặp lại
                  </span>
                )}
              </span>
              <span>
                Ưu tiên P{detailTask.priority}
                {detailTask.status !== 'COMPLETED' && (
                  <button
                    className="ml-3 font-medium text-accent hover:underline"
                    disabled={setTaskStatus.isPending}
                    onClick={() =>
                      changeTaskStatus(
                        detailTask.status === 'TODO' ? 'IN_PROGRESS' : 'TODO',
                      )
                    }
                    type="button"
                  >
                    {detailTask.status === 'TODO' ? 'Bắt đầu' : 'Đưa về TODO'}
                  </button>
                )}
              </span>
            </footer>
          </>
        )}
      </section>
      {undoNotice && (
        <div
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[70] flex w-[min(92vw,460px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-background shadow-xl"
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">
            Đã hoàn thành “{undoNotice.title}”
          </span>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-accent transition hover:bg-white/10 disabled:opacity-50"
            disabled={undoTaskStatus.isPending}
            onClick={() => void undoTaskCompletion()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            {undoTaskStatus.isPending ? 'Đang hoàn tác' : 'Hoàn tác'}
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
