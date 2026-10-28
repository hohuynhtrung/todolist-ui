export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED'

export interface Project {
  id: string
  userId: string
  name: string
  color: string | null
  isInbox: boolean
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Section {
  id: string
  projectId: string
  name: string
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Task {
  id: string
  userId: string
  projectId: string
  sectionId: string | null
  parentTaskId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: number
  dueDate: string | null
  dueTime: string | null
  recurrenceRule: string | null
  position: number
  completedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Label {
  id: string
  userId: string
  name: string
  color: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface TaskLabel {
  taskId: string
  labelId: string
  userId: string
  createdAt: string
}

export interface Comment {
  id: string
  taskId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface TaskCompletion {
  id: string
  taskId: string
  userId: string
  projectId: string
  completedAt: string
  revertedAt: string | null
  dueDateSnapshot: string | null
  dueTimeSnapshot: string | null
}

export interface TaskListItem extends Task {
  labels: Label[]
  subTaskCount: number
  commentCount: number
}

export interface WorkspaceIdentity {
  id: string
  email: string
  timezone: string
}

export interface TaskStatusChange {
  tasks: Array<{
    id: string
    status: TaskStatus
    completedAt: string | null
    dueDate: string | null
    dueTime: string | null
  }>
  completionIds: string[]
}

export type StatsGranularity = 'day' | 'week'

export interface StatsOverviewInput {
  fromDate: string
  toDate: string
  granularity: StatsGranularity
}

export interface StatsPeriodCount {
  period: string
  completedCount: number
}

export interface StatsProjectCount {
  projectId: string
  projectName: string
  count: number
}

export interface StatsOverview {
  completedByPeriod: StatsPeriodCount[]
  completedByProject: StatsProjectCount[]
  overdueByProject: StatsProjectCount[]
}

export interface CreateTaskInput {
  title: string
  description?: string | null
  projectId: string
  sectionId: string | null
  parentTaskId?: string | null
  priority: number
  dueDate: string | null
  dueTime: string | null
  recurrenceRule: string | null
  labelIds: string[]
}

export interface UpdateTaskInput {
  taskId: string
  title: string
  description: string | null
  projectId: string
  sectionId: string | null
  parentTaskId: string | null
  priority: number
  dueDate: string | null
  dueTime: string | null
  recurrenceRule: string | null
  labelIds: string[]
}

export interface CreateLabelInput {
  name: string
  color: string | null
}

export interface CreateCommentInput {
  taskId: string
  content: string
}
