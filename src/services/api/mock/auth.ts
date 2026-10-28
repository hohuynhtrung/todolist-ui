import type {
  AuthResult,
  AuthUser,
  EmailActionResult,
  EmailVerificationToken,
  PasswordResetToken,
  Role,
  Session,
  User,
  VerificationStatus,
} from '@/types/auth'
import type {
  AuthApi,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@/services/api/auth-contract'
import { ApiError } from '@/services/api/errors'

const STORAGE_KEY = 'nep.auth.mock.v1'
const SESSION_KEY = 'nep.auth.session'
const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_DAYS = 30
const DEMO_ACCOUNTS: Array<{
  email: string
  password: string
  displayName: string
  role: Role
}> = [
  {
    email: 'demo@nep.local',
    password: 'NepDemo2026!',
    displayName: 'Minh Anh',
    role: 'USER',
  },
  {
    email: 'admin@nep.local',
    password: 'NepAdmin2026!',
    displayName: 'Quản trị viên',
    role: 'ADMIN',
  },
]

interface MockDatabase {
  users: User[]
  emailVerificationTokens: EmailVerificationToken[]
  passwordResetTokens: PasswordResetToken[]
  sessions: Session[]
}

function createUuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const timestamp = Date.now()

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Math.floor(timestamp / 256 ** (5 - index)) % 256
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function createRawToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function sha256(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return `${salt}:${await sha256(`${salt}:${password}`)}`
}

function createPasswordSalt(): string {
  return createRawToken().slice(0, 32)
}

function createEmptyDatabase(): MockDatabase {
  return {
    users: [],
    emailVerificationTokens: [],
    passwordResetTokens: [],
    sessions: [],
  }
}

function readDatabase(): MockDatabase {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return createEmptyDatabase()
  }

  try {
    const parsed: unknown = JSON.parse(stored)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'users' in parsed &&
      Array.isArray(parsed.users) &&
      'emailVerificationTokens' in parsed &&
      Array.isArray(parsed.emailVerificationTokens) &&
      'passwordResetTokens' in parsed &&
      Array.isArray(parsed.passwordResetTokens) &&
      'sessions' in parsed &&
      Array.isArray(parsed.sessions)
    ) {
      return parsed as MockDatabase
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
    throw new ApiError(
      'UNKNOWN',
      'Dữ liệu đăng nhập mô phỏng bị lỗi. Hãy xóa dữ liệu trang web và tải lại.',
    )
  }

  window.localStorage.removeItem(STORAGE_KEY)
  return createEmptyDatabase()
}

function persistDatabase(database: MockDatabase): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

function createVerificationUrl(token: string): string {
  const url = new URL('/verify-email', window.location.origin)
  url.searchParams.set('token', token)
  return url.toString()
}

function createPasswordResetUrl(token: string): string {
  const url = new URL('/reset-password', window.location.origin)
  url.searchParams.set('token', token)
  return url.toString()
}

function delay(): Promise<void> {
  const milliseconds = 200 + Math.floor(Math.random() * 301)
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function beforeRequest(): Promise<void> {
  await delay()
  if (window.localStorage.getItem('nep.mock.failNext') === 'true') {
    window.localStorage.removeItem('nep.mock.failNext')
    throw new ApiError('MOCK_FAILURE', 'Mock request failed.')
  }
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    timezone: user.timezone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt,
  }
}

