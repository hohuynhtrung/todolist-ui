import type {
  AuthResult,
  EmailActionResult,
  VerificationStatus,
} from '@/types/auth'

export interface RegisterInput {
  email: string
  password: string
  displayName: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface ResetPasswordInput {
  token: string
  password: string
}

export interface AuthApi {
  getCurrentUser(): Promise<AuthResult | null>
  register(input: RegisterInput): Promise<EmailActionResult>
  login(input: LoginInput): Promise<AuthResult>
  logout(): Promise<void>
  verifyEmail(token: string): Promise<VerificationStatus>
  resendVerification(email: string): Promise<EmailActionResult>
  requestPasswordReset(email: string): Promise<EmailActionResult>
  resetPassword(input: ResetPasswordInput): Promise<void>
}
