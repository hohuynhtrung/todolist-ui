import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/services/api/auth'

export const authQueryKey = ['auth', 'current-user'] as const

export function useCurrentUser() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: () => authApi.getCurrentUser(),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKey })
    },
  })
}
