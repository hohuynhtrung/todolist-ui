import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCurrentUser } from '@/hooks/use-auth'
import { workspaceApi } from '@/services/api/workspace'
import type {
  CreateCommentInput,
  CreateLabelInput,
  CreateTaskInput,
  CreateSectionInput,
  ReorderProjectsInput,
  ReorderTasksInput,
  SetTaskStatusInput,
  UpdateSectionInput,
  UpdateTaskInput,
} from '@/services/api/workspace-contract'
import type {
  Comment,
  Project,
  StatsOverviewInput,
  TaskStatusChange,
  TaskListItem,
  WorkspaceIdentity,
} from '@/types/workspace'

export const workspaceKeys = {
  projects: (userId: string) => ['workspace', userId, 'projects'] as const,
  sections: (userId: string, projectId: string) =>
    ['workspace', userId, 'sections', projectId] as const,
  tasks: (userId: string, projectId?: string) =>
    ['workspace', userId, 'tasks', projectId ?? 'all'] as const,
  labels: (userId: string) => ['workspace', userId, 'labels'] as const,
  stats: (userId: string, input: StatsOverviewInput) =>
    ['workspace', userId, 'stats', input] as const,
  comments: (userId: string, taskId: string) =>
    ['workspace', userId, 'comments', taskId] as const,
}

export function useWorkspaceIdentity(): WorkspaceIdentity | null {
  const { data } = useCurrentUser()
  if (!data) {
    return null
  }
  return {
    id: data.user.id,
    email: data.user.email,
    timezone: data.user.timezone,
  }
}

function requireIdentity(identity: WorkspaceIdentity | null): WorkspaceIdentity {
  if (!identity) {
    throw new Error('Bạn cần đăng nhập để truy cập không gian này.')
  }
  return identity
}

export function useProjects() {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.projects(identity?.id ?? ''),
    queryFn: () => workspaceApi.projects.list(requireIdentity(identity)),
    enabled: Boolean(identity),
  })
}

export function useReorderProjects() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  const queryKey = workspaceKeys.projects(identity?.id ?? '')
  return useMutation({
    mutationFn: (input: ReorderProjectsInput) =>
      workspaceApi.projects.reorder(requireIdentity(identity), input),
    onMutate: async ({ orderedProjectIds }) => {
      if (!identity) return
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Project[]>(queryKey)
      if (previous) {
        const order = new Map(orderedProjectIds.map((id, index) => [id, index]))
        queryClient.setQueryData(
          queryKey,
          previous.map((project) =>
            order.has(project.id)
              ? { ...project, position: 1024 + (order.get(project.id) ?? 0) * 1024 }
              : project,
          ).sort((left, right) => left.position - right.position),
        )
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (identity && context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: async () => {
      if (identity) {
        await queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}

function reorderTaskCache(
  tasks: TaskListItem[],
  input: ReorderTasksInput,
): TaskListItem[] {
  const movedTask = tasks.find((task) => task.id === input.taskId)
  if (!movedTask) return tasks
  const isSameGroup =
    movedTask.sectionId === input.destinationSectionId &&
    movedTask.parentTaskId === input.destinationParentTaskId
  const orderedGroup = (
    sectionId: string | null,
    parentTaskId: string | null,
    orderedIds: string[],
    includeMovedTask: boolean,
  ) => {
    const siblings = tasks
      .filter(
        (task) =>
          task.projectId === movedTask.projectId &&
          task.sectionId === sectionId &&
          task.parentTaskId === parentTaskId &&
          (includeMovedTask || task.id !== movedTask.id),
      )
      .sort((left, right) => left.position - right.position)
    const byId = new Map(siblings.map((task) => [task.id, task]))
    if (includeMovedTask) {
      byId.set(movedTask.id, movedTask)
    }
    const ordered = orderedIds.flatMap((id) => {
      const task = byId.get(id)
      return task ? [task] : []
    })
    const included = new Set(ordered.map((task) => task.id))
    return [...ordered, ...siblings.filter((task) => !included.has(task.id))]
  }

  const sourceSiblings = isSameGroup
    ? []
    : orderedGroup(
        movedTask.sectionId,
        movedTask.parentTaskId,
        input.sourceOrderedTaskIds,
        false,
      )
  const destinationSiblings = orderedGroup(
    input.destinationSectionId,
    input.destinationParentTaskId,
    input.destinationOrderedTaskIds,
    true,
  )
  const positionById = new Map<string, number>()
  sourceSiblings.forEach((task, index) =>
    positionById.set(task.id, (index + 1) * 1024),
  )
  destinationSiblings.forEach((task, index) =>
    positionById.set(task.id, (index + 1) * 1024),
  )
  const sectionByTaskId = new Map<string, string | null>()
  if (movedTask.sectionId !== input.destinationSectionId) {
    const pending = [movedTask.id]
    while (pending.length > 0) {
      const currentId = pending.pop()
      if (!currentId) continue
      sectionByTaskId.set(currentId, input.destinationSectionId)
      for (const child of tasks) {
        if (child.parentTaskId === currentId) pending.push(child.id)
      }
    }
  }
  return tasks.map((task) => ({
    ...task,
    ...(positionById.has(task.id)
      ? { position: positionById.get(task.id) ?? task.position }
      : {}),
    ...(sectionByTaskId.has(task.id)
      ? { sectionId: sectionByTaskId.get(task.id) ?? null }
      : {}),
  }))
}

export function useReorderTasks() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  const queryKey = workspaceKeys.tasks(identity?.id ?? '')
  return useMutation({
    mutationFn: (input: ReorderTasksInput) =>
      workspaceApi.tasks.reorder(requireIdentity(identity), input),
    onMutate: async (input) => {
      if (!identity) return
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueriesData<TaskListItem[]>({ queryKey })
      for (const [key, tasks] of previous) {
        if (tasks) {
          queryClient.setQueryData(key, reorderTaskCache(tasks, input))
        }
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      for (const [key, tasks] of context?.previous ?? []) {
        queryClient.setQueryData(key, tasks)
      }
    },
    onSettled: async () => {
      if (identity) {
        await queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}

export function useProjectSections(projectId: string) {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.sections(identity?.id ?? '', projectId),
    queryFn: () =>
      workspaceApi.sections.list(requireIdentity(identity), projectId),
    enabled: Boolean(identity && projectId),
  })
}

export function useTasks(projectId?: string) {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.tasks(identity?.id ?? '', projectId),
    queryFn: () => workspaceApi.tasks.list(requireIdentity(identity), projectId),
    enabled: Boolean(identity),
  })
}

export function useLabels() {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.labels(identity?.id ?? ''),
    queryFn: () => workspaceApi.labels.list(requireIdentity(identity)),
    enabled: Boolean(identity),
  })
}

export function useStats(input: StatsOverviewInput) {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.stats(identity?.id ?? '', input),
    queryFn: () =>
      workspaceApi.stats.overview(requireIdentity(identity), input),
    enabled: Boolean(identity),
  })
}

export function useTaskComments(taskId: string | null) {
  const identity = useWorkspaceIdentity()
  return useQuery({
    queryKey: workspaceKeys.comments(identity?.id ?? '', taskId ?? ''),
    queryFn: () => {
      if (!taskId) return Promise.resolve([] as Comment[])
      return workspaceApi.comments.list(requireIdentity(identity), taskId)
    },
    enabled: Boolean(identity && taskId),
  })
}

export function useCreateTask() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      workspaceApi.tasks.create(requireIdentity(identity), input),
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.tasks(identity.id),
        })
      }
    },
  })
}

