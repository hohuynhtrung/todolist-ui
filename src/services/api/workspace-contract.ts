import type {
  Comment,
  CreateCommentInput,
  CreateLabelInput,
  CreateTaskInput,
  Label,
  Project,
  Section,
  StatsOverview,
  StatsOverviewInput,
  TaskListItem,
  TaskStatus,
  TaskStatusChange,
  UpdateTaskInput,
  WorkspaceIdentity,
} from '@/types/workspace'

export type {
  CreateCommentInput,
  CreateLabelInput,
  CreateTaskInput,
  UpdateTaskInput,
} from '@/types/workspace'

export interface CreateSectionInput {
  projectId: string
  name: string
}

export interface UpdateSectionInput {
  sectionId: string
  name: string
}

export interface SetTaskStatusInput {
  taskId: string
  status: TaskStatus
}

export interface ReorderTasksInput {
  taskId: string
  destinationSectionId: string | null
  destinationParentTaskId: string | null
  sourceOrderedTaskIds: string[]
  destinationOrderedTaskIds: string[]
}

export interface ReorderProjectsInput {
  orderedProjectIds: string[]
}

export interface ProjectsApi {
  list(identity: WorkspaceIdentity): Promise<Project[]>
  reorder(identity: WorkspaceIdentity, input: ReorderProjectsInput): Promise<void>
}

export interface StatsApi {
  overview(
    identity: WorkspaceIdentity,
    input: StatsOverviewInput,
  ): Promise<StatsOverview>
}

export interface SectionsApi {
  list(identity: WorkspaceIdentity, projectId: string): Promise<Section[]>
  create(identity: WorkspaceIdentity, input: CreateSectionInput): Promise<Section>
  update(identity: WorkspaceIdentity, input: UpdateSectionInput): Promise<Section>
  delete(identity: WorkspaceIdentity, sectionId: string): Promise<void>
}

export interface LabelsApi {
  list(identity: WorkspaceIdentity): Promise<Label[]>
  create(identity: WorkspaceIdentity, input: CreateLabelInput): Promise<Label>
}

export interface TasksApi {
  list(identity: WorkspaceIdentity, projectId?: string): Promise<TaskListItem[]>
  create(identity: WorkspaceIdentity, input: CreateTaskInput): Promise<TaskListItem>
  update(identity: WorkspaceIdentity, input: UpdateTaskInput): Promise<TaskListItem>
  setStatus(
    identity: WorkspaceIdentity,
    input: SetTaskStatusInput,
  ): Promise<TaskStatusChange>
  reorder(identity: WorkspaceIdentity, input: ReorderTasksInput): Promise<void>
  undoStatusChange(
    identity: WorkspaceIdentity,
    change: TaskStatusChange,
  ): Promise<void>
}

export interface CommentsApi {
  list(identity: WorkspaceIdentity, taskId: string): Promise<Comment[]>
  create(identity: WorkspaceIdentity, input: CreateCommentInput): Promise<Comment>
  delete(identity: WorkspaceIdentity, commentId: string): Promise<void>
}

export interface WorkspaceApi {
  projects: ProjectsApi
  sections: SectionsApi
  labels: LabelsApi
  tasks: TasksApi
  comments: CommentsApi
  stats: StatsApi
}
