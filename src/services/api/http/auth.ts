import type {
  AuthApi,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@/services/api/auth-contract'
import { ApiError } from '@/services/api/errors'
import type {
  AuthResult,
  EmailActionResult,
  VerificationStatus,
} from '@/types/auth'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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

  let body: unknown = null
  if (response.status !== 204) {
    try {
      body = await response.json()
    } catch {
      throw new ApiError('UNKNOWN', 'The service returned an invalid response.')
    }
  }
  if (!response.ok) {
    const code =
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
        ? body.code
        : 'UNKNOWN'
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Request failed.'
    throw new ApiError(
      code === 'EMAIL_IN_USE' ||
        code === 'INVALID_CREDENTIALS' ||
        code === 'EMAIL_NOT_VERIFIED' ||
        code === 'ACCOUNT_LOCKED' ||
        code === 'TOKEN_INVALID' ||
        code === 'TOKEN_EXPIRED' ||
        code === 'TOKEN_USED' ||
        code === 'PASSWORD_WEAK'
        ? code
        : 'UNKNOWN',
      message,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return body as T
}

export const httpAuthApi: AuthApi = {
  getCurrentUser: () => request<AuthResult | null>('/auth/me'),

  register: (input: RegisterInput) =>
    request<EmailActionResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: LoginInput) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  verifyEmail: (token: string) =>
    request<VerificationStatus>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<EmailActionResult>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  requestPasswordReset: (email: string) =>
    request<EmailActionResult>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (input: ResetPasswordInput) =>
    request<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}
