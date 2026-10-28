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
import type { WorkspaceIdentity, TaskStatusChange } from '@/types/workspace'

const workspaceApiPromise: Promise<WorkspaceApi> =
  import.meta.env.VITE_USE_MOCK === 'false'
    ? import('@/services/api/http/workspace').then(
        ({ httpWorkspaceApi }) => httpWorkspaceApi,
      )
    : import('@/services/api/mock/workspace').then(
        ({ mockWorkspaceApi }) => mockWorkspaceApi,
      )

export const workspaceApi: WorkspaceApi = {
  projects: {
    list: async (identity: WorkspaceIdentity) =>
      (await workspaceApiPromise).projects.list(identity),
    reorder: async (identity: WorkspaceIdentity, input: ReorderProjectsInput) =>
      (await workspaceApiPromise).projects.reorder(identity, input),
  },
  sections: {
    list: async (identity: WorkspaceIdentity, projectId: string) =>
      (await workspaceApiPromise).sections.list(identity, projectId),
    create: async (identity: WorkspaceIdentity, input: CreateSectionInput) =>
      (await workspaceApiPromise).sections.create(identity, input),
    update: async (identity: WorkspaceIdentity, input: UpdateSectionInput) =>
      (await workspaceApiPromise).sections.update(identity, input),
    delete: async (identity: WorkspaceIdentity, sectionId: string) =>
      (await workspaceApiPromise).sections.delete(identity, sectionId),
  },
  labels: {
    list: async (identity: WorkspaceIdentity) =>
      (await workspaceApiPromise).labels.list(identity),
    create: async (identity: WorkspaceIdentity, input: CreateLabelInput) =>
      (await workspaceApiPromise).labels.create(identity, input),
  },
  tasks: {
    list: async (identity: WorkspaceIdentity, projectId?: string) =>
      (await workspaceApiPromise).tasks.list(identity, projectId),
    create: async (identity: WorkspaceIdentity, input: CreateTaskInput) =>
      (await workspaceApiPromise).tasks.create(identity, input),
    update: async (identity: WorkspaceIdentity, input: UpdateTaskInput) =>
      (await workspaceApiPromise).tasks.update(identity, input),
    setStatus: async (identity: WorkspaceIdentity, input: SetTaskStatusInput) =>
      (await workspaceApiPromise).tasks.setStatus(identity, input),
    reorder: async (identity: WorkspaceIdentity, input: ReorderTasksInput) =>
      (await workspaceApiPromise).tasks.reorder(identity, input),
    undoStatusChange: async (
      identity: WorkspaceIdentity,
      change: TaskStatusChange,
    ) => (await workspaceApiPromise).tasks.undoStatusChange(identity, change),
  },
  stats: {
    overview: async (identity, input) =>
      (await workspaceApiPromise).stats.overview(identity, input),
  },
  comments: {
    list: async (identity: WorkspaceIdentity, taskId: string) =>
      (await workspaceApiPromise).comments.list(identity, taskId),
    create: async (identity: WorkspaceIdentity, input: CreateCommentInput) =>
      (await workspaceApiPromise).comments.create(identity, input),
    delete: async (identity: WorkspaceIdentity, commentId: string) =>
      (await workspaceApiPromise).comments.delete(identity, commentId),
  },
}
