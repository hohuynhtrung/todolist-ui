import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { authApi } from '@/services/api/auth'
import { friendlyApiMessage } from '@/services/api/errors'
import { ApiError } from '@/services/api/errors'
import { useMutation } from '@tanstack/react-query'

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Mật khẩu cần có ít nhất 8 ký tự.')
      .max(128, 'Mật khẩu không thể dài quá 128 ký tự.'),
    confirmPassword: z.string().min(1, 'Hãy nhập lại mật khẩu.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Hai mật khẩu chưa khớp.',
    path: ['confirmPassword'],
  })

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [complete, setComplete] = useState(false)
  const reset = useMutation({
    mutationFn: (password: string) => authApi.resetPassword({ token, password }),
    onSuccess: () => setComplete(true),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const resetError =
    reset.error instanceof ApiError
      ? reset.error
      : reset.isError
        ? reset.error
        : null
  const tokenExpired =
    reset.error instanceof ApiError && reset.error.code === 'TOKEN_EXPIRED'

  return (
    <AuthLayout
      description="Chọn một mật khẩu mới để tiếp tục sử dụng không gian của bạn."
      eyebrow="Bảo vệ tài khoản"
      title={complete ? 'Đã đổi mật khẩu' : 'Đặt lại mật khẩu'}
    >
      {complete ? (
        <div className="rounded-xl border border-forest/20 bg-forest/5 p-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <KeyRound aria-hidden="true" size={19} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">
            Mật khẩu đã được cập nhật
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Các phiên đăng nhập trước đã kết thúc. Hãy đăng nhập lại bằng mật
            khẩu mới.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            to="/login"
          >
            Đến đăng nhập
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
      ) : !token || tokenExpired ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {tokenExpired
              ? 'Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu một liên kết mới.'
              : 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'}
          </p>
          <Link
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            to="/forgot-password"
          >
            Yêu cầu liên kết mới
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={handleSubmit((values) => reset.mutate(values.password))}
        >
          {resetError && (
            <div
              className="rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-xs leading-5 text-destructive"
              role="alert"
            >
              <p>{friendlyApiMessage(resetError)}</p>
              {reset.error instanceof ApiError &&
                reset.error.code === 'TOKEN_USED' && (
                  <Link
                    className="mt-1 inline-block font-semibold underline underline-offset-2"
                    to="/login"
                  >
                    Đến đăng nhập
                  </Link>
                )}
            </div>
          )}
          <FormField<ResetPasswordValues>
            autoComplete="new-password"
            autoFocus
            error={errors.password}
            label="Mật khẩu mới"
            name="password"
            placeholder="Ít nhất 8 ký tự"
            register={register}
            type="password"
          />
          <FormField<ResetPasswordValues>
            autoComplete="new-password"
            error={errors.confirmPassword}
            label="Nhập lại mật khẩu"
            name="confirmPassword"
            placeholder="Nhập lại mật khẩu mới"
            register={register}
            type="password"
          />
          <Button
            className="h-11 w-full justify-center rounded-lg text-sm"
            disabled={reset.isPending}
            type="submit"
          >
            {reset.isPending ? 'Đang cập nhật…' : 'Lưu mật khẩu mới'}
            {!reset.isPending && <ArrowRight aria-hidden="true" size={15} />}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
