import type {
  AuthApi,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@/services/api/auth-contract'

const authApiPromise: Promise<AuthApi> =
  import.meta.env.VITE_USE_MOCK === 'false'
    ? import('@/services/api/http/auth').then(({ httpAuthApi }) => httpAuthApi)
    : import('@/services/api/mock/auth').then(({ mockAuthApi }) => mockAuthApi)

export const authApi: AuthApi = {
  getCurrentUser: async () => (await authApiPromise).getCurrentUser(),
  register: async (input: RegisterInput) =>
    (await authApiPromise).register(input),
  login: async (input: LoginInput) => (await authApiPromise).login(input),
  logout: async () => (await authApiPromise).logout(),
  verifyEmail: async (token: string) =>
    (await authApiPromise).verifyEmail(token),
  resendVerification: async (email: string) =>
    (await authApiPromise).resendVerification(email),
  requestPasswordReset: async (email: string) =>
    (await authApiPromise).requestPasswordReset(email),
  resetPassword: async (input: ResetPasswordInput) =>
    (await authApiPromise).resetPassword(input),
}
