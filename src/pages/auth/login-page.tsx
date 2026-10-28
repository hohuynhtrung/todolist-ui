import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-auth'
import { authQueryKey } from '@/hooks/use-auth'
import { authApi } from '@/services/api/auth'
import { friendlyApiMessage } from '@/services/api/errors'
import type { AuthResult } from '@/types/auth'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const loginSchema = z.object({
  email: z.string().trim().email('Hãy nhập địa chỉ email hợp lệ.'),
  password: z.string().min(1, 'Hãy nhập mật khẩu của bạn.'),
})

type LoginValues = z.infer<typeof loginSchema>

interface LoginLocationState {
  from?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [formError, setFormError] = useState('')
  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (result: AuthResult) => {
      await queryClient.cancelQueries({ queryKey: authQueryKey })
      queryClient.setQueryData(authQueryKey, result)
      const state = location.state as LoginLocationState | null
      navigate(state?.from || '/app/inbox', { replace: true })
    },
    onError: (error: unknown) => setFormError(friendlyApiMessage(error)),
  })
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (currentUser.data) {
    return <Navigate replace to="/app/inbox" />
  }

  return (
    <AuthLayout
      description="Đăng nhập để tiếp tục sắp xếp công việc theo nhịp riêng của bạn."
      eyebrow="Chào mừng trở lại"
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link
            className="font-semibold text-accent transition hover:underline"
            to="/register"
          >
            Tạo tài khoản
          </Link>
        </>
      }
      title="Đăng nhập"
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={handleSubmit((values) => {
          setFormError('')
          login.mutate(values)
        })}
      >
        {formError && (
          <div
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-5 text-destructive"
            role="alert"
          >
            <p>{formError}</p>
            {formError.includes('chưa được xác thực') && (
              <Link
                className="mt-1 inline-block font-semibold underline underline-offset-2"
                to={`/verify-email?email=${encodeURIComponent(
                  getValues('email'),
                )}`}
              >
                Gửi lại email xác thực
              </Link>
            )}
          </div>
        )}
        <FormField<LoginValues>
          autoComplete="email"
          autoFocus
          error={errors.email}
          label="Email"
          name="email"
          placeholder="ban@vidu.com"
          register={register}
          type="email"
        />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label
              className="text-[13px] font-medium text-ink"
              htmlFor="password"
            >
              Mật khẩu
            </label>
            <Link
              className="rounded text-xs font-medium text-accent transition hover:underline"
              to="/forgot-password"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <FormField<LoginValues>
            autoComplete="current-password"
            error={errors.password}
            label=""
            name="password"
            placeholder="Nhập mật khẩu"
            register={register}
            type="password"
          />
        </div>
        <Button
          className="h-11 w-full justify-center rounded-lg text-sm"
          disabled={login.isPending}
          type="submit"
        >
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          {!login.isPending && <ArrowRight aria-hidden="true" size={16} />}
        </Button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 rounded-lg bg-sidebar/70 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-forest"
          size={16}
        />
        <p>Thông tin đăng nhập được bảo vệ và chỉ dùng cho không gian của bạn.</p>
      </div>

      {import.meta.env.VITE_USE_MOCK !== 'false' && (
        <div className="mt-5 rounded-lg border border-line bg-surface px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <p className="font-semibold text-ink">Dùng thử không gian mẫu</p>
          <p className="mt-1">demo@nep.local · NepDemo2026!</p>
          <p>admin@nep.local · NepAdmin2026!</p>
        </div>
      )}
    </AuthLayout>
  )
}
