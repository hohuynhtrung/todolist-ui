export type ApiErrorCode =
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_USED'
  | 'PASSWORD_WEAK'
  | 'MOCK_FAILURE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export class ApiError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

export function friendlyApiMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'
  }

  switch (error.code) {
    case 'EMAIL_IN_USE':
      return 'Email này đã được sử dụng. Hãy đăng nhập hoặc dùng email khác.'
    case 'INVALID_CREDENTIALS':
      return 'Email hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại.'
    case 'EMAIL_NOT_VERIFIED':
      return 'Email của bạn chưa được xác thực. Hãy kiểm tra hộp thư hoặc gửi lại email.'
    case 'ACCOUNT_LOCKED':
      return 'Tài khoản đang tạm khóa. Vui lòng liên hệ quản trị viên.'
    case 'TOKEN_INVALID':
      return 'Liên kết không hợp lệ. Hãy yêu cầu gửi một liên kết mới.'
    case 'TOKEN_EXPIRED':
      return 'Liên kết đã hết hạn. Hãy yêu cầu gửi một liên kết mới.'
    case 'TOKEN_USED':
      return 'Liên kết này đã được sử dụng. Bạn có thể tiếp tục đăng nhập.'
    case 'PASSWORD_WEAK':
      return 'Mật khẩu mới cần có ít nhất 8 ký tự.'
    case 'MOCK_FAILURE':
      return 'Không thể kết nối lúc này. Vui lòng thử lại.'
    case 'NETWORK_ERROR':
      return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.'
    case 'UNKNOWN':
      return error.message
  }
}