export function useUpdateTask() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTaskInput) =>
      workspaceApi.tasks.update(requireIdentity(identity), input),
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.tasks(identity.id),
        })
      }
    },
  })
}

export function useCreateLabel() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLabelInput) =>
      workspaceApi.labels.create(requireIdentity(identity), input),
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.labels(identity.id),
        })
      }
    },
  })
}

export function useCreateComment(taskId: string | null) {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      workspaceApi.comments.create(requireIdentity(identity), input),
    onSuccess: async () => {
      if (identity && taskId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.comments(identity.id, taskId),
          }),
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.tasks(identity.id),
          }),
        ])
      }
    },
  })
}

export function useDeleteComment(taskId: string | null) {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      workspaceApi.comments.delete(requireIdentity(identity), commentId),
    onSuccess: async () => {
      if (identity && taskId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.comments(identity.id, taskId),
          }),
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.tasks(identity.id),
          }),
        ])
      }
    },
  })
}

export function useCreateSection(projectId: string) {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateSectionInput) => {
      if (!identity) throw new Error('Bạn cần đăng nhập để tạo section.')
      return workspaceApi.sections.create(identity, input)
    },
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.sections(identity.id, projectId),
        })
      }
    },
  })
}

export function useUpdateSection(projectId: string) {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateSectionInput) => {
      if (!identity) throw new Error('Bạn cần đăng nhập để sửa section.')
      return workspaceApi.sections.update(identity, input)
    },
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.sections(identity.id, projectId),
        })
      }
    },
  })
}

export function useDeleteSection(projectId: string) {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sectionId: string) => {
      if (!identity) throw new Error('Bạn cần đăng nhập để xóa section.')
      return workspaceApi.sections.delete(identity, sectionId)
    },
    onSuccess: async () => {
      if (identity) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.sections(identity.id, projectId),
          }),
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.tasks(identity.id),
          }),
        ])
      }
    },
  })
}

export function useSetTaskStatus() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetTaskStatusInput) => {
      if (!identity) throw new Error('Bạn cần đăng nhập để cập nhật task.')
      return workspaceApi.tasks.setStatus(identity, input)
    },
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.tasks(identity.id),
        })
      }
    },
  })
}

export function useUndoTaskStatusChange() {
  const identity = useWorkspaceIdentity()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (change: TaskStatusChange) => {
      if (!identity) throw new Error('Bạn cần đăng nhập để hoàn tác.')
      return workspaceApi.tasks.undoStatusChange(identity, change)
    },
    onSuccess: async () => {
      if (identity) {
        await queryClient.invalidateQueries({
          queryKey: workspaceKeys.tasks(identity.id),
        })
      }
    },
  })
}
