import { z } from 'zod'
import type {
  Comment,
  Label,
  Project,
  Section,
  StatsOverview,
  StatsOverviewInput,
  Task,
  TaskCompletion,
  TaskLabel,
  TaskListItem,
  TaskStatusChange,
  WorkspaceIdentity,
} from '@/types/workspace'
import type {
  CreateSectionInput,
  CreateCommentInput,
  CreateLabelInput,
  CreateTaskInput,
  ReorderProjectsInput,
  ReorderTasksInput,
  SetTaskStatusInput,
  UpdateSectionInput,
  UpdateTaskInput,
  WorkspaceApi,
} from '@/services/api/workspace-contract'
import { ApiError } from '@/services/api/errors'
import { isTaskOverdue, shiftLocalDate } from '@/lib/dates'

const STORAGE_PREFIX = 'nep.workspace.mock.v1'
interface MockWorkspace {
  projects: Project[]
  sections: Section[]
  tasks: Task[]
  labels: Label[]
  taskLabels: TaskLabel[]
  comments: Comment[]
  taskCompletions: TaskCompletion[]
}

const workspaceSchema = z.object({
  projects: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    isInbox: z.boolean(),
    position: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  })),
  sections: z.array(z.object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    position: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  })),
  tasks: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    projectId: z.string(),
    sectionId: z.string().nullable(),
    parentTaskId: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
    priority: z.number().int(),
    dueDate: z.string().nullable(),
    dueTime: z.string().nullable(),
    recurrenceRule: z.string().nullable(),
    position: z.number().int(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  })),
  labels: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    color: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  })),
  taskLabels: z.array(z.object({
    taskId: z.string(),
    labelId: z.string(),
    userId: z.string(),
    createdAt: z.string(),
  })),
  comments: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    userId: z.string(),
    content: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().nullable(),
  })),
  taskCompletions: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    userId: z.string(),
    projectId: z.string(),
    completedAt: z.string(),
    revertedAt: z.string().nullable(),
    dueDateSnapshot: z.string().nullable(),
    dueTimeSnapshot: z.string().nullable(),
  })),
})

function createUuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const timestamp = Date.now()
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Math.floor(timestamp / 256 ** (5 - index)) % 256
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function localDate(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function weekStart(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return shiftLocalDate(date, -((weekday + 6) % 7))
}

function assertStatsDateRange(input: StatsOverviewInput) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
    const candidate = new Date(Date.UTC(year, month - 1, day))
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() + 1 === month &&
      candidate.getUTCDate() === day
    )
  }
  if (
    !validDate(input.fromDate) ||
    !validDate(input.toDate) ||
    input.fromDate > input.toDate
  ) {
    throw new ApiError('UNKNOWN', 'Khoảng thời gian thống kê không hợp lệ.')
  }
  const rangeDays =
    (Date.parse(`${input.toDate}T00:00:00Z`) -
      Date.parse(`${input.fromDate}T00:00:00Z`)) /
    86_400_000
  if (rangeDays > 365) {
    throw new ApiError('UNKNOWN', 'Khoảng thống kê không thể dài hơn 366 ngày.')
  }
}

function dateOffset(date: string, offset: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + offset))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function dateByRecurrence(date: string, rule: string): string {
  const parsed = Object.fromEntries(
    rule
      .split(';')
      .map((part) => part.split('='))
      .filter((entry): entry is [string, string] => entry.length === 2),
  )
  const interval = Math.max(1, Number.parseInt(parsed.INTERVAL ?? '1', 10) || 1)
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const current = new Date(Date.UTC(year, month - 1, day))
  if (parsed.FREQ === 'DAILY') {
    current.setUTCDate(current.getUTCDate() + interval)
  } else if (parsed.FREQ === 'WEEKLY') {
    current.setUTCDate(current.getUTCDate() + interval * 7)
  } else if (parsed.FREQ === 'MONTHLY') {
    const targetMonth = current.getUTCMonth() + interval
    const targetYear = current.getUTCFullYear() + Math.floor(targetMonth / 12)
    const normalizedMonth = ((targetMonth % 12) + 12) % 12
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
    current.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDay))
  }
  return `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`
}

function taskDepth(tasks: Task[], task: Task): number {
  let depth = 0
  let parentId = task.parentTaskId
  const seen = new Set([task.id])
  while (parentId) {
    if (seen.has(parentId)) {
      throw new ApiError('UNKNOWN', 'Quan hệ task cha-con không hợp lệ.')
    }
    seen.add(parentId)
    const parent = tasks.find(
      (candidate) => candidate.id === parentId && candidate.deletedAt === null,
    )
    if (!parent) {
      throw new ApiError('UNKNOWN', 'Không tìm thấy task cha.')
    }
    depth += 1
    parentId = parent.parentTaskId
  }
  return depth
}

