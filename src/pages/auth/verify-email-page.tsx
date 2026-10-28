import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Mail, RefreshCw, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { authApi } from '@/services/api/auth'
import { friendlyApiMessage } from '@/services/api/errors'
import { ApiError } from '@/services/api/errors'
import { useMutation, useQuery } from '@tanstack/react-query'

const resendSchema = z.object({
  email: z.string().trim().email('Hãy nhập địa chỉ email hợp lệ.'),
})

type ResendValues = z.infer<typeof resendSchema>

interface VerifyLocationState {
  actionLink?: string
}

export function VerifyEmailPage() {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false'
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const token = searchParams.get('token')
  const initialEmail = searchParams.get('email') ?? ''
  const state = location.state as VerifyLocationState | null
  const [actionLink, setActionLink] = useState(state?.actionLink ?? '')
  const [notice, setNotice] = useState('')
  const verification = useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: () => authApi.verifyEmail(token ?? ''),
    enabled: Boolean(token),
    retry: false,
  })
  const resend = useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
    onSuccess: (result) => {
      setNotice(result.message)
      setActionLink(result.actionLink ?? '')
    },
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendValues>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: initialEmail },
  })

  const tokenError =
    verification.error instanceof ApiError
      ? verification.error.code
      : verification.isError
        ? 'UNKNOWN'
        : null
  const isExpired = tokenError === 'TOKEN_EXPIRED'
  const isUsed = tokenError === 'TOKEN_USED'
  const isVerified =
    verification.isSuccess || (Boolean(token) && isUsed)

  return (
    <AuthLayout
      description={
        token
          ? 'Hoàn tất bước xác thực để bảo vệ tài khoản và bắt đầu sử dụng.'
          : 'Kiểm tra hộp thư để tìm liên kết xác thực. Liên kết có hiệu lực trong 24 giờ.'
      }
      eyebrow="Xác thực tài khoản"
      footer={
        <>
          Đã xác thực email?{' '}
          <Link
            className="font-semibold text-accent transition hover:underline"
            to="/login"
          >
            Đăng nhập
          </Link>
        </>
      }
      title={
        isVerified
          ? 'Email đã sẵn sàng'
          : token
            ? 'Xác thực email'
            : 'Kiểm tra hộp thư'
      }
    >
      {token && verification.isPending && (
        <div
          aria-live="polite"
          className="rounded-xl border border-line bg-surface p-5 text-sm text-muted-foreground"
        >
          Đang kiểm tra liên kết…
        </div>
      )}

      {isVerified && (
        <div className="rounded-xl border border-forest/20 bg-forest/5 p-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <Check aria-hidden="true" size={20} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">
            {isUsed ? 'Email này đã được xác thực' : 'Xác thực thành công'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bạn có thể đăng nhập và bắt đầu sắp xếp công việc của mình.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            to="/login"
          >
            Đến đăng nhập
          </Link>
        </div>
      )}

      {!token && !isVerified && (
        <div className="mb-5 rounded-xl border border-line bg-surface p-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Mail aria-hidden="true" size={19} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">
            Một bước nhỏ nữa thôi
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Mở email xác thực được gửi đến{' '}
            <span className="font-medium text-ink">
              {initialEmail || 'địa chỉ bạn đã đăng ký'}
            </span>
            . Nếu chưa thấy, hãy kiểm tra thư mục quảng cáo hoặc thư rác.
          </p>
        </div>
      )}

      {tokenError && !isUsed && (
        <div
          className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3.5"
          role="alert"
        >
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-destructive"
            size={18}
          />
          <div>
            <p className="text-sm font-medium text-ink">
              {isExpired ? 'Liên kết đã hết hạn' : 'Chưa thể xác thực email'}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {friendlyApiMessage(verification.error)}
            </p>
          </div>
        </div>
      )}

      {!isVerified && (
        <>
          <form
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit((values) => {
              setNotice('')
              resend.mutate(values.email)
            })}
          >
            <FormField<ResendValues>
              autoComplete="email"
              error={errors.email}
              label="Gửi lại đến email"
              name="email"
              placeholder="ban@vidu.com"
              register={register}
              type="email"
            />
            {(notice || resend.isError) && (
              <p
                className={`text-xs leading-5 ${resend.isError ? 'text-destructive' : 'text-forest'}`}
                role={resend.isError ? 'alert' : 'status'}
              >
                {resend.isError
                  ? friendlyApiMessage(resend.error)
                  : notice}
              </p>
            )}
            <Button
              className="h-11 w-full justify-center rounded-lg text-sm"
              disabled={resend.isPending}
              type="submit"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" size={15} />
              {resend.isPending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
            </Button>
          </form>

          {isMock && actionLink && (
            <div className="mt-5 rounded-lg border border-dashed border-accent/40 bg-accent-soft/50 p-4 text-xs leading-5">
              <p className="font-semibold text-ink">
                Liên kết mô phỏng để kiểm thử
              </p>
              <a
                className="mt-1 inline-block break-all font-medium text-accent underline underline-offset-2"
                href={actionLink}
              >
                Xác thực email
              </a>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  )
}