async function ensureDemoAccounts(): Promise<void> {
  const database = readDatabase()
  let changed = false

  for (const demoAccount of DEMO_ACCOUNTS) {
    const email = demoAccount.email.toLowerCase()
    if (database.users.some((user) => user.email === email)) {
      continue
    }

    const now = new Date().toISOString()
    database.users.push({
      id: createUuidV7(),
      email,
      passwordHash: await hashPassword(
        demoAccount.password,
        createPasswordSalt(),
      ),
      displayName: demoAccount.displayName,
      role: demoAccount.role,
      accountStatus: 'ACTIVE',
      emailVerifiedAt: now,
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    changed = true
  }

  if (changed) {
    persistDatabase(database)
  }
}

const databaseReady = ensureDemoAccounts()

function findToken<T extends { tokenHash: string }>(
  records: T[],
  tokenHash: string,
): T | undefined {
  return records.find((record) => record.tokenHash === tokenHash)
}

export const mockAuthApi: AuthApi = {
  async getCurrentUser(): Promise<AuthResult | null> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const sessionId = window.localStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      return null
    }

    const session = database.sessions.find(
      (candidate) => candidate.id === sessionId,
    )
    if (
      !session ||
      session.revokedAt ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }

    const user = database.users.find(
      (candidate) =>
        candidate.id === session.userId &&
        candidate.deletedAt === null &&
        candidate.accountStatus === 'ACTIVE',
    )
    if (!user) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }

    return { user: toAuthUser(user) }
  },

  async register(input: RegisterInput): Promise<EmailActionResult> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const email = input.email.trim().toLowerCase()
    if (database.users.some((user) => user.email === email)) {
      throw new ApiError('EMAIL_IN_USE', 'Email is already registered.')
    }

    const now = new Date()
    const user: User = {
      id: createUuidV7(),
      email,
      passwordHash: await hashPassword(input.password, createPasswordSalt()),
      displayName: input.displayName.trim(),
      role: 'USER',
      accountStatus: 'ACTIVE',
      emailVerifiedAt: null,
      timezone: 'UTC',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    }
    const rawToken = createRawToken()
    database.users.push(user)
    database.emailVerificationTokens.push({
      id: createUuidV7(),
      userId: user.id,
      tokenHash: await sha256(rawToken),
      expiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    })
    persistDatabase(database)

    return {
      message: 'Tài khoản đã tạo. Hãy xác thực email để tiếp tục.',
      actionLink: createVerificationUrl(rawToken),
    }
  },

  async login(input: LoginInput): Promise<AuthResult> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const user = database.users.find(
      (candidate) =>
        candidate.email === input.email.trim().toLowerCase() &&
        candidate.deletedAt === null,
    )

    if (!user || user.passwordHash.split(':').length !== 2) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid credentials.')
    }

    const [salt] = user.passwordHash.split(':')
    if (!salt || (await hashPassword(input.password, salt)) !== user.passwordHash) {
      throw new ApiError('INVALID_CREDENTIALS', 'Invalid credentials.')
    }
    if (user.accountStatus === 'LOCKED') {
      throw new ApiError('ACCOUNT_LOCKED', 'Account is locked.')
    }
    if (!user.emailVerifiedAt) {
      throw new ApiError('EMAIL_NOT_VERIFIED', 'Email is not verified.')
    }

    const now = new Date()
    const rawRefreshToken = createRawToken()
    const session: Session = {
      id: createUuidV7(),
      userId: user.id,
      familyId: createUuidV7(),
      refreshTokenHash: await sha256(rawRefreshToken),
      userAgent: navigator.userAgent.slice(0, 512),
      ipAddress: null,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString(),
      revokedAt: null,
      lastUsedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    database.sessions.push(session)
    persistDatabase(database)
    window.localStorage.setItem(SESSION_KEY, session.id)

    return { user: toAuthUser(user) }
  },

  async logout(): Promise<void> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const sessionId = window.localStorage.getItem(SESSION_KEY)
    const session = database.sessions.find(
      (candidate) => candidate.id === sessionId,
    )
    if (session && !session.revokedAt) {
      session.revokedAt = new Date().toISOString()
      session.updatedAt = session.revokedAt
      persistDatabase(database)
    }
    window.localStorage.removeItem(SESSION_KEY)
  },

  async verifyEmail(token: string): Promise<VerificationStatus> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const tokenHash = await sha256(token)
    const verification = findToken(database.emailVerificationTokens, tokenHash)
    if (!verification) {
      throw new ApiError('TOKEN_INVALID', 'Verification token not found.')
    }
    if (verification.consumedAt) {
      throw new ApiError('TOKEN_USED', 'Verification token was consumed.')
    }
    if (Date.parse(verification.expiresAt) <= Date.now()) {
      throw new ApiError('TOKEN_EXPIRED', 'Verification token expired.')
    }

    const user = database.users.find(
      (candidate) => candidate.id === verification.userId,
    )
    if (!user || user.deletedAt) {
      throw new ApiError('TOKEN_INVALID', 'Verification account not found.')
    }
    if (user.emailVerifiedAt) {
      verification.consumedAt = new Date().toISOString()
      persistDatabase(database)
      throw new ApiError('TOKEN_USED', 'Email was already verified.')
    }

    const now = new Date().toISOString()
    verification.consumedAt = now
    user.emailVerifiedAt = now
    user.updatedAt = now
    persistDatabase(database)
    return 'VERIFIED'
  },

  async resendVerification(email: string): Promise<EmailActionResult> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const user = database.users.find(
      (candidate) =>
        candidate.email === email.trim().toLowerCase() &&
        candidate.deletedAt === null &&
        candidate.emailVerifiedAt === null,
    )
    if (!user) {
      return {
        message:
          'Nếu email chưa được xác thực, hướng dẫn sẽ được gửi đến hộp thư của bạn.',
      }
    }

    const now = new Date()
    for (const token of database.emailVerificationTokens) {
      if (token.userId === user.id && token.consumedAt === null) {
        token.consumedAt = now.toISOString()
      }
    }

    const rawToken = createRawToken()
    database.emailVerificationTokens.push({
      id: createUuidV7(),
      userId: user.id,
      tokenHash: await sha256(rawToken),
      expiresAt: new Date(now.getTime() + DAY_MS).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    })
    persistDatabase(database)

    return {
      message:
        'Nếu email chưa được xác thực, hướng dẫn sẽ được gửi đến hộp thư của bạn.',
      actionLink: createVerificationUrl(rawToken),
    }
  },

  async requestPasswordReset(email: string): Promise<EmailActionResult> {
    await databaseReady
    await beforeRequest()
    const database = readDatabase()
    const user = database.users.find(
      (candidate) =>
        candidate.email === email.trim().toLowerCase() &&
        candidate.deletedAt === null,
    )
    if (!user) {
      return {
        message:
          'Nếu email đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
      }
    }

    const now = new Date()
    for (const token of database.passwordResetTokens) {
      if (token.userId === user.id && token.consumedAt === null) {
        token.consumedAt = now.toISOString()
      }
    }

    const rawToken = createRawToken()
    database.passwordResetTokens.push({
      id: createUuidV7(),
      userId: user.id,
      tokenHash: await sha256(rawToken),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      consumedAt: null,
      createdAt: now.toISOString(),
    })
    persistDatabase(database)

    return {
      message:
        'Nếu email đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
      actionLink: createPasswordResetUrl(rawToken),
    }
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await databaseReady
    await beforeRequest()
    if (input.password.length < 8) {
      throw new ApiError('PASSWORD_WEAK', 'Password is too short.')
    }

    const database = readDatabase()
    const resetToken = findToken(
      database.passwordResetTokens,
      await sha256(input.token),
    )
    if (!resetToken) {
      throw new ApiError('TOKEN_INVALID', 'Reset token not found.')
    }
    if (resetToken.consumedAt) {
      throw new ApiError('TOKEN_USED', 'Reset token was consumed.')
    }
    if (Date.parse(resetToken.expiresAt) <= Date.now()) {
      throw new ApiError('TOKEN_EXPIRED', 'Reset token expired.')
    }

    const user = database.users.find(
      (candidate) =>
        candidate.id === resetToken.userId && candidate.deletedAt === null,
    )
    if (!user) {
      throw new ApiError('TOKEN_INVALID', 'Reset account not found.')
    }

    const now = new Date().toISOString()
    resetToken.consumedAt = now
    user.passwordHash = await hashPassword(input.password, createPasswordSalt())
    user.updatedAt = now
    for (const session of database.sessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        session.revokedAt = now
        session.updatedAt = now
      }
    }
    persistDatabase(database)
    window.localStorage.removeItem(SESSION_KEY)
  },
}