function emptyWorkspace(): MockWorkspace {
  return {
    projects: [],
    sections: [],
    tasks: [],
    labels: [],
    taskLabels: [],
    comments: [],
    taskCompletions: [],
  }
}

function makeProject(
  userId: string,
  name: string,
  isInbox: boolean,
  position: number,
  color: string | null = null,
): Project {
  const now = new Date().toISOString()
  return {
    id: createUuidV7(),
    userId,
    name,
    color,
    isInbox,
    position,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function makeSection(projectId: string, name: string, position: number): Section {
  const now = new Date().toISOString()
  return {
    id: createUuidV7(),
    projectId,
    name,
    position,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function makeTask(
  userId: string,
  projectId: string,
  title: string,
  options: Partial<Pick<Task, 'sectionId' | 'parentTaskId' | 'status' | 'priority' | 'dueDate' | 'dueTime' | 'position'>> = {},
): Task {
  const now = new Date().toISOString()
  const status = options.status ?? 'TODO'
  return {
    id: createUuidV7(),
    userId,
    projectId,
    sectionId: options.sectionId ?? null,
    parentTaskId: options.parentTaskId ?? null,
    title,
    description: null,
    status,
    priority: options.priority ?? 4,
    dueDate: options.dueDate ?? null,
    dueTime: options.dueTime ?? null,
    recurrenceRule: null,
    position: options.position ?? 1024,
    completedAt: status === 'COMPLETED' ? now : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

function seedWorkspace(identity: WorkspaceIdentity): MockWorkspace {
  const workspace = emptyWorkspace()
  const inbox = makeProject(identity.id, 'Hộp thư đến', true, 0)
  workspace.projects.push(inbox)

  if (identity.email !== 'demo@nep.local' && identity.email !== 'admin@nep.local') {
    return workspace
  }

  const personal = makeProject(identity.id, 'Cá nhân', false, 1024, '#879a6c')
  const learning = makeProject(identity.id, 'Học tập', false, 2048, '#c8795d')
  workspace.projects.push(personal, learning)
  const studySection = makeSection(learning.id, 'Tuần này', 1024)
  workspace.sections.push(studySection)

  const today = localDate(identity.timezone)
  const overdueTask = makeTask(identity.id, inbox.id, 'Chuẩn bị nội dung tuần mới', {
    priority: 1,
    dueDate: dateOffset(today, -1),
    position: 1024,
  })
  const todayTask = makeTask(identity.id, inbox.id, 'Gọi cho gia đình', {
    priority: 2,
    dueDate: today,
    dueTime: '19:30:00',
    position: 2048,
  })
  const childTask = makeTask(identity.id, inbox.id, 'Ghi lại vài điều muốn kể', {
    parentTaskId: todayTask.id,
    priority: 3,
    position: 1024,
  })
  const noDateTask = makeTask(identity.id, inbox.id, 'Ghi lại ý tưởng cuối tuần', {
    position: 3072,
  })
  const inProgressTask = makeTask(identity.id, personal.id, 'Sắp xếp danh sách đọc', {
    status: 'IN_PROGRESS',
    priority: 3,
    position: 1024,
  })
  const completedTask = makeTask(identity.id, inbox.id, 'Đọc lại kế hoạch tháng này', {
    status: 'COMPLETED',
    priority: 4,
    dueDate: today,
    position: 4096,
  })
  const learningTask = makeTask(identity.id, learning.id, 'Hoàn thành bài tập TypeScript', {
    sectionId: studySection.id,
    priority: 2,
    dueDate: dateOffset(today, 2),
    position: 1024,
  })
  workspace.tasks.push(
    overdueTask,
    todayTask,
    childTask,
    noDateTask,
    completedTask,
    inProgressTask,
    learningTask,
  )

  const focusLabel: Label = {
    id: createUuidV7(),
    userId: identity.id,
    name: 'Tập trung',
    color: '#c8795d',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
  const homeLabel: Label = {
    id: createUuidV7(),
    userId: identity.id,
    name: 'Gia đình',
    color: '#879a6c',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  }
  workspace.labels.push(focusLabel, homeLabel)
  workspace.taskLabels.push(
    {
      taskId: overdueTask.id,
      labelId: focusLabel.id,
      userId: identity.id,
      createdAt: new Date().toISOString(),
    },
    {
      taskId: todayTask.id,
      labelId: homeLabel.id,
      userId: identity.id,
      createdAt: new Date().toISOString(),
    },
  )
  workspace.comments.push({
    id: createUuidV7(),
    taskId: overdueTask.id,
    userId: identity.id,
    content: 'Nhớ rà lại ghi chú của tuần trước.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  })
  workspace.taskCompletions.push({
    id: createUuidV7(),
    taskId: completedTask.id,
    userId: identity.id,
    projectId: inbox.id,
    completedAt: completedTask.completedAt ?? new Date().toISOString(),
    revertedAt: null,
    dueDateSnapshot: completedTask.dueDate,
    dueTimeSnapshot: completedTask.dueTime,
  })
  return workspace
}

function readWorkspace(identity: WorkspaceIdentity): MockWorkspace {
  const key = `${STORAGE_PREFIX}:${identity.id}`
  const stored = window.localStorage.getItem(key)
  if (!stored) {
    const seeded = seedWorkspace(identity)
    writeWorkspace(identity, seeded)
    return seeded
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    throw new ApiError(
      'UNKNOWN',
      'Dữ liệu công việc mô phỏng bị lỗi. Hãy xóa dữ liệu trang web và tải lại.',
    )
  }
  const result = workspaceSchema.safeParse(parsed)
  if (!result.success) {
    throw new ApiError(
      'UNKNOWN',
      'Dữ liệu công việc mô phỏng không hợp lệ. Hãy xóa dữ liệu trang web và tải lại.',
    )
  }
  return result.data
}

function writeWorkspace(identity: WorkspaceIdentity, workspace: MockWorkspace) {
  window.localStorage.setItem(
    `${STORAGE_PREFIX}:${identity.id}`,
    JSON.stringify(workspace),
  )
}

function beforeRequest(): Promise<void> {
  const milliseconds = 200 + Math.floor(Math.random() * 301)
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (window.localStorage.getItem('nep.mock.failNext') === 'true') {
        window.localStorage.removeItem('nep.mock.failNext')
        reject(new ApiError('MOCK_FAILURE', 'Mock request failed.'))
        return
      }
      resolve()
    }, milliseconds)
  })
}

function requireProject(
  workspace: MockWorkspace,
  userId: string,
  projectId: string,
): Project {
  const project = workspace.projects.find(
    (candidate) =>
      candidate.id === projectId &&
      candidate.userId === userId &&
      candidate.deletedAt === null,
  )
  if (!project) {
    throw new ApiError('UNKNOWN', 'Không tìm thấy dự án này.')
  }
  return project
}

function descendants(tasks: Task[], taskId: string): Task[] {
  const children = tasks.filter(
    (task) => task.parentTaskId === taskId && task.deletedAt === null,
  )
  return children.flatMap((child) => [child, ...descendants(tasks, child.id)])
}

function createCompletion(task: Task, userId: string): TaskCompletion {
  return {
    id: createUuidV7(),
    taskId: task.id,
    userId,
    projectId: task.projectId,
    completedAt: task.completedAt ?? new Date().toISOString(),
    revertedAt: null,
    dueDateSnapshot: task.dueDate,
    dueTimeSnapshot: task.dueTime,
  }
}

function validateTaskInput(
  workspace: MockWorkspace,
  identity: WorkspaceIdentity,
  input: CreateTaskInput | UpdateTaskInput,
): { project: Project; parent: Task | null } {
  if (!input.title.trim() || input.title.length > 500) {
    throw new ApiError('UNKNOWN', 'Tiêu đề task cần có từ 1 đến 500 ký tự.')
  }
  if (!Number.isInteger(input.priority) || input.priority < 1 || input.priority > 4) {
    throw new ApiError('UNKNOWN', 'Mức ưu tiên phải nằm trong khoảng 1 đến 4.')
  }
  if (input.dueTime && !input.dueDate) {
    throw new ApiError('UNKNOWN', 'Cần chọn ngày trước khi nhập giờ đến hạn.')
  }
  if (input.recurrenceRule && !input.dueDate) {
    throw new ApiError('UNKNOWN', 'Task lặp cần có ngày đến hạn.')
  }
  const project = requireProject(workspace, identity.id, input.projectId)
  if (input.sectionId) {
    const section = workspace.sections.find(
      (candidate) =>
        candidate.id === input.sectionId &&
        candidate.projectId === project.id &&
        candidate.deletedAt === null,
    )
    if (!section || project.isInbox) {
      throw new ApiError('UNKNOWN', 'Section không thuộc dự án đã chọn.')
    }
  }
  const parent = input.parentTaskId
    ? workspace.tasks.find(
        (candidate) =>
          candidate.id === input.parentTaskId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      ) ?? null
    : null
  if (input.parentTaskId && !parent) {
    throw new ApiError('UNKNOWN', 'Không tìm thấy task cha.')
  }
  if (parent) {
    if (parent.projectId !== project.id) {
      throw new ApiError('UNKNOWN', 'Sub-task phải cùng project với task cha.')
    }
    if (taskDepth(workspace.tasks, parent) >= 2) {
      throw new ApiError('UNKNOWN', 'Sub-task chỉ hỗ trợ tối đa 3 cấp.')
    }
  }
  const labelIds = new Set(input.labelIds)
  const validLabelCount = workspace.labels.filter(
    (label) =>
      labelIds.has(label.id) &&
      label.userId === identity.id &&
      label.deletedAt === null,
  ).length
  if (validLabelCount !== labelIds.size) {
    throw new ApiError('UNKNOWN', 'Một hoặc nhiều label không hợp lệ.')
  }
  return { project, parent }
}

function replaceTaskLabels(
  workspace: MockWorkspace,
  identity: WorkspaceIdentity,
  taskId: string,
  labelIds: string[],
) {
  workspace.taskLabels = workspace.taskLabels.filter(
    (link) => link.taskId !== taskId || link.userId !== identity.id,
  )
  for (const labelId of new Set(labelIds)) {
    workspace.taskLabels.push({
      taskId,
      labelId,
      userId: identity.id,
      createdAt: new Date().toISOString(),
    })
  }
}

function reorderTaskSiblings(
  workspace: MockWorkspace,
  projectId: string,
  sectionId: string | null,
  parentTaskId: string | null,
  orderedTaskIds: string[],
  excludeTaskId?: string,
) {
  const siblings = workspace.tasks
    .filter(
      (task) =>
        task.projectId === projectId &&
        task.sectionId === sectionId &&
        task.parentTaskId === parentTaskId &&
        task.id !== excludeTaskId &&
        task.deletedAt === null,
    )
    .sort((left, right) => left.position - right.position)
  const byId = new Map(siblings.map((task) => [task.id, task]))
  const ordered = orderedTaskIds.flatMap((id) => {
    const task = byId.get(id)
    return task ? [task] : []
  })
  const orderedIds = new Set(ordered.map((task) => task.id))
  const remaining = siblings.filter((task) => !orderedIds.has(task.id))
  const now = new Date().toISOString()
  ;[...ordered, ...remaining].forEach((task, index) => {
    task.position = (index + 1) * 1024
    task.updatedAt = now
  })
}

export const mockWorkspaceApi: WorkspaceApi = {
  projects: {
    async list(identity) {
      await beforeRequest()
      return readWorkspace(identity).projects
        .filter((project) => project.deletedAt === null)
        .sort((left, right) => left.position - right.position)
    },
    async reorder(identity, input: ReorderProjectsInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const projects = workspace.projects.filter(
        (project) =>
          project.userId === identity.id &&
          !project.isInbox &&
          project.deletedAt === null,
      )
      const ids = new Set(input.orderedProjectIds)
      if (
        ids.size !== input.orderedProjectIds.length ||
        ids.size !== projects.length ||
        projects.some((project) => !ids.has(project.id))
      ) {
        throw new ApiError('UNKNOWN', 'Thứ tự dự án không hợp lệ.')
      }
      const projectById = new Map(projects.map((project) => [project.id, project]))
      const now = new Date().toISOString()
      input.orderedProjectIds.forEach((id, index) => {
        const project = projectById.get(id)
        if (!project) {
          throw new ApiError('UNKNOWN', 'Không tìm thấy dự án cần sắp xếp.')
        }
        project.position = (index + 1) * 1024
        project.updatedAt = now
      })
      writeWorkspace(identity, workspace)
    },
  },
  sections: {
    async list(identity, projectId) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      requireProject(workspace, identity.id, projectId)
      return workspace.sections
        .filter(
          (section) =>
            section.projectId === projectId && section.deletedAt === null,
        )
        .sort((left, right) => left.position - right.position)
    },
    async create(identity, input: CreateSectionInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const project = requireProject(workspace, identity.id, input.projectId)
      if (project.isInbox) {
        throw new ApiError('UNKNOWN', 'Hộp thư đến không thể có section.')
      }
      const name = input.name.trim()
      if (!name || name.length > 120) {
        throw new ApiError('UNKNOWN', 'Tên section cần có từ 1 đến 120 ký tự.')
      }
      const activeSections = workspace.sections.filter(
        (section) =>
          section.projectId === project.id && section.deletedAt === null,
      )
      const section = makeSection(
        project.id,
        name,
        (activeSections.at(-1)?.position ?? 0) + 1024,
      )
      workspace.sections.push(section)
      writeWorkspace(identity, workspace)
      return section
    },
    async update(identity, input: UpdateSectionInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const section = workspace.sections.find(
        (candidate) =>
          candidate.id === input.sectionId && candidate.deletedAt === null,
      )
      if (!section) {
        throw new ApiError('UNKNOWN', 'Không tìm thấy section này.')
      }
      const project = requireProject(workspace, identity.id, section.projectId)
      if (project.isInbox) {
        throw new ApiError('UNKNOWN', 'Hộp thư đến không thể có section.')
      }
      const name = input.name.trim()
      if (!name || name.length > 120) {
        throw new ApiError('UNKNOWN', 'Tên section cần có từ 1 đến 120 ký tự.')
      }
      section.name = name
      section.updatedAt = new Date().toISOString()
      writeWorkspace(identity, workspace)
      return section
    },
    async delete(identity, sectionId) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const section = workspace.sections.find(
        (candidate) => candidate.id === sectionId && candidate.deletedAt === null,
      )
      if (!section) {
        throw new ApiError('UNKNOWN', 'Không tìm thấy section này.')
      }
      const project = requireProject(workspace, identity.id, section.projectId)
      if (project.isInbox) {
        throw new ApiError('UNKNOWN', 'Hộp thư đến không thể có section.')
      }
      const now = new Date().toISOString()
      section.deletedAt = now
      section.updatedAt = now
      const sectionTasks = workspace.tasks.filter(
        (task) => task.sectionId === section.id && task.deletedAt === null,
      )
      const ids = new Set(
        sectionTasks.flatMap((task) => [
          task.id,
          ...descendants(workspace.tasks, task.id).map((child) => child.id),
        ]),
      )
      for (const task of workspace.tasks) {
        if (ids.has(task.id)) {
          task.deletedAt = now
          task.updatedAt = now
        }
      }
      writeWorkspace(identity, workspace)
    },
  },
  labels: {
    async list(identity) {
      await beforeRequest()
      return readWorkspace(identity).labels
        .filter(
          (label) =>
            label.userId === identity.id && label.deletedAt === null,
        )
        .sort((left, right) => left.name.localeCompare(right.name))
    },
    async create(identity, input: CreateLabelInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const name = input.name.trim()
      if (!name || name.length > 80) {
        throw new ApiError('UNKNOWN', 'Tên label cần có từ 1 đến 80 ký tự.')
      }
      if (
        workspace.labels.some(
          (label) =>
            label.userId === identity.id &&
            label.deletedAt === null &&
            label.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        throw new ApiError('UNKNOWN', 'Label này đã tồn tại.')
      }
      const now = new Date().toISOString()
      const label: Label = {
        id: createUuidV7(),
        userId: identity.id,
        name,
        color: input.color,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      workspace.labels.push(label)
      writeWorkspace(identity, workspace)
      return label
    },
  },
  tasks: {
    async list(identity, projectId) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      if (projectId) {
        requireProject(workspace, identity.id, projectId)
      }
      return workspace.tasks
        .filter(
          (task) =>
            task.userId === identity.id &&
            task.deletedAt === null &&
            (!projectId || task.projectId === projectId),
        )
        .map((task): TaskListItem => ({
          ...task,
          labels: workspace.taskLabels
            .filter((link) => link.taskId === task.id)
            .map((link) =>
              workspace.labels.find(
                (label) =>
                  label.id === link.labelId && label.deletedAt === null,
              ),
            )
            .filter((label): label is Label => Boolean(label)),
          subTaskCount: workspace.tasks.filter(
            (child) =>
              child.parentTaskId === task.id &&
              child.deletedAt === null &&
              child.status !== 'COMPLETED',
          ).length,
          commentCount: workspace.comments.filter(
            (comment) => comment.taskId === task.id && comment.deletedAt === null,
          ).length,
        }))
        .sort((left, right) => left.position - right.position)
    },
    async create(identity, input: CreateTaskInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const { project, parent } = validateTaskInput(workspace, identity, input)
      const peers = workspace.tasks.filter(
        (task) =>
          task.projectId === project.id &&
          task.sectionId === input.sectionId &&
          task.parentTaskId === (parent?.id ?? null) &&
          task.deletedAt === null,
      )
      const task = makeTask(identity.id, project.id, input.title.trim(), {
        sectionId: input.sectionId,
        parentTaskId: parent?.id ?? null,
        priority: input.priority,
        dueDate: input.dueDate,
        dueTime: input.dueTime,
        position: (Math.max(0, ...peers.map((peer) => peer.position))) + 1024,
      })
      task.description = input.description?.trim() || null
      task.recurrenceRule = input.recurrenceRule
      workspace.tasks.push(task)
      replaceTaskLabels(workspace, identity, task.id, input.labelIds)
      writeWorkspace(identity, workspace)
      return {
        ...task,
        labels: workspace.labels.filter((label) =>
          input.labelIds.includes(label.id),
        ),
        subTaskCount: 0,
        commentCount: 0,
      }
    },
    async update(identity, input: UpdateTaskInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const task = workspace.tasks.find(
        (candidate) =>
          candidate.id === input.taskId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      )
      if (!task) {
        throw new ApiError('UNKNOWN', 'Không tìm thấy task này.')
      }
      if (task.id === input.parentTaskId) {
        throw new ApiError('UNKNOWN', 'Task không thể tự làm task cha của mình.')
      }
      const { project, parent } = validateTaskInput(workspace, identity, input)
      const taskDescendants = descendants(workspace.tasks, task.id)
      const descendantIds = new Set(taskDescendants.map((child) => child.id))
      if (parent && descendantIds.has(parent.id)) {
        throw new ApiError('UNKNOWN', 'Không thể chuyển task xuống cây con của chính nó.')
      }
      if (parent) {
        const deepestChildDepth = taskDescendants.reduce((deepest, child) => {
          let relativeDepth = 1
          let ancestorId = child.parentTaskId
          while (ancestorId && ancestorId !== task.id) {
            const ancestor = taskDescendants.find(
              (candidate) => candidate.id === ancestorId,
            )
            if (!ancestor) break
            relativeDepth += 1
            ancestorId = ancestor.parentTaskId
          }
          return Math.max(deepest, relativeDepth)
        }, 0)
        if (taskDepth(workspace.tasks, parent) + 1 + deepestChildDepth > 2) {
          throw new ApiError('UNKNOWN', 'Sub-task chỉ hỗ trợ tối đa 3 cấp.')
        }
      }
      const oldParentId = task.parentTaskId
      const projectChanged = project.id !== task.projectId
      task.title = input.title.trim()
      task.description = input.description?.trim() || null
      task.projectId = project.id
      task.sectionId = input.sectionId
      task.parentTaskId = parent?.id ?? null
      task.priority = input.priority
      task.dueDate = input.dueDate
      task.dueTime = input.dueTime
      task.recurrenceRule = input.recurrenceRule
      task.updatedAt = new Date().toISOString()
      if (projectChanged) {
        for (const child of taskDescendants) {
          child.projectId = project.id
          child.sectionId = null
          child.updatedAt = task.updatedAt
        }
      }
      if (oldParentId !== task.parentTaskId) {
        task.position = 1024 + Math.max(
          0,
          ...workspace.tasks
            .filter(
              (candidate) =>
                candidate.id !== task.id &&
                candidate.parentTaskId === task.parentTaskId &&
                candidate.sectionId === task.sectionId &&
                candidate.deletedAt === null,
            )
            .map((candidate) => candidate.position),
        )
      }
      replaceTaskLabels(workspace, identity, task.id, input.labelIds)
      writeWorkspace(identity, workspace)
      return {
        ...task,
        labels: workspace.labels.filter((label) =>
          input.labelIds.includes(label.id),
        ),
        subTaskCount: workspace.tasks.filter(
          (candidate) =>
            candidate.parentTaskId === task.id &&
            candidate.deletedAt === null &&
            candidate.status !== 'COMPLETED',
        ).length,
        commentCount: workspace.comments.filter(
          (comment) =>
            comment.taskId === task.id && comment.deletedAt === null,
        ).length,
      }
    },
    async reorder(identity, input: ReorderTasksInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const task = workspace.tasks.find(
        (candidate) =>
          candidate.id === input.taskId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      )
      if (!task) {
        throw new ApiError('UNKNOWN', 'Không tìm thấy task cần sắp xếp.')
      }
      const sameGroup =
        task.sectionId === input.destinationSectionId &&
        task.parentTaskId === input.destinationParentTaskId
      const destinationSection = input.destinationSectionId
        ? workspace.sections.find(
            (section) =>
              section.id === input.destinationSectionId &&
              section.projectId === task.projectId &&
              section.deletedAt === null,
          )
        : null
      if (
        (input.destinationSectionId && !destinationSection) ||
        (input.destinationSectionId && requireProject(
          workspace,
          identity.id,
          task.projectId,
        ).isInbox)
      ) {
        throw new ApiError('UNKNOWN', 'Section không thuộc dự án của task.')
      }
      const destinationParent = input.destinationParentTaskId
        ? workspace.tasks.find(
            (candidate) =>
              candidate.id === input.destinationParentTaskId &&
              candidate.userId === identity.id &&
              candidate.deletedAt === null,
          )
        : null
      if (
        (input.destinationParentTaskId && !destinationParent) ||
        (destinationParent &&
          (destinationParent.projectId !== task.projectId ||
            destinationParent.sectionId !== input.destinationSectionId))
      ) {
        throw new ApiError('UNKNOWN', 'Nhóm task đích không hợp lệ.')
      }
      if (
        !sameGroup &&
        (task.parentTaskId !== null || input.destinationParentTaskId !== null)
      ) {
        throw new ApiError('UNKNOWN', 'Chỉ có thể chuyển task gốc giữa các section.')
      }
      const sourceIds = new Set(input.sourceOrderedTaskIds)
      const destinationIds = new Set(input.destinationOrderedTaskIds)
      if (
        sourceIds.size !== input.sourceOrderedTaskIds.length ||
        destinationIds.size !== input.destinationOrderedTaskIds.length ||
        !destinationIds.has(task.id)
      ) {
        throw new ApiError('UNKNOWN', 'Thứ tự task không hợp lệ.')
      }
      if (sameGroup) {
        const siblingIds = new Set(
          workspace.tasks
            .filter(
              (candidate) =>
                candidate.projectId === task.projectId &&
                candidate.sectionId === task.sectionId &&
                candidate.parentTaskId === task.parentTaskId &&
                candidate.deletedAt === null,
            )
            .map((candidate) => candidate.id),
        )
        if (
          input.destinationOrderedTaskIds.some((id) => !siblingIds.has(id))
        ) {
          throw new ApiError('UNKNOWN', 'Thứ tự task không thuộc cùng một nhóm.')
        }
        reorderTaskSiblings(
          workspace,
          task.projectId,
          input.destinationSectionId,
          input.destinationParentTaskId,
          input.destinationOrderedTaskIds,
        )
      } else {
        const sourceSiblingIds = new Set(
          workspace.tasks
            .filter(
              (candidate) =>
                candidate.projectId === task.projectId &&
                candidate.sectionId === task.sectionId &&
                candidate.parentTaskId === task.parentTaskId &&
                candidate.id !== task.id &&
                candidate.deletedAt === null,
            )
            .map((candidate) => candidate.id),
        )
        const destinationSiblingIds = new Set(
          workspace.tasks
            .filter(
              (candidate) =>
                candidate.projectId === task.projectId &&
                candidate.sectionId === input.destinationSectionId &&
                candidate.parentTaskId === input.destinationParentTaskId &&
                candidate.deletedAt === null,
            )
            .map((candidate) => candidate.id),
        )
        if (
          input.sourceOrderedTaskIds.some((id) => !sourceSiblingIds.has(id)) ||
          input.destinationOrderedTaskIds.some(
            (id) => id !== task.id && !destinationSiblingIds.has(id),
          )
        ) {
          throw new ApiError('UNKNOWN', 'Thứ tự task không thuộc cùng một nhóm.')
        }
        reorderTaskSiblings(
          workspace,
          task.projectId,
          task.sectionId,
          task.parentTaskId,
          input.sourceOrderedTaskIds,
          task.id,
        )
        task.sectionId = input.destinationSectionId
        const descendantsToMove = descendants(workspace.tasks, task.id)
        const now = new Date().toISOString()
        task.updatedAt = now
        for (const child of descendantsToMove) {
          child.sectionId = input.destinationSectionId
          child.updatedAt = now
        }
        reorderTaskSiblings(
          workspace,
          task.projectId,
          input.destinationSectionId,
          input.destinationParentTaskId,
          input.destinationOrderedTaskIds,
        )
      }
      writeWorkspace(identity, workspace)
    },
    async setStatus(identity, input: SetTaskStatusInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const target = workspace.tasks.find(
        (task) =>
          task.id === input.taskId &&
          task.userId === identity.id &&
          task.deletedAt === null,
      )
      if (!target) {
        throw new ApiError('UNKNOWN', 'Không tìm thấy task này.')
      }
      const affected =
        input.status === 'COMPLETED'
          ? [target, ...descendants(workspace.tasks, target.id)].filter(
              (task) => task.status !== 'COMPLETED',
            )
          : [target]
      const change: TaskStatusChange = {
        tasks: affected.map((task) => ({
          id: task.id,
          status: task.status,
          completedAt: task.completedAt,
          dueDate: task.dueDate,
          dueTime: task.dueTime,
        })),
        completionIds: [],
      }
      const now = new Date().toISOString()
      for (const task of affected) {
        if (input.status === 'COMPLETED' && task.recurrenceRule && task.dueDate) {
          task.dueDate = dateByRecurrence(task.dueDate, task.recurrenceRule)
          task.status = 'TODO'
          task.completedAt = null
        } else {
          task.status = input.status
          task.completedAt = input.status === 'COMPLETED' ? now : null
        }
        task.updatedAt = now
        if (input.status === 'COMPLETED') {
          const completion = createCompletion(task, identity.id)
          if (task.recurrenceRule && task.dueDate) {
            const previous = change.tasks.find((item) => item.id === task.id)
            completion.dueDateSnapshot = previous?.dueDate ?? completion.dueDateSnapshot
            completion.dueTimeSnapshot = previous?.dueTime ?? completion.dueTimeSnapshot
          }
          workspace.taskCompletions.push(completion)
          change.completionIds.push(completion.id)
        } else {
          const completion = [...workspace.taskCompletions]
            .reverse()
            .find(
              (event) => event.taskId === task.id && event.revertedAt === null,
            )
          if (completion) completion.revertedAt = now
        }
      }
      writeWorkspace(identity, workspace)
      return change
    },
    async undoStatusChange(identity, change) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const now = new Date().toISOString()
      for (const previous of change.tasks) {
        const task = workspace.tasks.find(
          (candidate) =>
            candidate.id === previous.id &&
            candidate.userId === identity.id &&
            candidate.deletedAt === null,
        )
        if (!task) continue
        task.status = previous.status
        task.completedAt = previous.completedAt
        task.dueDate = previous.dueDate
        task.dueTime = previous.dueTime
        task.updatedAt = now
      }
      for (const completionId of change.completionIds) {
        const completion = workspace.taskCompletions.find(
          (event) =>
            event.id === completionId &&
            event.userId === identity.id &&
            event.revertedAt === null,
        )
        if (completion) completion.revertedAt = now
      }
      writeWorkspace(identity, workspace)
    },
  },
  stats: {
    async overview(identity, input): Promise<StatsOverview> {
      await beforeRequest()
      assertStatsDateRange(input)
      const workspace = readWorkspace(identity)
      const projects = workspace.projects.filter(
        (project) =>
          project.userId === identity.id && project.deletedAt === null,
      )
      const validCompletions = workspace.taskCompletions.filter(
        (completion) =>
          completion.userId === identity.id &&
          completion.revertedAt === null &&
          completion.completedAt &&
          completion.projectId,
      )
      const bucketStart =
        input.granularity === 'week'
          ? weekStart(input.fromDate)
          : input.fromDate
      const bucketEnd =
        input.granularity === 'week'
          ? weekStart(input.toDate)
          : input.toDate
      const buckets = new Map<string, number>()
      for (
        let period = bucketStart;
        period <= bucketEnd;
        period = shiftLocalDate(
          period,
          input.granularity === 'week' ? 7 : 1,
        )
      ) {
        buckets.set(period, 0)
      }

      for (const completion of validCompletions) {
        const completionDate = localDate(
          identity.timezone,
          new Date(completion.completedAt),
        )
        if (completionDate < input.fromDate || completionDate > input.toDate) {
          continue
        }
        const period =
          input.granularity === 'week'
            ? weekStart(completionDate)
            : completionDate
        buckets.set(period, (buckets.get(period) ?? 0) + 1)
      }

      const completedByProject = new Map<string, number>()
      for (const completion of validCompletions) {
        const completionDate = localDate(
          identity.timezone,
          new Date(completion.completedAt),
        )
        if (completionDate < input.fromDate || completionDate > input.toDate) {
          continue
        }
        completedByProject.set(
          completion.projectId,
          (completedByProject.get(completion.projectId) ?? 0) + 1,
        )
      }

      const overdueByProject = new Map<string, number>()
      for (const task of workspace.tasks) {
        if (
          task.userId !== identity.id ||
          task.deletedAt !== null ||
          task.status === 'COMPLETED' ||
          !isTaskOverdue(
            task.dueDate,
            task.dueTime,
            identity.timezone,
          )
        ) {
          continue
        }
        overdueByProject.set(
          task.projectId,
          (overdueByProject.get(task.projectId) ?? 0) + 1,
        )
      }

      const projectCounts = (counts: Map<string, number>) =>
        projects
          .map((project) => ({
            projectId: project.id,
            projectName: project.name,
            count: counts.get(project.id) ?? 0,
          }))
          .sort(
            (left, right) =>
              right.count - left.count ||
              left.projectName.localeCompare(right.projectName),
          )

      return {
        completedByPeriod: Array.from(buckets, ([period, completedCount]) => ({
          period,
          completedCount,
        })),
        completedByProject: projectCounts(completedByProject),
        overdueByProject: projectCounts(overdueByProject),
      }
    },
  },
  comments: {
    async list(identity, taskId) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const task = workspace.tasks.find(
        (candidate) =>
          candidate.id === taskId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      )
      if (!task) throw new ApiError('UNKNOWN', 'Không tìm thấy task này.')
      return workspace.comments
        .filter(
          (comment) =>
            comment.taskId === taskId &&
            comment.userId === identity.id &&
            comment.deletedAt === null,
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    },
    async create(identity, input: CreateCommentInput) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const task = workspace.tasks.find(
        (candidate) =>
          candidate.id === input.taskId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      )
      if (!task) throw new ApiError('UNKNOWN', 'Không tìm thấy task này.')
      const content = input.content.trim()
      if (!content || content.length > 10_000) {
        throw new ApiError('UNKNOWN', 'Bình luận cần có từ 1 đến 10.000 ký tự.')
      }
      const now = new Date().toISOString()
      const comment: Comment = {
        id: createUuidV7(),
        taskId: task.id,
        userId: identity.id,
        content,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      workspace.comments.push(comment)
      writeWorkspace(identity, workspace)
      return comment
    },
    async delete(identity, commentId) {
      await beforeRequest()
      const workspace = readWorkspace(identity)
      const comment = workspace.comments.find(
        (candidate) =>
          candidate.id === commentId &&
          candidate.userId === identity.id &&
          candidate.deletedAt === null,
      )
      if (!comment) throw new ApiError('UNKNOWN', 'Không tìm thấy bình luận này.')
      comment.deletedAt = new Date().toISOString()
      comment.updatedAt = comment.deletedAt
      writeWorkspace(identity, workspace)
    },
  },
}
