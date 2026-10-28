export type Role = 'USER' | 'ADMIN'

export type AccountStatus = 'ACTIVE' | 'LOCKED'

export interface User {
  id: string
  email: string
  passwordHash: string
  displayName: string
  role: Role
  accountStatus: AccountStatus
  emailVerifiedAt: string | null
  timezone: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type AuthUser = Omit<User, 'passwordHash'>

export interface EmailVerificationToken {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export interface PasswordResetToken {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  consumedAt: string | null
  createdAt: string
}

export interface Session {
  id: string
  userId: string
  familyId: string
  refreshTokenHash: string
  userAgent: string | null
  ipAddress: string | null
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthResult {
  user: AuthUser
}

export interface EmailActionResult {
  message: string
  actionLink?: string
}

export type VerificationStatus = 'VERIFIED' | 'ALREADY_USED'
