import { ApiError } from '@/services/api/errors'
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
import type {
  Comment,
  Label,
  Project,
  Section,
  StatsOverview,
  StatsOverviewInput,
  TaskListItem,
  TaskStatusChange,
  WorkspaceIdentity,
} from '@/types/workspace'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(
      new URL(path.replace(/^\/+/, ''), `${apiUrl.replace(/\/+$/, '')}/`),
      {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      },
    )
  } catch {
    throw new ApiError('NETWORK_ERROR', 'The service could not be reached.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('UNKNOWN', 'The service returned an invalid response.')
  }
  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Request failed.'
    throw new ApiError('UNKNOWN', message)
  }
  return body as T
}

function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}

export const httpWorkspaceApi: WorkspaceApi = {
  projects: {
    list: (identity: WorkspaceIdentity) => {
      void identity
      return request<Project[]>('/projects')
    },
    reorder: (identity: WorkspaceIdentity, input: ReorderProjectsInput) => {
      void identity
      return request<void>('/projects/reorder', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
  },
  sections: {
    list: (identity: WorkspaceIdentity, projectId: string) => {
      void identity
      return request<Section[]>(`${projectPath(projectId)}/sections`)
    },
    create: (identity: WorkspaceIdentity, input: CreateSectionInput) => {
      void identity
      return request<Section>(`${projectPath(input.projectId)}/sections`, {
        method: 'POST',
        body: JSON.stringify({ name: input.name }),
      })
    },
    update: (identity: WorkspaceIdentity, input: UpdateSectionInput) => {
      void identity
      return request<Section>(`/sections/${encodeURIComponent(input.sectionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name }),
      })
    },
    delete: (identity: WorkspaceIdentity, sectionId: string) => {
      void identity
      return request<void>(`/sections/${encodeURIComponent(sectionId)}`, {
        method: 'DELETE',
      })
    },
  },
  labels: {
    list: (identity: WorkspaceIdentity) => {
      void identity
      return request<Label[]>('/labels')
    },
    create: (identity: WorkspaceIdentity, input: CreateLabelInput) => {
      void identity
      return request<Label>('/labels', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
  },
  tasks: {
    list: (identity: WorkspaceIdentity, projectId?: string) => {
      void identity
      return request<TaskListItem[]>(
        projectId
          ? `${projectPath(projectId)}/tasks`
          : '/tasks',
      )
    },
    create: (identity: WorkspaceIdentity, input: CreateTaskInput) => {
      void identity
      return request<TaskListItem>('/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    update: (identity: WorkspaceIdentity, input: UpdateTaskInput) => {
      void identity
      return request<TaskListItem>(`/tasks/${encodeURIComponent(input.taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    },
    setStatus: (identity: WorkspaceIdentity, input: SetTaskStatusInput) => {
      void identity
      return request<TaskStatusChange>(
        `/tasks/${encodeURIComponent(input.taskId)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: input.status }),
        },
      )
    },
    reorder: (identity: WorkspaceIdentity, input: ReorderTasksInput) => {
      void identity
      return request<void>('/tasks/reorder', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    undoStatusChange: (identity: WorkspaceIdentity, change: TaskStatusChange) => {
      void identity
      return request<void>('/tasks/undo-status-change', {
        method: 'POST',
        body: JSON.stringify(change),
      })
    },
  },
  stats: {
    overview: (identity: WorkspaceIdentity, input: StatsOverviewInput) => {
      void identity
      const params = new URLSearchParams({
        fromDate: input.fromDate,
        toDate: input.toDate,
        granularity: input.granularity,
      })
      return request<StatsOverview>(`/stats/overview?${params.toString()}`)
    },
  },
  comments: {
    list: (identity: WorkspaceIdentity, taskId: string) => {
      void identity
      return request<Comment[]>(`/tasks/${encodeURIComponent(taskId)}/comments`)
    },
    create: (identity: WorkspaceIdentity, input: CreateCommentInput) => {
      void identity
      return request<Comment>(
        `/tasks/${encodeURIComponent(input.taskId)}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ content: input.content }),
        },
      )
    },
    delete: (identity: WorkspaceIdentity, commentId: string) => {
      void identity
      return request<void>(`/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      })
    },
  },
}
