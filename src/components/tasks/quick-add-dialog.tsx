import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarDays, Check, ChevronDown, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  useCreateTask,
  useLabels,
  useProjects,
  useProjectSections,
  useWorkspaceIdentity,
} from '@/hooks/use-workspace'
import { parseNaturalDate } from '@/lib/dates'
import { friendlyApiMessage } from '@/services/api/errors'
import { useUiStore } from '@/stores/ui-store'
import { useDialogFocus } from '@/hooks/use-dialog-focus'

const quickAddSchema = z.object({
  title: z.string().trim().min(1, 'Hãy nhập tiêu đề task.').max(500),
  description: z.string().max(20_000, 'Mô tả không thể dài quá 20.000 ký tự.'),
  dueDate: z.string(),
  dueTime: z.string(),
  priority: z.coerce.number().int().min(1).max(4),
  projectId: z.string().min(1, 'Hãy chọn project.'),
  sectionId: z.string(),
})

type QuickAddInput = z.input<typeof quickAddSchema>
type QuickAddValues = z.output<typeof quickAddSchema>

interface QuickAddDialogProps {
  defaultProjectId?: string
}

export function QuickAddDialog({ defaultProjectId }: QuickAddDialogProps) {
  const isOpen = useUiStore((state) => state.isQuickAddOpen)
  const close = useUiStore((state) => state.closeQuickAdd)
  const dialogRef = useRef<HTMLElement>(null)
  const identity = useWorkspaceIdentity()
  const projectsQuery = useProjects()
  const labelsQuery = useLabels()
  const createTask = useCreateTask()
  const projects = projectsQuery.data ?? []
  const initialProject =
    projects.find((project) => project.id === defaultProjectId) ??
    projects.find((project) => project.isInbox)
  const [projectId, setProjectId] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [formError, setFormError] = useState('')
  const methods = useForm<QuickAddInput, unknown, QuickAddValues>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      title: '',
      description: '',
      dueDate: '',
      dueTime: '',
      priority: 4,
      projectId: '',
      sectionId: '',
    },
  })
  const activeProjectId = projectId || initialProject?.id || ''
  const selectedProject = projects.find(
    (project) => project.id === activeProjectId,
  )
  const sectionsQuery = useProjectSections(
    selectedProject && !selectedProject.isInbox ? selectedProject.id : '',
  )
  const sections = sectionsQuery.data ?? []

  useDialogFocus(isOpen, dialogRef, close)

  useEffect(() => {
    if (
      isOpen &&
      initialProject &&
      !methods.getValues('projectId')
    ) {
      methods.setValue('projectId', initialProject.id)
    }
  }, [initialProject, isOpen, methods])

  const labelOptions = useMemo(
    () => labelsQuery.data ?? [],
    [labelsQuery.data],
  )

  if (!isOpen) return null

  async function submit(values: QuickAddValues) {
    setFormError('')
    const dueDate = values.dueDate.trim()
      ? parseNaturalDate(values.dueDate, identity?.timezone ?? 'UTC')
      : null
    if (values.dueDate.trim() && !dueDate) {
      methods.setError('dueDate', {
        message: 'Dùng YYYY-MM-DD, “tomorrow”, “ngày mai” hoặc ngày trong tuần.',
      })
      return
    }
    if (values.dueTime && !dueDate) {
      methods.setError('dueTime', {
        message: 'Chọn ngày đến hạn trước khi nhập giờ.',
      })
      return
    }

    try {
      await createTask.mutateAsync({
        title: values.title,
        description: values.description.trim() || null,
        projectId: values.projectId,
        sectionId: values.sectionId || null,
        priority: values.priority,
        dueDate,
        dueTime: values.dueTime ? `${values.dueTime}:00` : null,
        recurrenceRule: null,
        labelIds: selectedLabels,
      })
      methods.reset({
        title: '',
        description: '',
        dueDate: '',
        dueTime: '',
        priority: 4,
        projectId: values.projectId,
        sectionId: values.sectionId,
      })
      setSelectedLabels([])
      close()
    } catch (error) {
      setFormError(friendlyApiMessage(error))
    }
  }

  function onProjectChange(nextProjectId: string) {
    setProjectId(nextProjectId)
    methods.setValue('projectId', nextProjectId, { shouldValidate: true })
    methods.setValue('sectionId', '')
  }

  function toggleLabel(labelId: string) {
    setSelectedLabels((current) =>
      current.includes(labelId)
        ? current.filter((value) => value !== labelId)
        : [...current, labelId],
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-3 py-[8vh] backdrop-blur-[2px] sm:px-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      role="presentation"
    >
      <section
        aria-labelledby="quick-add-title"
        aria-modal="true"
        className="max-h-[84dvh] w-full max-w-[620px] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <form onSubmit={methods.handleSubmit(submit)}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-forest">
                Thêm vào danh sách
              </p>
              <h2
                className="mt-1 font-display text-xl font-semibold text-ink"
                id="quick-add-title"
              >
                Tạo task mới
              </h2>
            </div>
            <button
              aria-label="Đóng Thêm nhanh"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar hover:text-ink md:size-9"
              onClick={close}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <label className="sr-only" htmlFor="quick-add-title-input">
                Tiêu đề task
              </label>
              <input
                className="h-12 w-full rounded-lg border border-input bg-background px-3.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
                data-autofocus
                id="quick-add-title-input"
                maxLength={500}
                placeholder="Việc cần làm…"
                {...methods.register('title')}
              />
              {methods.formState.errors.title && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {methods.formState.errors.title.message}
                </p>
              )}
            </div>
            <div>
              <label className="sr-only" htmlFor="quick-add-description">
                Mô tả
              </label>
              <textarea
                className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/40"
                id="quick-add-description"
                placeholder="Thêm mô tả"
                {...methods.register('description')}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor="quick-add-due-date"
                >
                  Ngày đến hạn
                </label>
                <div className="relative">
                  <CalendarDays
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={15}
                  />
                  <input
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="quick-add-due-date"
                    placeholder="ngày mai, thứ 2…"
                    {...methods.register('dueDate')}
                  />
                </div>
                {methods.formState.errors.dueDate && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {methods.formState.errors.dueDate.message}
                  </p>
                )}
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor="quick-add-due-time"
                >
                  Giờ (không bắt buộc)
                </label>
                <input
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  id="quick-add-due-time"
                  type="time"
                  {...methods.register('dueTime')}
                />
                {methods.formState.errors.dueTime && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    {methods.formState.errors.dueTime.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor="quick-add-project"
                >
                  Project
                </label>
                <div className="relative">
                  <select
                    className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    id="quick-add-project"
                    value={activeProjectId}
                    onChange={(event) => onProjectChange(event.target.value)}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={15}
                  />
                </div>
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor="quick-add-priority"
                >
                  Ưu tiên
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  id="quick-add-priority"
                  {...methods.register('priority')}
                >
                  <option value={1}>P1 · Cao nhất</option>
                  <option value={2}>P2 · Cao</option>
                  <option value={3}>P3 · Bình thường</option>
                  <option value={4}>P4 · Thấp</option>
                </select>
              </div>
            </div>

            {sections.length > 0 && (
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                  htmlFor="quick-add-section"
                >
                  Section
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  id="quick-add-section"
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
            )}

            {labelOptions.length > 0 && (
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  Labels
                </legend>
                <div className="flex flex-wrap gap-2">
                  {labelOptions.map((label) => {
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
                </div>
              </fieldset>
            )}
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line bg-sidebar/40 px-5 py-4">
            <p className="text-[11px] text-muted-foreground">
              Ngày được tính theo múi giờ tài khoản.
            </p>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              disabled={createTask.isPending || projectsQuery.isPending || !projects.length}
              type="submit"
            >
              <Plus aria-hidden="true" size={16} />
              {createTask.isPending ? 'Đang tạo…' : 'Thêm task'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
