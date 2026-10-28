import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, MailCheck, Send } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/auth-layout'
import { FormField } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { authApi } from '@/services/api/auth'
import { friendlyApiMessage } from '@/services/api/errors'
import { useMutation } from '@tanstack/react-query'

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Hãy nhập địa chỉ email hợp lệ.'),
})

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordPage() {
  const [actionLink, setActionLink] = useState('')
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false'
  const requestReset = useMutation({
    mutationFn: (email: string) => authApi.requestPasswordReset(email),
    onSuccess: (result) => setActionLink(result.actionLink ?? ''),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  return (
    <AuthLayout
      description="Nhập email bạn dùng để đăng ký. Chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu."
      eyebrow="Khôi phục quyền truy cập"
      title="Quên mật khẩu?"
    >
      {requestReset.isSuccess ? (
        <div className="rounded-xl border border-forest/20 bg-forest/5 p-5">
          <span className="flex size-10 items-center justify-center rounded-full bg-forest/10 text-forest">
            <MailCheck aria-hidden="true" size={20} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-ink">
            Kiểm tra hộp thư
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {requestReset.data.message}
          </p>
          {isMock && actionLink && (
            <div className="mt-5 rounded-lg border border-dashed border-accent/40 bg-accent-soft/50 p-4 text-xs leading-5">
              <p className="font-semibold text-ink">
                Liên kết mô phỏng để kiểm thử
              </p>
              <Link
                className="mt-1 inline-block break-all font-medium text-accent underline underline-offset-2"
                to={actionLink.replace(window.location.origin, '')}
              >
                Đặt lại mật khẩu
              </Link>
            </div>
          )}
          <Button
            className="mt-5 w-full justify-center rounded-lg"
            onClick={() => requestReset.reset()}
            type="button"
            variant="outline"
          >
            Gửi lại hướng dẫn
          </Button>
        </div>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={handleSubmit((values) => requestReset.mutate(values.email))}
        >
          <FormField<ForgotPasswordValues>
            autoComplete="email"
            autoFocus
            error={errors.email}
            label="Email"
            name="email"
            placeholder="ban@vidu.com"
            register={register}
            type="email"
          />
          {requestReset.isError && (
            <p className="text-xs leading-5 text-destructive" role="alert">
              {friendlyApiMessage(requestReset.error)}
            </p>
          )}
          <Button
            className="h-11 w-full justify-center rounded-lg text-sm"
            disabled={requestReset.isPending}
            type="submit"
          >
            <Send aria-hidden="true" size={15} />
            {requestReset.isPending ? 'Đang gửi…' : 'Gửi hướng dẫn'}
          </Button>
        </form>
      )}
      <Link
        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-ink"
        to="/login"
      >
        <ArrowLeft aria-hidden="true" size={15} />
        Trở lại đăng nhập
      </Link>
    </AuthLayout>
  )
}
